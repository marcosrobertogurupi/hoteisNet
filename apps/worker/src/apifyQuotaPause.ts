import type { PrismaClient } from "@prisma/client";
import { sendPlatformWhatsApp } from "./uazapiSend";
import { APIFY_ACCOUNT_BLOCKED_ERROR_TYPE } from "./reviewConnectors/apifyErrors";

// Pausa global das coletas de reviews via Apify quando a conta da plataforma estoura a cota mensal
// (HTTP 403 `platform-feature-disabled`, ver reviewConnectors/apifyErrors.ts). Incidente real de
// 22-24/09/2026: com a cota estourada, cada ciclo de 30min do cron tentava de novo todo conector
// Apify — 96 ReviewSyncJob falhos por dia, sem nenhum aviso ao dono da plataforma, e os conectores
// ainda caminhavam para fora da janela de retry de 72h (ficariam parados para sempre mesmo depois da
// cota voltar). Checagem 100% determinística (sem IA, ver memória
// background-agent-checks-must-be-token-free).
//
// Estado guardado na trilha PlatformAuditLog (sem tabela nova): cada (re)pausa grava um
// APIFY_QUOTA_PAUSED com a data de retomada em details.pausedUntil; a primeira coleta via Apify que
// funcionar depois disso grava APIFY_QUOTA_RESUMED e encerra o "episódio". O WhatsApp para
// PLATFORM_ALERT_PHONE sai UMA vez, na abertura do episódio — as re-pausas dos retestes seguintes são
// silenciosas (mesmo padrão de dedup via PlatformAuditLog de saasMonitor.ts).

const PAUSED_ACTION = "APIFY_QUOTA_PAUSED";
const RESUMED_ACTION = "APIFY_QUOTA_RESUMED";
// Reteste com backoff fixo, nunca a cada ciclo (memória no-unbounded-retry-loops): passado esse
// prazo, a próxima coleta Apify devida serve de sonda — uma chamada recusada pela Apify por cota não
// roda o ator nem é cobrada. Se a cota continuar estourada, pausa por mais 12h: 2 tentativas por dia
// no total, contra ~48 por conector antes. Mesmo intervalo da cadência normal de coleta
// (MIN_SYNC_INTERVAL_MINUTES em reviewsSync.ts), então aumentar o limite/plano no console da Apify
// faz as coletas voltarem sem atraso além do normal. Se a Apify informar que o ciclo mensal vira
// antes disso, a pausa termina já na virada.
const QUOTA_RECHECK_HOURS = 12;
// Episódio sem nenhuma re-pausa há mais que isso é tratado como encerrado (ex.: não sobrou conector
// Apify para servir de sonda) — senão um episódio "aberto" para sempre engoliria o aviso da próxima
// vez que a cota estourar.
const EPISODE_STALE_HOURS = 48;
const APIFY_LIMITS_TIMEOUT_MS = 10_000;
const HOUR_MS = 60 * 60 * 1000;

// Mensagem que o assinante vê no conector (Cadastros → Reviews) durante a pausa — sem termo técnico
// nem nome de fornecedor (memória no-technical-terms-in-user-facing-ui): o problema é da plataforma
// e o hotel não tem nada a fazer.
export const APIFY_PAUSED_CONNECTOR_MESSAGE =
  "Coleta pausada temporariamente — será retomada automaticamente, sem nenhuma ação necessária.";

export interface ApifyQuotaGate {
  pausedUntil: Date | null;
  episodeOpen: boolean;
}

export function isApifyPaused(gate: ApifyQuotaGate, now: Date = new Date()): boolean {
  return !!gate.pausedUntil && gate.pausedUntil > now;
}

export function formatBrazilDateTime(date: Date): string {
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function loadApifyQuotaGate(prisma: PrismaClient): Promise<ApifyQuotaGate> {
  const [lastPause, lastResume] = await Promise.all([
    prisma.platformAuditLog.findFirst({
      where: { action: PAUSED_ACTION },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, details: true },
    }),
    prisma.platformAuditLog.findFirst({
      where: { action: RESUMED_ACTION },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
  ]);

  const staleCutoff = new Date(Date.now() - EPISODE_STALE_HOURS * HOUR_MS);
  if (!lastPause || lastPause.createdAt < staleCutoff || (lastResume && lastResume.createdAt > lastPause.createdAt)) {
    return { pausedUntil: null, episodeOpen: false };
  }

  const raw = (lastPause.details as { pausedUntil?: unknown } | null)?.pausedUntil;
  const pausedUntil = typeof raw === "string" ? new Date(raw) : null;
  return { pausedUntil: pausedUntil && !isNaN(pausedUntil.getTime()) ? pausedUntil : null, episodeOpen: true };
}

interface ApifyMonthlyUsage {
  cycleEndAt: Date | null;
  usageUsd: number | null;
  maxUsageUsd: number | null;
}

// GET /v2/users/me/limits — leitura gratuita da conta (não roda ator), usada só para saber quando o
// ciclo mensal da Apify vira (não coincide com o mês do calendário: conta a partir da data de
// assinatura) e quanto foi gasto, para o aviso. Best-effort: qualquer falha devolve null e a pausa
// segue só pelo backoff de QUOTA_RECHECK_HOURS.
async function fetchApifyMonthlyUsage(): Promise<ApifyMonthlyUsage | null> {
  const token = process.env.APIFY_TOKEN || "";
  if (!token) return null;
  try {
    const response = await fetch("https://api.apify.com/v2/users/me/limits", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(APIFY_LIMITS_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = ((await response.json()) as any)?.data;
    const cycleEndAt = data?.monthlyUsageCycle?.endAt ? new Date(data.monthlyUsageCycle.endAt) : null;
    return {
      cycleEndAt: cycleEndAt && !isNaN(cycleEndAt.getTime()) ? cycleEndAt : null,
      usageUsd: typeof data?.current?.monthlyUsageUsd === "number" ? data.current.monthlyUsageUsd : null,
      maxUsageUsd: typeof data?.limits?.maxMonthlyUsageUsd === "number" ? data.limits.maxMonthlyUsageUsd : null,
    };
  } catch {
    return null;
  }
}

function formatUsd(value: number): string {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Extrai a frase da Apify ("Monthly usage hard limit exceeded") do corpo JSON gravado no erro.
function extractApifyMessage(errorMessage: string): string | null {
  return errorMessage.match(/"message"\s*:\s*"([^"]+)"/)?.[1] ?? null;
}

// Abre (ou estende) a pausa. Atualiza o gate em memória antes de qualquer I/O para o ciclo atual
// parar de chamar a Apify mesmo que a gravação no banco falhe.
export async function pauseApifyForQuota(
  prisma: PrismaClient,
  gate: ApifyQuotaGate,
  trigger: { tenantId: string; channel: string; errorMessage: string }
): Promise<void> {
  const now = new Date();
  const isNewEpisode = !gate.episodeOpen;
  const recheckAt = new Date(now.getTime() + QUOTA_RECHECK_HOURS * HOUR_MS);
  gate.pausedUntil = recheckAt;
  gate.episodeOpen = true;

  const usage = await fetchApifyMonthlyUsage();
  const pausedUntil =
    usage?.cycleEndAt && usage.cycleEndAt > now && usage.cycleEndAt < recheckAt ? usage.cycleEndAt : recheckAt;
  gate.pausedUntil = pausedUntil;
  const apifyMessage = extractApifyMessage(trigger.errorMessage);

  try {
    await prisma.platformAuditLog.create({
      select: { id: true },
      data: {
        actorId: "reviews-sync",
        actorName: "Sincronização de reviews",
        actorRole: "SYSTEM",
        action: PAUSED_ACTION,
        description: isNewEpisode
          ? `Cota mensal da Apify estourada — coletas de reviews via Apify pausadas até ${formatBrazilDateTime(pausedUntil)}.`
          : `Cota da Apify ainda estourada no reteste — pausa estendida até ${formatBrazilDateTime(pausedUntil)}.`,
        entityType: "Integration",
        entityId: "APIFY",
        details: {
          pausedUntil: pausedUntil.toISOString(),
          cycleEndAt: usage?.cycleEndAt?.toISOString() ?? null,
          usageUsd: usage?.usageUsd ?? null,
          maxUsageUsd: usage?.maxUsageUsd ?? null,
          apifyMessage,
          triggeredBy: { tenantId: trigger.tenantId, channel: trigger.channel },
          alerted: isNewEpisode,
        },
      },
    });
  } catch (err: any) {
    // Sem o registro, o próximo ciclo não enxerga a pausa e testaria de novo — melhor não mandar o
    // aviso agora (evita repetir o WhatsApp a cada ciclo enquanto o banco estiver com problema).
    console.error("[reviews-sync] falha ao registrar pausa da Apify:", err?.message || err);
    return;
  }

  // Conectores que já estavam em ERROR por causa da cota (antes desta pausa existir, ou pulados neste
  // ciclo) ficam com a mesma situação do conector que disparou a pausa: sem contar como erro deles e
  // com a mensagem amigável na tela do assinante.
  await prisma.reviewChannelConnector
    .updateMany({
      where: { status: "ERROR", errorMessage: { contains: APIFY_ACCOUNT_BLOCKED_ERROR_TYPE } },
      data: { status: "ACTIVE", errorMessage: APIFY_PAUSED_CONNECTOR_MESSAGE, errorCount: 0, firstErrorAt: null },
    })
    .catch((err: any) => console.error("[reviews-sync] falha ao normalizar conectores pausados:", err?.message || err));

  console.warn(
    `[reviews-sync] cota da Apify estourada — coletas via Apify pausadas até ${formatBrazilDateTime(pausedUntil)}` +
      (isNewEpisode ? " (novo episódio, avisando a plataforma)." : " (reteste, sem novo aviso).")
  );
  if (!isNewEpisode) return;

  const alertPhone = process.env.PLATFORM_ALERT_PHONE || "";
  if (!alertPhone) {
    console.error("[reviews-sync] PLATFORM_ALERT_PHONE não configurado — aviso de cota da Apify não enviado.");
    return;
  }
  const lines = [
    `⚠️ *Hoteis.Net — cota da Apify estourada*`,
    ``,
    `A conta da Apify da plataforma atingiu o limite mensal de uso${apifyMessage ? ` ("${apifyMessage}")` : ""}. As coletas de reviews via Apify (Google Maps, TripAdvisor, Booking.com, Reclame Aqui e Facebook sem OAuth) foram pausadas em todos os hotéis; Instagram e Facebook via OAuth seguem normais.`,
  ];
  if (usage?.usageUsd != null && usage.maxUsageUsd != null) {
    lines.push(``, `Uso no ciclo: US$ ${formatUsd(usage.usageUsd)} de US$ ${formatUsd(usage.maxUsageUsd)}.`);
  }
  if (usage?.cycleEndAt) {
    lines.push(`O ciclo mensal da Apify vira em ${formatBrazilDateTime(usage.cycleEndAt)}.`);
  }
  lines.push(
    ``,
    `O worker testa de novo sozinho a cada ${QUOTA_RECHECK_HOURS}h (tentativa recusada não é cobrada) e retoma assim que a cota voltar. Para retomar antes, aumente o limite ou o plano no console da Apify. Este aviso não se repete enquanto a cota continuar estourada.`
  );
  const sent = await sendPlatformWhatsApp(alertPhone, lines.join("\n"));
  if (!sent) console.error("[reviews-sync] falha ao enviar o aviso de cota da Apify por WhatsApp.");
}

// Uma coleta via Apify funcionou: se havia um episódio de cota estourada aberto, encerra (o próximo
// estouro volta a avisar). Sem WhatsApp aqui — o aviso é um só por episódio.
export async function markApifyResumed(prisma: PrismaClient, gate: ApifyQuotaGate): Promise<void> {
  if (!gate.episodeOpen) return;
  gate.episodeOpen = false;
  gate.pausedUntil = null;
  try {
    await prisma.platformAuditLog.create({
      select: { id: true },
      data: {
        actorId: "reviews-sync",
        actorName: "Sincronização de reviews",
        actorRole: "SYSTEM",
        action: RESUMED_ACTION,
        description: "Cota da Apify disponível de novo — coletas de reviews via Apify retomadas.",
        entityType: "Integration",
        entityId: "APIFY",
      },
    });
    console.log("[reviews-sync] cota da Apify disponível de novo — coletas retomadas.");
  } catch (err: any) {
    console.error("[reviews-sync] falha ao registrar retomada da Apify:", err?.message || err);
  }
}

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Chamada direta à API REST do Gemini (sem o pacote "ai"/"@ai-sdk/google") — esses pacotes são
// ESM-only e o worker compila para CommonJS puro via tsc (sem bundler), o que quebra em runtime
// com ERR_REQUIRE_ESM. O agente de atendimento em apps/web usa o SDK normalmente porque o bundler
// do Next.js resolve ESM sem problema; aqui, para uma única chamada simples de geração de texto,
// é mais robusto falar direto com a API do que lutar contra o CJS/ESM.
async function generateSummaryText(prompt: string): Promise<string> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurada.");

  // gemini-3.7-flash trava indefinidamente em generateContent (confirmado direto com curl e em
  // produção) — trocado para gemini-2.5-flash, mesma razão do agente de atendimento (ver
  // apps/web/src/lib/aiAgent/agent.ts). AbortSignal.timeout aqui é defesa adicional: sem ele, uma
  // trava do provedor prende o worker (cron a cada 15min) até o fetch nunca resolver.
  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${await response.text()}`);

  const json: any = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return text;
}

// Credenciais legadas — usadas apenas para tenants que ainda não configuraram sua própria
// instância uazapi em Configurações > API Whatsapp (tabela UazapiSetting). Mesmo padrão duplicado
// já usado em checkoutPrevision.ts/preCheckinFnrh.ts (o worker é um processo separado que não
// importa código de apps/web).
const FALLBACK_UAZAPI_SERVER = "https://netservice.uazapi.com";
const FALLBACK_UAZAPI_TOKEN = "fbe5bfbb-226a-47a2-9d1d-6b657933318c";

async function sendUazapiText(phone: string, message: string, tenantId: string): Promise<boolean> {
  let cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId } });
  const server = (setting?.serverUrl && setting?.instanceToken ? setting.serverUrl : FALLBACK_UAZAPI_SERVER).replace(/\/$/, "");
  const token = setting?.serverUrl && setting?.instanceToken ? setting.instanceToken : FALLBACK_UAZAPI_TOKEN;

  try {
    const response = await fetch(`${server}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Quanto tempo um quarto pode ficar parado em cada status antes de virar alerta.
const MAINTENANCE_STUCK_HOURS = 24;
const DIRTY_STUCK_HOURS = 6;
// Avisa de FNRH pendente de pré-check-in quando faltam menos que isso para o check-in.
const PRECHECKIN_WARNING_HOURS = 24;

type DetectedIssue = {
  issueType: string;
  entityId: string;
  description: string;
};

// Traduz o erro técnico bruto da transmissão ao SNRHos (JSON de API, código HTTP, trace_id...) para
// uma frase que faça sentido para a recepção/gerência do hotel — esse texto vai tanto para o alerta
// de WhatsApp (inclusive no fallback quando a IA de redação falha, ver composeAlertMessage) quanto
// para o sino de alerta dentro do sistema, então nunca pode vazar detalhe técnico bruto.
function friendlySnrhosFailureReason(rawError: string | null): string {
  if (rawError && /401|senha inv|usu[aá]rio ou senha/i.test(rawError)) {
    return "o acesso ao sistema do governo (SNRHos) está com usuário ou senha incorretos — atualize as credenciais em Configurações";
  }
  return "houve uma falha ao transmitir os dados ao sistema do governo (SNRHos) e as tentativas automáticas se esgotaram";
}

// Prazo legal de transmissão da FNRH (Portaria MTur nº 177/2011, reafirmado pela FNRH Digital —
// Portaria MTur nº 41/2025): cada ficha deve ser enviada em tempo real ou, no limite, até o 3º dia
// útil (quarta-feira) da semana seguinte à semana em que ocorreu a hospedagem. Devolve o instante
// em que o prazo efetivamente vence (início da quinta-feira seguinte, em Brasília) — duplicado do
// equivalente em apps/web/src/lib/snrhosClient.ts (mesmo padrão de duplicação do restante deste
// arquivo, já que o worker não importa código de apps/web).
function computeFnrhDeadlineExclusive(checkInDate: Date): Date {
  const brDateStr = checkInDate.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, d] = brDateStr.split("-").map(Number);
  const anchored = new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
  const dow = anchored.getUTCDay();
  const diffToMonday = dow === 0 ? 6 : dow - 1;
  const weekMonday = new Date(anchored);
  weekMonday.setUTCDate(weekMonday.getUTCDate() - diffToMonday);
  const deadline = new Date(weekMonday);
  deadline.setUTCDate(deadline.getUTCDate() + 9); // +7 dias (semana seguinte) + 2 dias (segunda -> quarta)
  const deadlineExclusive = new Date(deadline);
  deadlineExclusive.setUTCDate(deadlineExclusive.getUTCDate() + 1);
  return deadlineExclusive;
}

// Quanto tempo antes do prazo legal vencer o agente já deve avisar a equipe (ver
// computeFnrhDeadlineExclusive acima) — pedido explícito do assinante, mesmo valor usado tanto
// para o aviso de "vence em breve" quanto mantido para fichas que já passaram do prazo (não some
// da lista de alertas só porque a janela dos 48h ficou pra trás).
const FNRH_DEADLINE_WARNING_HOURS = 48;

async function detectIssues(tenantId: string): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];
  const now = new Date();

  // 1) FNRH pendente de envio ao SNRHos — dois motivos independentes de alerta, que podem disparar
  // juntos para o mesmo registro: (a) já esgotou as tentativas automáticas (SNRHOS_STUCK) e/ou
  // (b) o prazo legal de transmissão está a menos de FNRH_DEADLINE_WARNING_HOURS de vencer ou já
  // venceu (SNRHOS_DEADLINE_NEAR, ver computeFnrhDeadlineExclusive).
  const pendingFnrh = await prisma.fNRHRecord.findMany({
    where: { transmittedSNRHos: false, reservation: { room: { tenantId } } },
    include: { guest: { select: { fullName: true } }, reservation: { select: { checkInDate: true } } },
  });
  for (const record of pendingFnrh) {
    if (record.snrhosAttempts >= 5) {
      issues.push({
        issueType: "SNRHOS_STUCK",
        entityId: record.id,
        description: `Ficha de registro de ${record.guest.fullName} não foi enviada: ${friendlySnrhosFailureReason(record.snrhosLastError)}.`,
      });
    }

    if (record.reservation) {
      const deadlineExclusive = computeFnrhDeadlineExclusive(record.reservation.checkInDate);
      const hoursLeft = (deadlineExclusive.getTime() - now.getTime()) / (60 * 60 * 1000);
      if (hoursLeft <= FNRH_DEADLINE_WARNING_HOURS) {
        const deadlineLabel = new Date(deadlineExclusive.getTime() - 24 * 60 * 60 * 1000).toLocaleDateString("pt-BR", {
          timeZone: "America/Sao_Paulo",
          day: "2-digit",
          month: "2-digit",
        });
        const urgency =
          hoursLeft <= 0
            ? `já passou do prazo legal de envio (venceria em ${deadlineLabel})`
            : `vence em ${deadlineLabel} — restam menos de 48 horas`;
        issues.push({
          issueType: "SNRHOS_DEADLINE_NEAR",
          entityId: record.id,
          description: `Ficha de registro de ${record.guest.fullName} ainda não foi enviada ao governo e o prazo legal ${urgency}.`,
        });
      }
    }
  }

  // 2) Reserva confirmada com check-in próximo e link de pré-check-in ainda não enviado.
  const soon = new Date(now.getTime() + PRECHECKIN_WARNING_HOURS * 60 * 60 * 1000);
  const pendingPreCheckin = await prisma.reservation.findMany({
    where: {
      status: "CONFIRMED",
      preCheckinSent: false,
      checkInDate: { gte: now, lte: soon },
      room: { tenantId },
    },
  });
  for (const r of pendingPreCheckin) {
    issues.push({
      issueType: "PRECHECKIN_PENDING",
      entityId: r.id,
      description: `Reserva de ${r.guestName} (check-in em breve) ainda sem o link de pré-check-in/FNRH enviado.`,
    });
  }

  // 3) Quarto preso em manutenção há tempo demais.
  const maintenanceCutoff = new Date(now.getTime() - MAINTENANCE_STUCK_HOURS * 60 * 60 * 1000);
  const stuckMaintenance = await prisma.room.findMany({
    where: { tenantId, active: true, status: "MAINTENANCE", updatedAt: { lt: maintenanceCutoff } },
  });
  for (const room of stuckMaintenance) {
    issues.push({
      issueType: "ROOM_MAINTENANCE_STUCK",
      entityId: room.id,
      description: `Quarto ${room.number} em manutenção há mais de ${MAINTENANCE_STUCK_HOURS}h sem atualização.`,
    });
  }

  // 4) Quarto sujo (limpeza pendente) há tempo demais.
  const dirtyCutoff = new Date(now.getTime() - DIRTY_STUCK_HOURS * 60 * 60 * 1000);
  const stuckDirty = await prisma.room.findMany({
    where: { tenantId, active: true, status: "VACANT_DIRTY", updatedAt: { lt: dirtyCutoff } },
  });
  for (const room of stuckDirty) {
    issues.push({
      issueType: "ROOM_DIRTY_STUCK",
      entityId: room.id,
      description: `Quarto ${room.number} aguardando limpeza há mais de ${DIRTY_STUCK_HOURS}h.`,
    });
  }

  // 5) WhatsApp do hotel desconectado (só alerta quem já configurou uma instância alguma vez).
  const uazapi = await prisma.uazapiSetting.findUnique({ where: { tenantId } });
  if (uazapi && uazapi.serverUrl && !uazapi.connected) {
    issues.push({
      issueType: "WHATSAPP_DISCONNECTED",
      entityId: tenantId,
      description: `O WhatsApp do hotel está desconectado — é preciso reconectar em Configurações para continuar enviando mensagens automáticas.`,
    });
  }

  return issues;
}

// Compõe um resumo legível em linguagem natural só quando há algo novo a reportar — a detecção em
// si é sempre determinística (queries acima), o LLM entra só para redigir a mensagem final.
// autoActionNotes: ações que o próprio agente já tomou (modo AUTONOMOUS_LIMITED, ver
// runAutonomousActions) — o resumo deve mencioná-las para a equipe saber o que já foi feito.
async function composeAlertMessage(hotelName: string, issues: DetectedIssue[], autoActionNotes: string[] = []): Promise<string> {
  const bulletList = issues.map((i) => `- ${i.description}`).join("\n");
  const actionsList = autoActionNotes.length > 0 ? `\n\nAções que o agente já tomou automaticamente:\n${autoActionNotes.map((n) => `- ${n}`).join("\n")}` : "";
  try {
    const prompt = `Você é o agente operacional do sistema do hotel "${hotelName}". Encontrou os seguintes problemas novos que precisam de atenção da equipe:\n\n${bulletList}${actionsList}\n\nEscreva um resumo curto e direto em português do Brasil para enviar por WhatsApp à recepção/gerência, listando os pontos de forma clara. Se houver ações já tomadas automaticamente, mencione isso brevemente. Não use markdown. Não mencione que você é uma IA.`;
    const text = await generateSummaryText(prompt);
    return text.trim();
  } catch {
    // Se a chamada de IA falhar, ainda assim manda o alerta — só sem a redação natural.
    return `Alertas operacionais em ${hotelName}:\n\n${bulletList}${actionsList}`;
  }
}

// Avisa diretamente a governanta responsável pelo quarto travado, em vez de só o alerta genérico —
// só age quando há uma HousekeepingTask aberta com governanta já atribuída (senão não há quem
// avisar de forma específica, mantém só o alerta padrão). Nunca muda o status do quarto sozinho:
// quem decide que a limpeza acabou continua sendo a governanta, via o próprio app dela.
async function nudgeHousekeeperForRoom(tenantId: string, roomId: string): Promise<string | null> {
  const task = await prisma.housekeepingTask.findFirst({
    where: { tenantId, roomId, status: { in: ["PENDING", "IN_PROGRESS"] }, housekeeperId: { not: null } },
    include: { housekeeper: { select: { name: true, whatsapp: true } }, room: { select: { number: true } } },
    orderBy: { createdAt: "desc" },
  });
  if (!task?.housekeeper) return null;

  const message = `Oi ${task.housekeeper.name}! O quarto ${task.room.number} está pendente de limpeza há um bom tempo. Pode dar uma prioridade nele?`;
  const sent = await sendUazapiText(task.housekeeper.whatsapp, message, tenantId);
  if (!sent) return null;

  await prisma.auditLog.create({
    data: {
      tenantId,
      userName: "Agente de IA",
      action: "AGENT_HOUSEKEEPING_NUDGE",
      entityType: "ROOM",
      entityId: roomId,
      description: `Governanta ${task.housekeeper.name} avisada diretamente sobre o quarto ${task.room.number} parado.`,
    },
  });

  return `Avisei ${task.housekeeper.name} (governanta responsável) diretamente sobre o quarto ${task.room.number}.`;
}

// Dá uma ÚNICA chance extra de reenvio automático para uma FNRH travada no SNRHos — nunca repete
// mais que isso para o mesmo registro (verifica se já existe um AuditLog dessa ação para este
// FNRHRecord antes de agir). O pipeline automático (snrhosTransmit.ts, roda a cada 5min) já tenta
// MAX_ATTEMPTS=5 vezes por conta própria antes de um registro ser considerado "travado" — ou seja,
// quando chega até aqui o problema quase sempre é um dado inválido (CEP/documento), não uma falha
// transitória, então repetir a transmissão de novo tende a falhar pelo mesmo motivo. A ação segura
// é só resetar o contador de tentativas para o pipeline automático pegar o registro de novo no
// próximo ciclo dele — nunca chamar a transmissão diretamente daqui.
async function maybeResetSnrhosAttempts(tenantId: string, fnrhRecordId: string): Promise<string | null> {
  const alreadyTried = await prisma.auditLog.findFirst({
    where: { tenantId, action: "AGENT_FNRH_RETRY_RESET", entityId: fnrhRecordId },
  });
  if (alreadyTried) return null;

  await prisma.fNRHRecord.update({ where: { id: fnrhRecordId }, data: { snrhosAttempts: 0 } });

  await prisma.auditLog.create({
    data: {
      tenantId,
      userName: "Agente de IA",
      action: "AGENT_FNRH_RETRY_RESET",
      entityType: "FNRH_RECORD",
      entityId: fnrhRecordId,
      description: "Contador de tentativas de transmissão SNRHos resetado — mais uma chance automática de envio, única vez para este registro.",
    },
  });

  return "Tentei enviar a ficha de registro pendente novamente de forma automática.";
}

// Executa as ações autônomas seguras (modo AUTONOMOUS_LIMITED) para os problemas novos detectados,
// devolvendo notas em linguagem natural do que já foi feito, para compor o alerta. Nunca age sobre
// problemas que não têm uma ação segura definida (PRECHECKIN_PENDING, WHATSAPP_DISCONNECTED, ou
// quarto sem governanta atribuída) — esses continuam só alertando, como no modo ALERT_ONLY.
async function runAutonomousActions(tenantId: string, issues: DetectedIssue[]): Promise<string[]> {
  const notes: string[] = [];
  for (const issue of issues) {
    try {
      if (issue.issueType === "ROOM_MAINTENANCE_STUCK" || issue.issueType === "ROOM_DIRTY_STUCK") {
        const note = await nudgeHousekeeperForRoom(tenantId, issue.entityId);
        if (note) notes.push(note);
      } else if (issue.issueType === "SNRHOS_STUCK") {
        const note = await maybeResetSnrhosAttempts(tenantId, issue.entityId);
        if (note) notes.push(note);
      }
    } catch (err: any) {
      console.error(`[operational-agent] falha na ação autônoma (${issue.issueType}, ${issue.entityId}):`, err?.message || err);
    }
  }
  return notes;
}

/**
 * Roda periodicamente (agendado em index.ts). Para cada tenant com AIAgentSetting.monitoringEnabled
 * = true, detecta inconsistências operacionais (determinístico) e alerta por WhatsApp só sobre
 * problemas NOVOS (não vistos no ciclo anterior) — ver OperationalAlertLog para o dedupe.
 */
export async function runOperationalAgent(): Promise<void> {
  const settings = await prisma.aIAgentSetting.findMany({
    where: { monitoringEnabled: true, blocked: false, alertPhone: { not: null } },
    include: { tenant: { select: { id: true, name: true, tradeName: true } } },
  });
  if (settings.length === 0) return;

  for (const setting of settings) {
    try {
      const issues = await detectIssues(setting.tenantId);
      const existingLogs = await prisma.operationalAlertLog.findMany({ where: { tenantId: setting.tenantId } });
      const existingByKey = new Map(existingLogs.map((l) => [`${l.issueType}:${l.entityId}`, l]));
      const currentKeys = new Set(issues.map((i) => `${i.issueType}:${i.entityId}`));

      // Problemas resolvidos desde o último ciclo — remove o log para poder alertar de novo se
      // a mesma entidade voltar a apresentar o mesmo problema no futuro, e fecha sozinho o sino de
      // alerta correspondente (ex.: quarto sujo há +6h que a governanta já limpou) — sem isso o
      // alerta ficava pendente pra sempre esperando alguém clicar em "marcar como resolvido" mesmo
      // depois do problema já ter sumido.
      const resolvedKeys = [...existingByKey.keys()].filter((k) => !currentKeys.has(k));
      if (resolvedKeys.length > 0) {
        const resolvedIssues = resolvedKeys.map((k) => existingByKey.get(k)!);
        await prisma.operationalAlertLog.deleteMany({
          where: { tenantId: setting.tenantId, id: { in: resolvedIssues.map((l) => l.id) } },
        });
        await prisma.humanEscalation.updateMany({
          where: {
            tenantId: setting.tenantId,
            source: "OPERATIONAL_AGENT",
            resolved: false,
            OR: resolvedIssues.map((l) => ({ entityType: l.issueType, entityId: l.entityId })),
          },
          data: { resolved: true, resolvedAt: new Date() },
        });
      }

      const newIssues = issues.filter((i) => !existingByKey.has(`${i.issueType}:${i.entityId}`));
      if (newIssues.length === 0) continue;

      // Alimenta o sino de alerta visual/sonoro do Mapa de Quartos/Reservas (ver
      // apps/web/src/app/app/layout.tsx). Sem dedupe adicional aqui: newIssues já é o resultado
      // filtrado pelo OperationalAlertLog acima, então nunca repete um problema já alertado.
      await prisma.humanEscalation.createMany({
        data: newIssues.map((i) => ({
          tenantId: setting.tenantId,
          source: "OPERATIONAL_AGENT" as const,
          reason: i.description,
          entityType: i.issueType,
          entityId: i.entityId,
        })),
      });

      const autoActionNotes =
        setting.operationalAutonomyMode === "AUTONOMOUS_LIMITED" ? await runAutonomousActions(setting.tenantId, newIssues) : [];

      const hotelName = setting.tenant.tradeName || setting.tenant.name;
      const message = await composeAlertMessage(hotelName, newIssues, autoActionNotes);
      const sent = await sendUazapiText(setting.alertPhone!, message, setting.tenantId);

      if (sent) {
        await prisma.operationalAlertLog.createMany({
          data: newIssues.map((i) => ({ tenantId: setting.tenantId, issueType: i.issueType, entityId: i.entityId })),
          skipDuplicates: true,
        });
        console.log(`[operational-agent] alerta enviado — tenant=${setting.tenantId} problemas=${newIssues.length}`);
      } else {
        console.error(`[operational-agent] falha ao enviar alerta — tenant=${setting.tenantId}`);
      }
    } catch (err: any) {
      console.error(`[operational-agent] erro — tenant=${setting.tenantId}:`, err?.message || err);
    }
  }
}

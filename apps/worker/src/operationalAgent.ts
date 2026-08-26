import { PrismaClient, KnowledgeTopicKey } from "@prisma/client";

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

// Versão estruturada de generateSummaryText: pede JSON com um responseSchema fixo. Mesma API REST
// direta (o worker é CJS puro e não usa o SDK "ai"). Usada só pela verificação de valores
// desatualizados na Base de Conhecimento (runKnowledgeDrift).
async function generateStructured<T>(prompt: string, responseSchema: Record<string, unknown>): Promise<T> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurada.");

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema },
      }),
      signal: AbortSignal.timeout(45_000),
    }
  );
  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${await response.text()}`);

  const json: any = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  return JSON.parse(text) as T;
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
  const hasIssues = issues.length > 0;
  try {
    const prompt = hasIssues
      ? `Você é o agente operacional do sistema do hotel "${hotelName}". Encontrou os seguintes problemas novos que precisam de atenção da equipe:\n\n${bulletList}${actionsList}\n\nEscreva um resumo curto e direto em português do Brasil para enviar por WhatsApp à recepção/gerência, listando os pontos de forma clara. Se houver ações já tomadas automaticamente, mencione isso brevemente. Não use markdown. Não mencione que você é uma IA.`
      : `Você é o agente operacional do sistema do hotel "${hotelName}". Você tomou automaticamente as seguintes ações e precisa avisar a recepção/gerência:\n${autoActionNotes.map((n) => `- ${n}`).join("\n")}\n\nEscreva um aviso curto e direto em português do Brasil para WhatsApp. Não use markdown. Não mencione que você é uma IA.`;
    const text = await generateSummaryText(prompt);
    return text.trim();
  } catch {
    // Se a chamada de IA falhar, ainda assim manda o alerta — só sem a redação natural.
    return hasIssues
      ? `Alertas operacionais em ${hotelName}:\n\n${bulletList}${actionsList}`
      : `Ações automáticas em ${hotelName}:\n${autoActionNotes.map((n) => `- ${n}`).join("\n")}`;
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

// ─────────────────────────── Base de Conhecimento do Hotel ───────────────────────────
//
// Duas verificações, ambas só para tenants com o agente de atendimento ligado (a base só serve a ele):
//  - KNOWLEDGE_STALE: tópico já preenchido que não é revisado há mais que knowledgeReviewIntervalDays.
//    100% determinístico, só alerta.
//  - KNOWLEDGE_DRIFT: valor concreto (horário/preço/telefone/endereço) num dos 4 tópicos elegíveis
//    que contradiz o cadastro do sistema. Se knowledgeAutoRewriteEnabled + AUTONOMOUS_LIMITED, o
//    agente corrige o valor no lugar (troca mínima de um token, sempre com KnowledgeRevision +
//    AuditLog e nota no alerta); senão, apenas sinaliza. Escopo aprovado explicitamente com o
//    usuário — ver "Fase L3" em PLANO_AGENTE_IA.md.

// Só estes 4 tópicos podem ter valores corrigidos automaticamente — todos têm fonte estruturada no
// cadastro para conferir. Tópicos de política (cancelamento, regras, pets, pedidos especiais) NUNCA
// são reescritos: divergência ali, no máximo, é sinalizada por um humano.
const KB_AUTOFIX_TOPIC_KEYS: KnowledgeTopicKey[] = [
  KnowledgeTopicKey.SERVICOS_HORARIOS,
  KnowledgeTopicKey.RESERVA_PRECO,
  KnowledgeTopicKey.LOCALIZACAO_ACESSO,
  KnowledgeTopicKey.CHECKIN_CHECKOUT,
];

// Horários padrão de check-in/out — mesma constante assumida em todo o sistema quando não há
// horário definido (ver apps/web/src/lib/aiAgent/tools.ts).
const KB_DEFAULT_CHECK_IN_TIME = "14:00";
const KB_DEFAULT_CHECK_OUT_TIME = "12:00";

const KB_AUTOFIX_MAX_PER_RUN = 3; // trava de segurança: no máximo 3 correções por tenant por ciclo
const KB_DRIFT_MIN_CONFIDENCE = 0.8;
// Intervalo mínimo entre duas verificações de valores do mesmo tenant (a verificação chama o
// modelo). Em memória — se o worker reiniciar, roda de novo; sem custo de banco.
const KB_DRIFT_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const lastKbDriftCheck = new Map<string, number>();

// Pré-filtro barato: só chama o modelo se o texto tem algum token de valor concreto que poderia
// estar desatualizado (preço, horário, telefone).
const KB_VALUE_TOKEN_RE = /R\$\s?\d|\d{1,2}\s?[h:]\d{0,2}|\(\d{2}\)\s?\d|\d{4,5}-?\d{4}/;

type KnowledgeFact = { key: string; label: string; value: string };

function brl(n: number): string {
  return "R$ " + n.toFixed(2).replace(".", ",");
}

async function buildKnowledgeFacts(tenantId: string): Promise<KnowledgeFact[]> {
  const [tenant, services, cheapestTariff] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { phone: true, address: true, breakfastHours: true, breakfastHoursHoliday: true },
    }),
    prisma.hotelService.findMany({ where: { tenantId, active: true }, select: { description: true, price: true } }),
    prisma.tariff.findFirst({ where: { tenantId, active: true }, orderBy: { price: "asc" }, select: { price: true } }),
  ]);

  const facts: KnowledgeFact[] = [];
  const push = (key: string, label: string, value: string | null | undefined) => {
    if (value && value.trim()) facts.push({ key, label, value: value.trim() });
  };

  push("cafe_semana", "Horário do café da manhã (segunda a sábado)", tenant?.breakfastHours);
  push("cafe_domingo", "Horário do café da manhã (domingos e feriados)", tenant?.breakfastHoursHoliday);
  push("checkin", "Horário padrão de check-in", KB_DEFAULT_CHECK_IN_TIME);
  push("checkout", "Horário padrão de check-out", KB_DEFAULT_CHECK_OUT_TIME);
  push("telefone", "Telefone do hotel", tenant?.phone);
  push("endereco", "Endereço do hotel", tenant?.address);
  if (cheapestTariff) push("diaria_minima", "Diária a partir de", brl(Number(cheapestTariff.price)));
  services.forEach((s, i) => push(`servico_${i}`, `Preço do serviço "${s.description}"`, brl(Number(s.price))));

  return facts;
}

// KNOWLEDGE_STALE — só um tópico JÁ preenchido (tem lastReviewedAt) que passou do prazo de revisão.
// Tópico nunca preenchido não gera alerta aqui (a própria tela já sinaliza "Nunca revisado").
async function detectStaleKnowledge(tenantId: string, reviewIntervalDays: number): Promise<DetectedIssue[]> {
  const cutoff = new Date(Date.now() - Math.max(7, reviewIntervalDays) * 24 * 60 * 60 * 1000);
  const stale = await prisma.hotelKnowledgeTopic.findMany({
    where: { tenantId, active: true, lastReviewedAt: { not: null, lt: cutoff } },
    select: { id: true, title: true, lastReviewedAt: true },
  });
  return stale.map((t) => {
    const days = Math.floor((Date.now() - t.lastReviewedAt!.getTime()) / (24 * 60 * 60 * 1000));
    return {
      issueType: "KNOWLEDGE_STALE",
      entityId: t.id,
      description: `O tópico "${t.title}" da Base de Conhecimento não é revisado há ${days} dias — confira se preços, horários e políticas ainda estão corretos (Cadastros → Base de Conhecimento do Hotel).`,
    };
  });
}

type DriftDivergence = { topico: string; fato: string; valorNoTexto: string; valorCorreto: string; confianca: number };

const DRIFT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    divergencias: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topico: { type: "string" },
          fato: { type: "string" },
          valorNoTexto: { type: "string" },
          valorCorreto: { type: "string" },
          confianca: { type: "number" },
        },
        required: ["topico", "fato", "valorNoTexto", "valorCorreto", "confianca"],
      },
    },
  },
  required: ["divergencias"],
};

// KNOWLEDGE_DRIFT — o modelo só PROPÕE divergências; toda proposta passa por um portão
// determinístico antes de virar correção: valorCorreto tem que bater exatamente com um fato do
// cadastro, valorNoTexto tem que existir literalmente no texto, a troca tem que mexer pouco, e a
// confiança tem que ser alta. Sem isso, descarta. Nunca reescreve parágrafo — só troca a string.
async function runKnowledgeDrift(
  tenantId: string,
  hotelName: string,
  autoRewrite: boolean
): Promise<{ driftIssues: DetectedIssue[]; autoNotes: string[] }> {
  const driftIssues: DetectedIssue[] = [];
  const autoNotes: string[] = [];

  if ((lastKbDriftCheck.get(tenantId) ?? 0) > Date.now() - KB_DRIFT_CHECK_INTERVAL_MS) {
    return { driftIssues, autoNotes };
  }

  const topics = await prisma.hotelKnowledgeTopic.findMany({
    where: { tenantId, active: true, topicKey: { in: KB_AUTOFIX_TOPIC_KEYS } },
    select: { id: true, topicKey: true, title: true, content: true },
  });

  // Só tópicos que o hotel de fato preencheu (content vazio = não preenchido) e que têm algum
  // token de valor (preço/horário/telefone) que pode estar desatualizado.
  const filled = topics.filter((t) => t.content.trim() && KB_VALUE_TOKEN_RE.test(t.content));
  if (filled.length === 0) return { driftIssues, autoNotes };

  const facts = await buildKnowledgeFacts(tenantId);
  if (facts.length === 0) return { driftIssues, autoNotes };

  lastKbDriftCheck.set(tenantId, Date.now());

  const prompt = [
    `Você verifica se a Base de Conhecimento do hotel "${hotelName}" tem VALORES desatualizados em relação ao cadastro do sistema.`,
    ``,
    `FATOS DO CADASTRO (fonte da verdade):`,
    ...facts.map((f) => `- ${f.key}: ${f.label} = "${f.value}"`),
    ``,
    `TÓPICOS DA BASE (texto escrito pelo hotel):`,
    ...filled.map((t) => `### ${t.topicKey}\n${t.content}`),
    ``,
    `Para cada trecho de um tópico que contradiz um FATO (ex.: o texto diz "café das 8h às 9h" mas o fato diz "07:00 às 10:00"), devolva um item em "divergencias":`,
    `- topico: a chave do tópico (ex.: SERVICOS_HORARIOS)`,
    `- fato: a chave do fato correspondente (ex.: cafe_semana)`,
    `- valorNoTexto: o trecho EXATO como aparece no texto, só o valor (ex.: "8h às 9h")`,
    `- valorCorreto: o valor EXATO do fato, sem mudar a formatação`,
    `- confianca: número de 0 a 1`,
    ``,
    `Regras: só reporte divergência de VALOR concreto (horário, preço, telefone, endereço). NUNCA reporte diferença de redação, política, estilo ou informação que está apenas faltando. Se não houver divergência clara, devolva "divergencias": [].`,
  ].join("\n");

  let result: { divergencias: DriftDivergence[] };
  try {
    result = await generateStructured<{ divergencias: DriftDivergence[] }>(prompt, DRIFT_RESPONSE_SCHEMA);
  } catch (err: any) {
    console.error(`[operational-agent] verificação de valores da base falhou — tenant=${tenantId}:`, err?.message || err);
    return { driftIssues, autoNotes };
  }

  const factByKey = new Map(facts.map((f) => [f.key, f]));
  const topicByKey = new Map(filled.map((t) => [t.topicKey as string, t]));
  let applied = 0;

  for (const d of result.divergencias || []) {
    const fact = factByKey.get(d.fato);
    const topic = topicByKey.get(d.topico);
    if (!fact || !topic) continue;
    if (typeof d.confianca !== "number" || d.confianca < KB_DRIFT_MIN_CONFIDENCE) continue;
    if (d.valorCorreto.trim() !== fact.value.trim()) continue; // tem que usar o valor real do cadastro
    const stale = (d.valorNoTexto || "").trim();
    if (!stale || stale === fact.value.trim()) continue;
    if (!topic.content.includes(stale)) continue; // o valor antigo tem que existir literalmente no texto
    const newContent = topic.content.split(stale).join(fact.value);
    if (newContent === topic.content) continue;
    if (Math.abs(newContent.length - topic.content.length) > 40) continue; // troca mínima, nunca reescrita

    if (!autoRewrite || applied >= KB_AUTOFIX_MAX_PER_RUN) {
      driftIssues.push({
        issueType: "KNOWLEDGE_DRIFT",
        entityId: `${topic.id}:${d.fato}`,
        description: `A Base de Conhecimento ("${topic.title}") diz "${stale}", mas o cadastro tem "${fact.value}" (${fact.label}). Revise em Cadastros → Base de Conhecimento do Hotel.`,
      });
      continue;
    }

    try {
      await prisma.hotelKnowledgeTopic.updateMany({
        where: { id: topic.id, tenantId },
        data: { content: newContent, updatedByName: "Agente Operacional" },
      });
      await prisma.knowledgeRevision.create({
        data: {
          tenantId,
          targetType: "TOPIC",
          targetId: topic.id,
          contentBefore: topic.content,
          contentAfter: newContent,
          changeSource: "AGENT_OPERATIONAL",
          changedByName: "Agente Operacional",
          reason: `Valor desatualizado corrigido conforme o cadastro (${fact.label})`,
        },
      });
      await prisma.auditLog.create({
        data: {
          tenantId,
          userName: "Agente de IA",
          action: "AGENT_KB_UPDATE",
          entityType: "KNOWLEDGE_TOPIC",
          entityId: topic.id,
          description: `Base de Conhecimento — "${topic.title}": "${stale}" → "${fact.value}" (${fact.label}).`,
        },
      });
      topic.content = newContent; // para divergências seguintes no mesmo tópico neste ciclo
      applied++;
      autoNotes.push(`Corrigi na Base de Conhecimento ("${topic.title}"): "${stale}" → "${fact.value}". Desfaça na tela se não estiver certo.`);
    } catch (err: any) {
      console.error(`[operational-agent] falha ao corrigir valor na base — tenant=${tenantId} topico=${topic.topicKey}:`, err?.message || err);
    }
  }

  return { driftIssues, autoNotes };
}

// Teto de tentativas de envio do alerta por WhatsApp antes de desistir (o problema continua no
// sino de intervenção humana). Sem esse teto, um alerta que nunca consegue sair — ex.: o próprio
// WHATSAPP_DISCONNECTED, cujo canal de envio está fora do ar — seria re-tentado a cada ciclo pra
// sempre.
const NOTIFY_MAX_ATTEMPTS = 5;

// Trava de reentrância: node-cron não pula um disparo se o anterior ainda está rodando, e este
// ciclo chega a levar ~90s por tenant (duas chamadas de IA com timeout de 45s cada). Sem isso,
// um ciclo lento se sobrepõe ao próximo e os dois alertam o mesmo problema em duplicidade.
let operationalAgentRunning = false;

/**
 * Roda periodicamente (agendado em index.ts). Para cada tenant com AIAgentSetting.monitoringEnabled
 * = true, detecta inconsistências operacionais (determinístico) e alerta por WhatsApp só sobre
 * problemas NOVOS (não vistos no ciclo anterior) — ver OperationalAlertLog para o dedupe.
 */
export async function runOperationalAgent(): Promise<void> {
  if (operationalAgentRunning) {
    console.warn("[operational-agent] ciclo anterior ainda em execução — disparo ignorado.");
    return;
  }
  operationalAgentRunning = true;
  try {
    await runOperationalAgentInner();
  } finally {
    operationalAgentRunning = false;
  }
}

async function runOperationalAgentInner(): Promise<void> {
  const settings = await prisma.aIAgentSetting.findMany({
    where: { monitoringEnabled: true, blocked: false, alertPhone: { not: null } },
    include: { tenant: { select: { id: true, name: true, tradeName: true } } },
  });
  if (settings.length === 0) return;

  for (const setting of settings) {
    try {
      const hotelName = setting.tenant.tradeName || setting.tenant.name;
      const issues = await detectIssues(setting.tenantId);

      // Base de Conhecimento — só faz sentido para tenants com o agente de atendimento ligado (a
      // base só serve a ele). detectStaleKnowledge só alerta; runKnowledgeDrift corrige sozinho
      // apenas com o opt-in dedicado + modo AUTONOMOUS_LIMITED, senão também só sinaliza.
      let kbAutoNotes: string[] = [];
      if (setting.enabled) {
        const [staleIssues, drift] = await Promise.all([
          detectStaleKnowledge(setting.tenantId, setting.knowledgeReviewIntervalDays),
          runKnowledgeDrift(
            setting.tenantId,
            hotelName,
            setting.knowledgeAutoRewriteEnabled && setting.operationalAutonomyMode === "AUTONOMOUS_LIMITED"
          ),
        ]);
        issues.push(...staleIssues, ...drift.driftIssues);
        kbAutoNotes = drift.autoNotes;
      }

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

      // ── Reivindicação atômica do alerta ───────────────────────────────────────────────────
      // O @@unique([tenantId, issueType, entityId]) de OperationalAlertLog é a trava: quem
      // conseguir INSERIR a linha é o dono do alerta daquele problema. Isso acontece ANTES de
      // compor/enviar a mensagem (que leva ~90s entre as duas chamadas de IA), então dois ciclos
      // concorrentes — duas instâncias do worker, ou a janela de um redeploy — nunca disparam o
      // mesmo alerta duas vezes: o segundo INSERT falha com P2002 e é ignorado.
      const claimed: DetectedIssue[] = [];
      for (const issue of issues) {
        if (existingByKey.has(`${issue.issueType}:${issue.entityId}`)) continue; // já registrado — ver pendingRetry
        try {
          await prisma.operationalAlertLog.create({
            data: { tenantId: setting.tenantId, issueType: issue.issueType, entityId: issue.entityId },
          });
          claimed.push(issue);
        } catch (err: any) {
          if (err?.code === "P2002") continue; // outro ciclo já reivindicou este alerta
          throw err;
        }
      }

      // Alertas já registrados por um ciclo anterior cujo envio ao WhatsApp ainda não foi
      // confirmado (notifiedAt = null) e que não estouraram o teto — re-tenta só o envio, sem
      // recriar a escalação no sino (ela já existe).
      const pendingRetry = issues.filter((i) => {
        const log = existingByKey.get(`${i.issueType}:${i.entityId}`);
        return !!log && log.notifiedAt === null && log.notifyAttempts < NOTIFY_MAX_ATTEMPTS;
      });

      const toNotify = [...claimed, ...pendingRetry];
      if (toNotify.length === 0 && kbAutoNotes.length === 0) continue;

      // Alimenta o sino de alerta visual/sonoro do Mapa de Quartos/Reservas (ver
      // apps/web/src/app/app/layout.tsx). Só para os problemas recém-reivindicados por este ciclo,
      // e ainda assim pulando entidades que já têm uma escalação aberta (defesa extra além da
      // trava do log — cobre qualquer caminho futuro que recrie escalação).
      if (claimed.length > 0) {
        const openEscalations = await prisma.humanEscalation.findMany({
          where: {
            tenantId: setting.tenantId,
            source: "OPERATIONAL_AGENT",
            resolved: false,
            OR: claimed.map((i) => ({ entityType: i.issueType, entityId: i.entityId })),
          },
          select: { entityType: true, entityId: true },
        });
        const openSet = new Set(openEscalations.map((e) => `${e.entityType}:${e.entityId}`));
        const freshEscalations = claimed.filter((i) => !openSet.has(`${i.issueType}:${i.entityId}`));
        if (freshEscalations.length > 0) {
          await prisma.humanEscalation.createMany({
            data: freshEscalations.map((i) => ({
              tenantId: setting.tenantId,
              source: "OPERATIONAL_AGENT" as const,
              reason: i.description,
              entityType: i.issueType,
              entityId: i.entityId,
            })),
          });
        }
      }

      const autoActionNotes = [
        // Ações autônomas só para os problemas novos deste ciclo — nunca em pendingRetry (já foram
        // executadas quando o problema foi reivindicado).
        ...(setting.operationalAutonomyMode === "AUTONOMOUS_LIMITED"
          ? await runAutonomousActions(setting.tenantId, claimed)
          : []),
        ...kbAutoNotes, // correções que runKnowledgeDrift já aplicou (fora do fluxo de claimed)
      ];

      const message = await composeAlertMessage(hotelName, toNotify, autoActionNotes);
      const sent = await sendUazapiText(setting.alertPhone!, message, setting.tenantId);

      if (toNotify.length > 0) {
        const notifyWhere = {
          tenantId: setting.tenantId,
          OR: toNotify.map((i) => ({ issueType: i.issueType, entityId: i.entityId })),
        };
        if (sent) {
          await prisma.operationalAlertLog.updateMany({
            where: notifyWhere,
            data: { notifiedAt: new Date(), lastAlertedAt: new Date() },
          });
        } else {
          // Não conseguiu enviar: mantém o registro (não re-alerta o sino) e só incrementa o
          // contador. Ao atingir NOTIFY_MAX_ATTEMPTS o alerta para de tentar pelo WhatsApp — o
          // problema continua visível no sino de intervenção humana.
          await prisma.operationalAlertLog.updateMany({
            where: notifyWhere,
            data: { notifyAttempts: { increment: 1 } },
          });
        }
      }

      if (sent) {
        console.log(`[operational-agent] alerta enviado — tenant=${setting.tenantId} problemas=${toNotify.length}`);
      } else {
        console.error(`[operational-agent] falha ao enviar alerta — tenant=${setting.tenantId} (tentativa registrada)`);
      }
    } catch (err: any) {
      console.error(`[operational-agent] erro — tenant=${setting.tenantId}:`, err?.message || err);
    }
  }
}

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

  const response = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
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

async function detectIssues(tenantId: string): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = [];
  const now = new Date();

  // 1) FNRH travada na transmissão ao SNRHos (já esgotou as tentativas automáticas).
  const stuckFnrh = await prisma.fNRHRecord.findMany({
    where: { transmittedSNRHos: false, snrhosAttempts: { gte: 5 }, reservation: { room: { tenantId } } },
    include: { guest: { select: { fullName: true } } },
  });
  for (const record of stuckFnrh) {
    issues.push({
      issueType: "SNRHOS_STUCK",
      entityId: record.id,
      description: `FNRH de ${record.guest.fullName} travada no envio ao SNRHos (${record.snrhosAttempts} tentativas, erro: ${record.snrhosLastError || "desconhecido"}).`,
    });
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
      description: `A instância de WhatsApp do hotel está desconectada (status: ${uazapi.status}).`,
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

  return "Dei mais uma chance de reenvio automático para a FNRH travada no SNRHos.";
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

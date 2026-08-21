import { PrismaClient } from "@prisma/client";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

const prisma = new PrismaClient();

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
async function composeAlertMessage(hotelName: string, issues: DetectedIssue[]): Promise<string> {
  const bulletList = issues.map((i) => `- ${i.description}`).join("\n");
  try {
    const result = await generateText({
      model: google("gemini-3.7-flash"),
      prompt: `Você é o agente operacional do sistema do hotel "${hotelName}". Encontrou os seguintes problemas novos que precisam de atenção da equipe:\n\n${bulletList}\n\nEscreva um resumo curto e direto em português do Brasil para enviar por WhatsApp à recepção/gerência, listando os pontos de forma clara. Não use markdown. Não mencione que você é uma IA.`,
    });
    return result.text.trim();
  } catch {
    // Se a chamada de IA falhar, ainda assim manda o alerta — só sem a redação natural.
    return `Alertas operacionais em ${hotelName}:\n\n${bulletList}`;
  }
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
      // a mesma entidade voltar a apresentar o mesmo problema no futuro.
      const resolvedKeys = [...existingByKey.keys()].filter((k) => !currentKeys.has(k));
      if (resolvedKeys.length > 0) {
        await prisma.operationalAlertLog.deleteMany({
          where: { tenantId: setting.tenantId, id: { in: resolvedKeys.map((k) => existingByKey.get(k)!.id) } },
        });
      }

      const newIssues = issues.filter((i) => !existingByKey.has(`${i.issueType}:${i.entityId}`));
      if (newIssues.length === 0) continue;

      const hotelName = setting.tenant.tradeName || setting.tenant.name;
      const message = await composeAlertMessage(hotelName, newIssues);
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

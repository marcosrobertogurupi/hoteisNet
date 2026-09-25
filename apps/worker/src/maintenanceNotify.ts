import { PrismaClient } from "@prisma/client";
import { sendUazapiText } from "./uazapiSend";

const prisma = new PrismaClient();

// Aviso de OS de manutenção ao colaborador, pelo WhatsApp do próprio hotel (Agente Operacional).
// A OS nasce com notifyStatus = PENDING (abertura ou reatribuição, ver apps/web/src/lib/maintenance.ts)
// e este job, a cada minuto, manda o aviso. Texto fixo, sem IA — nenhum token gasto.
//
// No máximo MAX_ATTEMPTS tentativas (espelha MAX_MAINTENANCE_NOTIFY_ATTEMPTS do web); esgotadas, a
// OS fica FAILED e a recepção vê o alerta no card do quarto e pode pedir o reenvio. Nunca um retry
// sem teto.
const MAX_ATTEMPTS = 3;
const BATCH = 20;

// Mesma base de URL dos links de pré-check-in e do funil de reviews.
function appBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function fmtBr(d: Date): string {
  return d.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Lembretes ao colaborador (Agente Operacional) ────────────────────────────────────────────
// Determinísticos, sem IA. Cada lembrete sai UMA vez por situação — o registro no log de atividades
// (AGENT_MAINTENANCE_REMINDER) é a trava: nunca vira cobrança repetida a cada ciclo.
//  - OS ainda em "Entrada" REMIND_NOT_STARTED_HOURS depois do aviso entregue.
//  - Previsão de liberação vencida com a OS ainda aberta (uma vez por previsão — se o colaborador
//    der nova previsão e ela vencer de novo, lembra de novo).
const REMIND_NOT_STARTED_HOURS = 2;
const REMINDER_ACTION = "AGENT_MAINTENANCE_REMINDER";
const REMINDER_FAILED_ACTION = "AGENT_MAINTENANCE_REMINDER_FAILED";
// Falhas de envio de um mesmo lembrete antes de desistir (ex.: WhatsApp do hotel desconectado) —
// nunca retry sem teto; o alerta à recepção (operationalAgent.ts) continua cobrindo a situação.
const REMINDER_MAX_FAILURES = 3;

// true = não tentar (já enviado, ou falhou vezes demais).
async function skipReminder(tenantId: string, ticketId: string, key: string): Promise<boolean> {
  const logs = await prisma.auditLog.findMany({
    where: {
      tenantId,
      action: { in: [REMINDER_ACTION, REMINDER_FAILED_ACTION] },
      entityId: ticketId,
      description: { contains: `[${key}]` },
    },
    select: { action: true },
    take: REMINDER_MAX_FAILURES + 1,
  });
  if (logs.some((l) => l.action === REMINDER_ACTION)) return true;
  return logs.filter((l) => l.action === REMINDER_FAILED_ACTION).length >= REMINDER_MAX_FAILURES;
}

export async function runMaintenanceReminders(): Promise<void> {
  const now = new Date();
  const notStartedCutoff = new Date(now.getTime() - REMIND_NOT_STARTED_HOURS * 60 * 60 * 1000);

  const candidates = await prisma.maintenanceTicket.findMany({
    where: {
      stage: { in: ["OPEN", "EVALUATING", "WAITING"] },
      OR: [
        { stage: "OPEN", notifyStatus: "SENT", notifiedAt: { lt: notStartedCutoff } },
        { expectedReleaseAt: { lt: now } },
      ],
    },
    take: 100,
    select: {
      id: true,
      tenantId: true,
      number: true,
      stage: true,
      description: true,
      openedAt: true,
      notifiedAt: true,
      expectedReleaseAt: true,
      room: { select: { number: true } },
      problemType: { select: { name: true } },
      assignedEmployee: { select: { id: true, name: true, phone: true, active: true } },
    },
  });

  for (const t of candidates) {
    const employee = t.assignedEmployee;
    const phone = employee.phone?.trim();
    if (!phone || !employee.active) continue;
    const link = `${appBaseUrl()}/manutencao/os/${t.id}`;

    const reminders: { key: string; text: string }[] = [];
    if (t.stage === "OPEN" && t.notifiedAt && t.notifiedAt < notStartedCutoff) {
      reminders.push({
        key: "nao-iniciada",
        text: [
          `🔧 *Lembrete — Quarto ${t.room.number}*`,
          `A OS nº ${t.number} (${t.problemType.name}: ${t.description}) está aberta desde ${fmtBr(t.openedAt)} e ainda não foi iniciada.`,
          ``,
          `${employee.name}, quando começar, registre no app:`,
          link,
        ].join("\n"),
      });
    }
    if (t.expectedReleaseAt && t.expectedReleaseAt < now) {
      reminders.push({
        key: `previsao-${t.expectedReleaseAt.toISOString()}`,
        text: [
          `🔧 *Quarto ${t.room.number} — previsão vencida*`,
          `A previsão de liberação da OS nº ${t.number} era ${fmtBr(t.expectedReleaseAt)} e ela ainda está aberta.`,
          ``,
          `${employee.name}, atualize o andamento no app (nova previsão ou resolvido):`,
          link,
        ].join("\n"),
      });
    }

    for (const r of reminders) {
      if (await skipReminder(t.tenantId, t.id, r.key)) continue;
      const sent = await sendUazapiText(prisma, phone, r.text, t.tenantId);
      await prisma.auditLog.create({
        data: {
          tenantId: t.tenantId,
          userName: "Agente Operacional",
          action: sent ? REMINDER_ACTION : REMINDER_FAILED_ACTION,
          entityType: "MAINTENANCE_TICKET",
          entityId: t.id,
          description: sent
            ? `Lembrete [${r.key}] da OS nº ${t.number} (quarto ${t.room.number}) enviado por WhatsApp para ${employee.name}.`
            : `Falha ao enviar o lembrete [${r.key}] da OS nº ${t.number} (quarto ${t.room.number}) para ${employee.name}.`,
          details: { employeeId: employee.id, key: r.key, sent },
        },
      });
    }
  }
}

export async function runMaintenanceNotify(): Promise<void> {
  const pending = await prisma.maintenanceTicket.findMany({
    where: {
      notifyStatus: "PENDING",
      notifyAttempts: { lt: MAX_ATTEMPTS },
      stage: { in: ["OPEN", "EVALUATING", "WAITING"] },
    },
    orderBy: { updatedAt: "asc" },
    take: BATCH,
    select: {
      id: true,
      tenantId: true,
      number: true,
      description: true,
      openedAt: true,
      openedByName: true,
      expectedReleaseAt: true,
      notifyAttempts: true,
      room: { select: { number: true } },
      problemType: { select: { name: true } },
      assignedEmployee: { select: { id: true, name: true, phone: true, active: true } },
      tenant: { select: { name: true } },
    },
  });

  for (const t of pending) {
    // "Reserva" a tentativa antes de enviar: se outra execução do job (cron sobreposto) já pegou
    // esta OS, o contador mudou e esta passa adiante — evita aviso duplicado.
    const claimed = await prisma.maintenanceTicket.updateMany({
      where: { id: t.id, notifyStatus: "PENDING", notifyAttempts: t.notifyAttempts },
      data: { notifyAttempts: t.notifyAttempts + 1 },
    });
    if (claimed.count === 0) continue;
    const attempt = t.notifyAttempts + 1;

    const employee = t.assignedEmployee;
    const phone = employee.phone?.trim();
    let sent = false;
    if (phone && employee.active) {
      const lines = [
        `🔧 *Manutenção — Quarto ${t.room.number}*`,
        t.tenant?.name ? `${t.tenant.name}` : null,
        ``,
        `OS nº ${t.number} · ${t.problemType.name}`,
        `Problema: ${t.description}`,
        `Aberta por ${t.openedByName} em ${fmtBr(t.openedAt)}`,
        t.expectedReleaseAt ? `Previsão de liberação: ${fmtBr(t.expectedReleaseAt)}` : null,
        ``,
        `${employee.name}, você é o responsável por esta ordem de serviço.`,
        `Registre o andamento e as fotos no app de manutenção:`,
        `${appBaseUrl()}/manutencao/os/${t.id}`,
      ].filter((l): l is string => l !== null);
      sent = await sendUazapiText(prisma, phone, lines.join("\n"), t.tenantId);
    }

    if (sent) {
      await prisma.maintenanceTicket.updateMany({
        where: { id: t.id, notifyStatus: "PENDING" },
        data: { notifyStatus: "SENT", notifiedAt: new Date() },
      });
    } else if (attempt >= MAX_ATTEMPTS) {
      await prisma.maintenanceTicket.updateMany({
        where: { id: t.id, notifyStatus: "PENDING" },
        data: { notifyStatus: "FAILED" },
      });
    }

    await prisma.auditLog.create({
      data: {
        tenantId: t.tenantId,
        userName: "Agente Operacional",
        action: "AGENT_MAINTENANCE_NOTICE",
        entityType: "MAINTENANCE_TICKET",
        entityId: t.id,
        description: sent
          ? `Aviso da OS nº ${t.number} (quarto ${t.room.number}) enviado por WhatsApp para ${employee.name}.`
          : `Falha ao enviar o aviso da OS nº ${t.number} (quarto ${t.room.number}) para ${employee.name} — tentativa ${attempt} de ${MAX_ATTEMPTS}.`,
        details: { employeeId: employee.id, attempt, sent },
      },
    });
  }
}

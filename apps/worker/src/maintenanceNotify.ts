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

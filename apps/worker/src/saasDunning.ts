import { PrismaClient } from "@prisma/client";
import { sendPlatformWhatsApp } from "./uazapiSend";

const prisma = new PrismaClient();

// Régua de inadimplência do SaaS — cron determinístico (sem IA, ver memória
// background-agent-checks-must-be-token-free). Decisão D6 do PLANO_PAINEL_ADMIN.md:
//   +15 dias de atraso  → status OVERDUE + aviso (uma vez)
//   +30 dias de atraso  → status SUSPENDED (corta o acesso via getSessionUser)
//
// "Atraso" = hoje além de Tenant.accessValidUntil (a data "pago até", alimentada pelos webhooks
// do Asaas). O webhook zera dunningStage quando um pagamento entra, então a assinatura volta
// sozinha para o começo da régua.

const WARN_DAYS = 15;
const SUSPEND_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function daysOverdue(accessValidUntil: Date): number {
  return Math.floor((Date.now() - accessValidUntil.getTime()) / DAY_MS);
}

export async function runSaasDunning(): Promise<void> {
  const subs = await prisma.saASSubscription.findMany({
    where: {
      active: true,
      tenant: { status: { in: ["TRIAL", "ACTIVE", "OVERDUE"] } },
    },
    select: {
      id: true,
      tenantId: true,
      dunningStage: true,
      tenant: { select: { name: true, tradeName: true, phone: true, accessValidUntil: true, status: true } },
    },
  });

  for (const sub of subs) {
    const t = sub.tenant;
    if (!t.accessValidUntil) continue; // sem data "pago até" definida — nada a cobrar

    const overdue = daysOverdue(t.accessValidUntil);
    const label = t.tradeName || t.name;

    try {
      if (overdue >= SUSPEND_DAYS && sub.dunningStage !== "SUSPENDED_30") {
        await prisma.$transaction([
          prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: "SUSPENDED" } }),
          prisma.saASSubscription.update({
            where: { id: sub.id },
            data: { dunningStage: "SUSPENDED_30", dunningNotifiedAt: new Date() },
          }),
          prisma.platformAuditLog.create({
            data: {
              actorId: "saas-dunning",
              actorName: "Régua de inadimplência",
              actorRole: "SYSTEM",
              action: "BILLING_TENANT_SUSPENDED",
              description: `${label} suspenso automaticamente — ${overdue} dias de atraso.`,
              targetTenantId: sub.tenantId,
              entityType: "Tenant",
              entityId: sub.tenantId,
            },
          }),
        ]);
        if (t.phone) {
          await sendPlatformWhatsApp(
            t.phone,
            `*Hoteis.Net — acesso suspenso*\n\nO acesso do ${label} foi suspenso por falta de pagamento (${overdue} dias em atraso). Regularize a fatura em aberto para reativar imediatamente. Precisando de ajuda, é só responder esta mensagem.`
          );
        }
        console.log(`[dunning] ${label} SUSPENSO (${overdue}d)`);
      } else if (overdue >= WARN_DAYS && overdue < SUSPEND_DAYS && sub.dunningStage !== "WARNED_15" && sub.dunningStage !== "SUSPENDED_30") {
        await prisma.$transaction([
          prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: "OVERDUE" } }),
          prisma.saASSubscription.update({
            where: { id: sub.id },
            data: { dunningStage: "WARNED_15", dunningNotifiedAt: new Date() },
          }),
          prisma.platformAuditLog.create({
            data: {
              actorId: "saas-dunning",
              actorName: "Régua de inadimplência",
              actorRole: "SYSTEM",
              action: "BILLING_TENANT_OVERDUE_WARNED",
              description: `${label} marcado como inadimplente e avisado — ${overdue} dias de atraso.`,
              targetTenantId: sub.tenantId,
              entityType: "Tenant",
              entityId: sub.tenantId,
            },
          }),
        ]);
        if (t.phone) {
          await sendPlatformWhatsApp(
            t.phone,
            `*Hoteis.Net — fatura em atraso*\n\nIdentificamos que a assinatura do ${label} está com ${overdue} dias de atraso. O acesso continua liberado, mas será *suspenso automaticamente aos 30 dias* de atraso. Regularize a fatura em aberto para evitar a interrupção.`
          );
        }
        console.log(`[dunning] ${label} OVERDUE avisado (${overdue}d)`);
      }
    } catch (err: any) {
      console.error(`[dunning] erro processando ${label}:`, err?.message || err);
    }
  }
}

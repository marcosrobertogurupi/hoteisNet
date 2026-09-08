import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { mapAsaasStatus } from "@/lib/asaas";
import { logPlatformAction } from "@/lib/platformAudit";

// POST /api/asaas/webhook/[secret] — recebe os eventos de pagamento do Asaas e mantém as faturas
// (SaaSInvoice) e o acesso do assinante (Tenant.accessValidUntil / status) em dia.
//
// Autenticação (CLAUDE.md §5): um SEGREDO compartilhado, comparado timing-safe — nunca só o id
// da URL. O segredo vem tanto no path [secret] quanto no header `asaas-access-token` que o Asaas
// envia (configurado no painel do Asaas). Exigimos o match do path; se o header vier, ele também
// tem que bater. Sem ASAAS_WEBHOOK_SECRET no ambiente, o webhook recusa tudo.
function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

const CYCLE_MONTHS: Record<string, number> = { MONTHLY: 1, SEMIANNUAL: 6, ANNUAL: 12 };

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ secret: string }> }) {
  const expected = process.env.ASAAS_WEBHOOK_SECRET || "";
  const { secret } = await params;
  if (!expected || !safeEqual(secret, expected)) {
    return NextResponse.json({ success: false, error: "Segredo inválido." }, { status: 401 });
  }
  const headerToken = req.headers.get("asaas-access-token");
  if (headerToken && !safeEqual(headerToken, expected)) {
    return NextResponse.json({ success: false, error: "Token de webhook inválido." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const event: string = payload?.event || "";
  const p = payload?.payment;
  if (!event.startsWith("PAYMENT_") || !p?.id) {
    // Eventos que não são de pagamento (ex.: de transferência) são só confirmados e ignorados.
    return NextResponse.json({ success: true, ignored: true });
  }

  try {
    // --- Localiza a assinatura / o assinante deste pagamento ---
    let sub = p.subscription
      ? await prisma.saASSubscription.findFirst({
          where: { asaasSubscriptionId: p.subscription },
          select: { id: true, tenantId: true, cycle: true, nextBilling: true, active: true },
        })
      : null;

    if (!sub && p.externalReference) {
      sub = await prisma.saASSubscription.findFirst({
        where: { tenantId: p.externalReference, active: true },
        select: { id: true, tenantId: true, cycle: true, nextBilling: true, active: true },
      });
    }
    if (!sub && p.customer) {
      const t = await prisma.tenant.findFirst({ where: { asaasCustomerId: p.customer }, select: { id: true } });
      if (t) {
        sub = await prisma.saASSubscription.findFirst({
          where: { tenantId: t.id, active: true },
          select: { id: true, tenantId: true, cycle: true, nextBilling: true, active: true },
        });
      }
    }

    if (!sub) {
      console.warn("[asaas webhook] pagamento sem assinante identificável:", p.id, p.customer, p.externalReference);
      return NextResponse.json({ success: true, unmatched: true });
    }

    const status = mapAsaasStatus(p.status || "");
    const paid = status === "CONFIRMED" || status === "RECEIVED";
    const paidAt = paid ? (p.paymentDate ? new Date(p.paymentDate) : new Date()) : null;
    const dueDate = p.dueDate ? new Date(p.dueDate) : new Date();

    // Idempotência: só estende o acesso quando a fatura ESTÁ ENTRANDO num estado pago agora —
    // uma reentrega do mesmo evento (mesmo asaasPaymentId já pago) não estende de novo.
    const existing = await prisma.saaSInvoice.findUnique({
      where: { asaasPaymentId: p.id },
      select: { status: true },
    });
    const alreadyPaid = existing?.status === "CONFIRMED" || existing?.status === "RECEIVED";
    const shouldExtendAccess = paid && !alreadyPaid;

    // --- Espelha a fatura (upsert por asaasPaymentId) ---
    await prisma.saaSInvoice.upsert({
      where: { asaasPaymentId: p.id },
      create: {
        tenantId: sub.tenantId,
        subscriptionId: sub.id,
        asaasPaymentId: p.id,
        cycle: sub.cycle,
        amount: Number(p.value) || 0,
        billingType: p.billingType || null,
        status,
        dueDate,
        paidAt,
        invoiceUrl: p.invoiceUrl || null,
        bankSlipUrl: p.bankSlipUrl || null,
        description: `Evento ${event}`,
      },
      update: {
        status,
        paidAt,
        dueDate,
        billingType: p.billingType || undefined,
        invoiceUrl: p.invoiceUrl || undefined,
        bankSlipUrl: p.bankSlipUrl || undefined,
      },
    });

    // --- Efeito no acesso do assinante ---
    if (shouldExtendAccess) {
      const months = CYCLE_MONTHS[sub.cycle] ?? 1;
      const tenant = await prisma.tenant.findUnique({
        where: { id: sub.tenantId },
        select: { accessValidUntil: true, name: true },
      });
      const base =
        tenant?.accessValidUntil && tenant.accessValidUntil > new Date() ? tenant.accessValidUntil : new Date();
      const newValidUntil = addMonths(base, months);

      await prisma.tenant.update({
        where: { id: sub.tenantId },
        data: { status: "ACTIVE", accessValidUntil: newValidUntil },
      });
      await prisma.saASSubscription.update({
        where: { id: sub.id },
        data: { nextBilling: newValidUntil },
      });

      await logPlatformAction({
        req,
        session: { userId: "asaas-webhook", name: "Asaas (webhook)", role: "SYSTEM" },
        action: "BILLING_PAYMENT_RECEIVED",
        description: `Pagamento ${status} de ${tenant?.name || sub.tenantId} — acesso estendido até ${newValidUntil.toISOString().slice(0, 10)}.`,
        targetTenantId: sub.tenantId,
        entityType: "SaaSInvoice",
        entityId: p.id,
        details: { event, value: p.value, billingType: p.billingType },
      });
    } else if (status === "OVERDUE") {
      await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: "OVERDUE" } });
    } else if (status === "CHARGEBACK" || status === "REFUNDED") {
      await prisma.tenant.update({ where: { id: sub.tenantId }, data: { status: "OVERDUE" } });
      await logPlatformAction({
        req,
        session: { userId: "asaas-webhook", name: "Asaas (webhook)", role: "SYSTEM" },
        action: status === "CHARGEBACK" ? "BILLING_CHARGEBACK" : "BILLING_REFUND",
        description: `${status} no pagamento ${p.id} do assinante ${sub.tenantId}.`,
        targetTenantId: sub.tenantId,
        entityType: "SaaSInvoice",
        entityId: p.id,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[asaas webhook] erro:", error);
    // 500 faz o Asaas re-tentar a entrega — desejável para falhas transitórias.
    return NextResponse.json({ success: false, error: "Erro ao processar evento." }, { status: 500 });
  }
}

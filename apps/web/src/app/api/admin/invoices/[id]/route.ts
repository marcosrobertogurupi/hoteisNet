import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { extendAccessForPaidSubscription } from "@/lib/saasBilling";
import { asaasEnabled, refundAsaasPayment } from "@/lib/asaas";

// PATCH /api/admin/invoices/[id] — ações manuais sobre uma fatura. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
//   { action: "markPaid" }  → baixa manual: status RECEIVED + estende o acesso do assinante
//   { action: "cancel" }    → cancela a fatura (não mexe no acesso)
//   { action: "refund" }    → estorna no Asaas (se houver asaasPaymentId) + status REFUNDED
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: { action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const invoice = await prisma.saaSInvoice.findUnique({
    where: { id },
    select: { id: true, tenantId: true, subscriptionId: true, status: true, amount: true, asaasPaymentId: true },
  });
  if (!invoice) return NextResponse.json({ success: false, error: "Fatura não encontrada." }, { status: 404 });

  const action = body.action;

  if (action === "markPaid") {
    if (invoice.status === "RECEIVED" || invoice.status === "CONFIRMED") {
      return NextResponse.json({ success: false, error: "Fatura já está paga." }, { status: 409 });
    }
    await prisma.saaSInvoice.update({
      where: { id },
      data: { status: "RECEIVED", paidAt: new Date(), manual: true },
    });
    let newValidUntil: Date | null = null;
    if (invoice.subscriptionId) newValidUntil = await extendAccessForPaidSubscription(invoice.subscriptionId);
    await logPlatformAction({
      req,
      session: session!,
      action: "BILLING_INVOICE_MARK_PAID",
      description: `Baixa manual da fatura ${id} (R$ ${Number(invoice.amount).toFixed(2)})${newValidUntil ? ` — acesso até ${newValidUntil.toISOString().slice(0, 10)}` : ""}.`,
      targetTenantId: invoice.tenantId,
      entityType: "SaaSInvoice",
      entityId: id,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "cancel") {
    await prisma.saaSInvoice.update({ where: { id }, data: { status: "CANCELLED" } });
    await logPlatformAction({
      req,
      session: session!,
      action: "BILLING_INVOICE_CANCEL",
      description: `Fatura ${id} cancelada.`,
      targetTenantId: invoice.tenantId,
      entityType: "SaaSInvoice",
      entityId: id,
    });
    return NextResponse.json({ success: true });
  }

  if (action === "refund") {
    if (invoice.asaasPaymentId && asaasEnabled()) {
      try {
        await refundAsaasPayment(invoice.asaasPaymentId);
      } catch (err: any) {
        return NextResponse.json({ success: false, error: `Asaas recusou o estorno: ${err?.message || err}` }, { status: 502 });
      }
    }
    await prisma.saaSInvoice.update({ where: { id }, data: { status: "REFUNDED" } });
    await logPlatformAction({
      req,
      session: session!,
      action: "BILLING_INVOICE_REFUND",
      description: `Fatura ${id} estornada${invoice.asaasPaymentId ? " (via Asaas)" : " (manual)"}.`,
      targetTenantId: invoice.tenantId,
      entityType: "SaaSInvoice",
      entityId: id,
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
}

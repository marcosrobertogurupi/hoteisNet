import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { asaasEnabled, createAsaasPayment, getAsaasPixPayload, type AsaasBillingType } from "@/lib/asaas";

// POST /api/admin/tenants/[id]/invoices — cobrança avulsa para um assinante. Se o Asaas estiver
// configurado e o assinante tiver cliente Asaas, gera a cobrança lá; senão cria uma fatura manual
// PENDING (para dar baixa à mão depois). Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ success: false, error: "Valor deve ser maior que zero." }, { status: 400 });
  }
  const dueDate = body.dueDate ? new Date(body.dueDate) : new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(dueDate.getTime())) {
    return NextResponse.json({ success: false, error: "Vencimento inválido." }, { status: 400 });
  }
  const description = String(body.description || "").trim() || "Cobrança avulsa Hoteis.Net";
  const billingType = (["BOLETO", "PIX", "CREDIT_CARD"].includes(String(body.billingType))
    ? String(body.billingType)
    : "UNDEFINED") as AsaasBillingType;

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    select: { id: true, name: true, asaasCustomerId: true },
  });
  if (!tenant) return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });

  let asaasPaymentId: string | null = null;
  let invoiceUrl: string | null = null;
  let bankSlipUrl: string | null = null;
  let pixPayload: string | null = null;
  let mode: "asaas" | "manual" = "manual";

  if (asaasEnabled() && tenant.asaasCustomerId) {
    try {
      const payment = await createAsaasPayment({
        customer: tenant.asaasCustomerId,
        value: amount,
        dueDate,
        billingType,
        description,
        externalReference: tenant.id,
      });
      asaasPaymentId = payment.id;
      invoiceUrl = payment.invoiceUrl || null;
      bankSlipUrl = payment.bankSlipUrl || null;
      if (billingType === "PIX") pixPayload = await getAsaasPixPayload(payment.id);
      mode = "asaas";
    } catch (err: any) {
      return NextResponse.json({ success: false, error: `Asaas recusou a cobrança: ${err?.message || err}` }, { status: 502 });
    }
  }

  const invoice = await prisma.saaSInvoice.create({
    data: {
      tenantId: tenant.id,
      asaasPaymentId,
      amount,
      billingType: billingType === "UNDEFINED" ? null : billingType,
      status: "PENDING",
      dueDate,
      invoiceUrl,
      bankSlipUrl,
      pixPayload,
      description,
      manual: mode === "manual",
    },
    select: { id: true },
  });

  await logPlatformAction({
    req,
    session: session!,
    action: "BILLING_INVOICE_MANUAL_CREATE",
    description: `Cobrança avulsa de R$ ${amount.toFixed(2)} para ${tenant.name} (${mode}).`,
    targetTenantId: tenant.id,
    entityType: "SaaSInvoice",
    entityId: invoice.id,
  });

  return NextResponse.json({ success: true, invoiceId: invoice.id, mode, invoiceUrl, bankSlipUrl });
}

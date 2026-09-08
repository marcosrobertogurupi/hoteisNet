import { prisma } from "@/lib/prisma";
import {
  asaasEnabled,
  createAsaasCustomer,
  createAsaasSubscription,
  createAsaasPayment,
  getAsaasPixPayload,
  type AsaasBillingType,
} from "@/lib/asaas";

// Provisiona a cobrança do assinante no Asaas depois que o Tenant + assinatura já existem no
// banco (fora da transação — chamada externa não segura transação de DB). Best-effort: se o
// Asaas não estiver configurado, ou o assinante não tiver CNPJ, ou a chamada falhar, o assinante
// continua criado em modo "cobrança manual" — nada quebra.
export async function provisionBillingForTenant(
  tenantId: string
): Promise<{ mode: "asaas" | "manual"; error?: string }> {
  if (!asaasEnabled()) return { mode: "manual" };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      tradeName: true,
      cnpj: true,
      email: true,
      phone: true,
      asaasCustomerId: true,
      subscriptions: {
        where: { active: true },
        orderBy: { startDate: "desc" },
        take: 1,
        select: { id: true, cycle: true, amount: true, nextBilling: true, billingType: true },
      },
    },
  });
  if (!tenant) return { mode: "manual", error: "Assinante não encontrado." };
  if (!tenant.cnpj) return { mode: "manual", error: "Assinante sem CNPJ — cobrança fica manual." };

  const sub = tenant.subscriptions[0];
  if (!sub) return { mode: "manual", error: "Assinante sem assinatura ativa." };

  try {
    let customerId = tenant.asaasCustomerId;
    if (!customerId) {
      const customer = await createAsaasCustomer({
        name: tenant.name,
        cpfCnpj: tenant.cnpj,
        email: tenant.email,
        mobilePhone: tenant.phone,
        externalReference: tenant.id,
      });
      customerId = customer.id;
      await prisma.tenant.update({ where: { id: tenant.id }, data: { asaasCustomerId: customerId } });
    }

    const billingType = (["BOLETO", "PIX", "CREDIT_CARD"].includes(sub.billingType)
      ? sub.billingType
      : "UNDEFINED") as AsaasBillingType;
    const label = tenant.tradeName || tenant.name;
    const amount = Number(sub.amount);

    if (sub.cycle === "MONTHLY") {
      const subscription = await createAsaasSubscription({
        customer: customerId,
        value: amount,
        nextDueDate: sub.nextBilling,
        billingType,
        description: `Assinatura Hoteis.Net — ${label} (mensal)`,
        externalReference: tenant.id,
      });
      await prisma.saASSubscription.update({
        where: { id: sub.id },
        data: { asaasSubscriptionId: subscription.id },
      });
      // A 1ª cobrança da assinatura chega via webhook PAYMENT_CREATED — não pré-criamos SaaSInvoice.
    } else {
      const cycleLabel = sub.cycle === "ANNUAL" ? "anual" : "semestral";
      const payment = await createAsaasPayment({
        customer: customerId,
        value: amount,
        dueDate: sub.nextBilling,
        billingType,
        description: `Assinatura Hoteis.Net — ${label} (${cycleLabel}, pagamento único)`,
        externalReference: tenant.id,
      });
      const pixPayload = billingType === "PIX" ? await getAsaasPixPayload(payment.id) : null;
      await prisma.saASSubscription.update({
        where: { id: sub.id },
        data: { asaasPaymentId: payment.id },
      });
      await prisma.saaSInvoice.create({
        data: {
          tenantId: tenant.id,
          subscriptionId: sub.id,
          asaasPaymentId: payment.id,
          cycle: sub.cycle,
          amount,
          billingType: payment.billingType || billingType,
          status: "PENDING",
          dueDate: sub.nextBilling,
          invoiceUrl: payment.invoiceUrl || null,
          bankSlipUrl: payment.bankSlipUrl || null,
          pixPayload,
          description: `Assinatura ${cycleLabel}`,
        },
      });
    }

    return { mode: "asaas" };
  } catch (err: any) {
    console.error("[saasBilling] Falha ao provisionar cobrança no Asaas:", err?.message || err);
    return { mode: "manual", error: err?.message || "Falha ao criar cobrança no Asaas." };
  }
}

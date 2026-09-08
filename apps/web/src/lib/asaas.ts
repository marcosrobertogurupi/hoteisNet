// Cliente fino da API do Asaas (gateway de pagamento — boleto / PIX / cartão), usado pelo painel
// da plataforma para cobrar os assinantes do SaaS. Decisão D2: assinatura recorrente NATIVA do
// Asaas para o ciclo mensal; pagamento único antecipado para semestral/anual (D5).
//
// Segredos SEMPRE de env, nunca hardcoded (CLAUDE.md §6):
//   ASAAS_API_KEY   — chave da conta Asaas
//   ASAAS_BASE_URL  — base da API (default sandbox); prod: https://api.asaas.com/v3
//
// Sem ASAAS_API_KEY o SaaS opera em "cobrança manual": o provisionamento não chama o Asaas, as
// faturas são lançadas/baixadas à mão no painel. Nada quebra.

const BASE_URL = process.env.ASAAS_BASE_URL || "https://api-sandbox.asaas.com/v3";
const API_KEY = process.env.ASAAS_API_KEY || "";

export function asaasEnabled(): boolean {
  return API_KEY.length > 0;
}

export class AsaasError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) {
    super(message);
    this.name = "AsaasError";
  }
}

async function asaasFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!asaasEnabled()) throw new AsaasError("ASAAS_API_KEY não configurado.", 0);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      access_token: API_KEY,
      ...(init?.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg = body?.errors?.[0]?.description || `Asaas respondeu ${res.status}`;
    throw new AsaasError(msg, res.status, body);
  }
  return body as T;
}

const yyyymmdd = (d: Date) => d.toISOString().slice(0, 10);

export type AsaasBillingType = "BOLETO" | "PIX" | "CREDIT_CARD" | "UNDEFINED";
export type AsaasCycle = "MONTHLY" | "SEMIANNUALLY" | "YEARLY";

export interface AsaasCustomer {
  id: string;
}
export interface AsaasSubscription {
  id: string;
}
export interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  dueDate: string;
  billingType: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  subscription?: string;
  customer: string;
  externalReference?: string;
}

export async function createAsaasCustomer(input: {
  name: string;
  cpfCnpj: string;
  email?: string | null;
  mobilePhone?: string | null;
  externalReference?: string;
}): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      cpfCnpj: input.cpfCnpj.replace(/\D/g, ""),
      email: input.email || undefined,
      mobilePhone: (input.mobilePhone || "").replace(/\D/g, "") || undefined,
      externalReference: input.externalReference,
      notificationDisabled: false,
    }),
  });
}

// Assinatura recorrente (ciclo mensal). O Asaas gera as cobranças e cuida do retry sozinho —
// nós só reagimos aos webhooks.
export async function createAsaasSubscription(input: {
  customer: string;
  value: number;
  nextDueDate: Date;
  billingType: AsaasBillingType;
  description: string;
  externalReference?: string;
}): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>("/subscriptions", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customer,
      billingType: input.billingType,
      value: input.value,
      nextDueDate: yyyymmdd(input.nextDueDate),
      cycle: "MONTHLY" satisfies AsaasCycle,
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
}

// Cobrança avulsa / pagamento único (semestral e anual antecipados, ou cobrança manual).
export async function createAsaasPayment(input: {
  customer: string;
  value: number;
  dueDate: Date;
  billingType: AsaasBillingType;
  description: string;
  externalReference?: string;
}): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>("/payments", {
    method: "POST",
    body: JSON.stringify({
      customer: input.customer,
      billingType: input.billingType,
      value: input.value,
      dueDate: yyyymmdd(input.dueDate),
      description: input.description,
      externalReference: input.externalReference,
    }),
  });
}

export async function getAsaasPayment(id: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${id}`);
}

export async function getAsaasPixPayload(id: string): Promise<string | null> {
  try {
    const r = await asaasFetch<{ payload?: string }>(`/payments/${id}/pixQrCode`);
    return r.payload || null;
  } catch {
    return null;
  }
}

export async function refundAsaasPayment(id: string): Promise<void> {
  await asaasFetch(`/payments/${id}/refund`, { method: "POST" });
}

// Mapeia o status cru do Asaas para o enum local SaaSInvoiceStatus.
export function mapAsaasStatus(asaasStatus: string): "PENDING" | "CONFIRMED" | "RECEIVED" | "OVERDUE" | "REFUNDED" | "CHARGEBACK" | "CANCELLED" {
  switch (asaasStatus) {
    case "CONFIRMED":
      return "CONFIRMED";
    case "RECEIVED":
    case "RECEIVED_IN_CASH":
      return "RECEIVED";
    case "OVERDUE":
      return "OVERDUE";
    case "REFUNDED":
    case "REFUND_REQUESTED":
      return "REFUNDED";
    case "CHARGEBACK_REQUESTED":
    case "CHARGEBACK_DISPUTE":
    case "AWAITING_CHARGEBACK_REVERSAL":
      return "CHARGEBACK";
    case "DELETED":
    case "CANCELLED":
      return "CANCELLED";
    default:
      return "PENDING";
  }
}

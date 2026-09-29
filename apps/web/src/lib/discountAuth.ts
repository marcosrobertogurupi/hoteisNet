import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { SessionPayload } from "@/lib/auth";
import { parseBrasiliaDateTime } from "@/lib/brasiliaDate";
import { gateCriticalEvent, releaseCriticalAuthorization, formatBRL, type AuthorizationPayload } from "@/lib/criticalAuth";

// Desconto acima do limite do assinante (Tenant.maxDiscountPercent, definido em Configurações)
// exige autorização de um AUTORIZADOR (evento crítico DESCONTO_ACIMA_LIMITE, lib/criticalAuth.ts).
// A checagem precisa ser AUTORITATIVA no servidor: a tela abre a janela de autorização, mas quem
// chama a API diretamente pula a tela inteira. Até 09/09/2026 as rotas de reserva recebiam adminEmail/adminPassword e simplesmente
// ignoravam esses campos, gravando o desconto como veio — Tenant.maxDiscountPercent era puramente
// cosmético nas reservas.
//
// O chamador informa a BASE do percentual (subtotal antes do desconto) calculada a partir de dados
// do servidor, nunca de um total enviado pelo cliente — senão bastaria inflar o subtotal no corpo
// da requisição para o desconto caber dentro do limite.

/**
 * Base do percentual de desconto de uma reserva: número de diárias × preço da tarifa do CADASTRO
 * (Tariff do próprio tenant). Recalculada no servidor porque o subtotal enviado pela tela é
 * controlado por quem chama a API. Cai para o dailyRate do corpo apenas quando a tarifa não existe
 * mais no cadastro.
 */
export async function reservationDiscountBase(
  tenantId: string,
  tariffId: string | undefined | null,
  dailyRate: unknown,
  checkInDate: string | Date,
  checkOutDate: string | Date
): Promise<number> {
  const nights = Math.max(
    1,
    Math.round((parseBrasiliaDateTime(checkOutDate).getTime() - parseBrasiliaDateTime(checkInDate).getTime()) / 86_400_000)
  );
  let unitPrice = Number(dailyRate) || 0;
  if (tariffId) {
    const tariff = await prisma.tariff.findFirst({
      where: { id: String(tariffId), tenantId },
      select: { price: true },
    });
    if (tariff) unitPrice = Number(tariff.price);
  }
  return nights * unitPrice;
}

export interface DiscountItem {
  /** Identificação opcional do item (ex.: "Reserva 2 — Fulano") quando há vários. */
  label?: string;
  /** Valor do desconto em reais. */
  discountAmount: number;
  /** Subtotal (antes do desconto) sobre o qual o percentual é calculado — dado do servidor. */
  baseAmount: number;
}

export interface DiscountAuthFailure {
  status: number;
  body: {
    success: false;
    error: string;
    precisaAutorizacao?: true;
    autorizacao?: AuthorizationPayload;
    limitePercent: number;
  };
}

export interface DiscountAuthResult {
  failure: DiscountAuthFailure | null;
  /** Presente quando algum item estava acima do limite e foi autorizado. */
  authorizedBy?: { id: string; name: string };
  authorizationId?: string;
  channel?: string;
  tenantId?: string;
}

interface AuthorizeDiscountArgs {
  /** Onde o desconto acontece: "Reserva", "Check-in", "Pagamento da hospedagem"… */
  context: string;
  items: DiscountItem[];
  /** Ids/dados que identificam a ação (reserva, quarto, datas…) — entram na impressão digital. */
  fingerprint: Record<string, unknown>;
  /** Linhas extras exibidas ao autorizador (hóspede, quarto…). */
  details?: Record<string, string>;
  authorizationId?: string | string[] | null;
}

export async function discountLimitPercent(tenantId: string): Promise<number> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { maxDiscountPercent: true },
  });
  return Number(tenant?.maxDiscountPercent ?? 20);
}

function percentOf(item: DiscountItem): number {
  const base = Number(item.baseAmount) || 0;
  // Sem base positiva, qualquer desconto é 100% — trata como acima do limite em vez de liberar.
  return base > 0 ? (Math.max(0, Number(item.discountAmount) || 0) / base) * 100 : 100;
}

/**
 * Devolve `failure: null` quando todos os descontos estão dentro do limite, ou quando os que
 * passam do limite foram autorizados (o operador é autorizador, ou reenviou com authorizationId
 * aprovado para exatamente estes valores). Caso contrário devolve a resposta 403 pronta, com a
 * solicitação de autorização criada para a tela abrir a janela.
 */
export async function authorizeDiscount(
  req: NextRequest,
  session: SessionPayload,
  { context, items, fingerprint, details, authorizationId }: AuthorizeDiscountArgs
): Promise<DiscountAuthResult> {
  const withDiscount = items.filter((i) => (Number(i.discountAmount) || 0) > 0);
  if (withDiscount.length === 0 || !session.tenantId) return { failure: null };

  const limite = await discountLimitPercent(session.tenantId);
  const over = withDiscount.filter((i) => percentOf(i) > limite + 0.001);
  if (over.length === 0) return { failure: null };

  const detailLines: Record<string, string> = { Onde: context, ...(details || {}) };
  over.forEach((i, idx) => {
    const prefix = over.length > 1 ? `${i.label || `Item ${idx + 1}`} — ` : "";
    detailLines[`${prefix}Valor sem desconto`] = formatBRL(i.baseAmount);
    detailLines[`${prefix}Desconto pedido`] = `${formatBRL(i.discountAmount)} (${percentOf(i).toFixed(1)}%)`;
  });
  detailLines["Limite permitido"] = `${limite.toFixed(1)}%`;

  const maior = Math.max(...over.map(percentOf));
  const gate = await gateCriticalEvent(req, session, {
    eventType: "DESCONTO_ACIMA_LIMITE",
    fingerprint: {
      context,
      ...fingerprint,
      items: over.map((i) => ({ d: Number(i.discountAmount) || 0, b: Number(i.baseAmount) || 0 })),
    },
    summary:
      over.length === 1
        ? `${context}: desconto de ${formatBRL(over[0].discountAmount)} (${maior.toFixed(1)}%), acima do limite de ${limite.toFixed(1)}%.`
        : `${context}: ${over.length} descontos acima do limite de ${limite.toFixed(1)}% (maior: ${maior.toFixed(1)}%).`,
    details: detailLines,
    authorizationId,
  });
  if (!gate.ok) {
    return { failure: { status: gate.status, body: { ...gate.body, limitePercent: limite } } };
  }
  return {
    failure: null,
    authorizedBy: gate.authorizedBy,
    authorizationId: gate.authorizationId,
    channel: gate.channel,
    tenantId: session.tenantId,
  };
}

/** Se a gravação falhou depois de consumir a autorização, devolve-a para uso numa nova tentativa. */
export async function releaseDiscountAuthorization(result: DiscountAuthResult | null | undefined) {
  if (!result?.tenantId || !result.authorizationId) return;
  await releaseCriticalAuthorization(result.tenantId, result.authorizationId, result.channel);
}

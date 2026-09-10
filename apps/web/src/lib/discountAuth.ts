import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyAdminStepUp } from "@/lib/adminAuth";

// Desconto acima do limite do assinante (Tenant.maxDiscountPercent, definido em Configurações)
// exige autorização de administrador. A checagem precisa ser AUTORITATIVA no servidor: a tela
// calcula o percentual e pede a senha do administrador, mas quem chama a API diretamente pula a
// tela inteira. Até 09/09/2026 as rotas de reserva recebiam adminEmail/adminPassword e simplesmente
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
    Math.round((new Date(checkOutDate).getTime() - new Date(checkInDate).getTime()) / 86_400_000)
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

export interface DiscountAuthFailure {
  status: number;
  body: {
    success: false;
    error: string;
    precisaAutorizacao: true;
    limitePercent: number;
  };
}

interface CheckDiscountArgs {
  tenantId: string;
  /** Valor do desconto em reais. */
  discountAmount: number;
  /** Subtotal (antes do desconto) sobre o qual o percentual é calculado. */
  baseAmount: number;
  adminEmail?: string;
  adminPassword?: string;
}

/**
 * Devolve `null` quando o desconto está dentro do limite ou foi autorizado por um administrador
 * do mesmo hotel; devolve o erro pronto para a rota responder quando falta autorização.
 * Quando autorizado, devolve também quem autorizou, para o registro da operação.
 */
export async function checkDiscountAuthorization(
  req: NextRequest,
  { tenantId, discountAmount, baseAmount, adminEmail, adminPassword }: CheckDiscountArgs
): Promise<{ failure: DiscountAuthFailure | null; authorizedBy?: { id: string; name: string } }> {
  const discount = Math.max(0, Number(discountAmount) || 0);
  if (discount <= 0) return { failure: null };

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { maxDiscountPercent: true },
  });
  const limite = Number(tenant?.maxDiscountPercent ?? 20);

  const base = Number(baseAmount) || 0;
  // Sem base positiva, qualquer desconto é 100% — trata como acima do limite em vez de liberar.
  const discountPercent = base > 0 ? (discount / base) * 100 : 100;

  if (discountPercent <= limite + 0.001) return { failure: null };

  const auth = await verifyAdminStepUp(req, adminEmail, adminPassword, tenantId);
  if (!auth.ok) {
    return {
      failure: {
        status: auth.status,
        body: { success: false, error: auth.error, precisaAutorizacao: true, limitePercent: limite },
      },
    };
  }

  return { failure: null, authorizedBy: { id: auth.admin.id, name: auth.admin.name } };
}

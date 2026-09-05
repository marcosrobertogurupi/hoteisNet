import type { Prisma } from "@prisma/client";

// Helpers do PDV do restaurante (Fase 1): resolução de item vendável do catálogo e recálculo
// dos totais de um atendimento (ComandaSession).

// Snapshot fiscal do item na venda. Durante a transição da Reforma Tributária, carrega os dois
// blocos: os tributos atuais (ICMS/PIS/COFINS) e o novo IBS/CBS/IS (grupo UB da NT 2025.002).
// Guarda a classificação; as alíquotas efetivas de IBS/CBS são resolvidas na emissão.
export type FiscalSnapshot = {
  fiscalProfileId: string;
  name: string;
  ncm: string;
  cfop: string;
  cest: string | null;
  origem: string;
  // Tributos atuais (transição)
  cstIcms: string | null;
  aliqIcms: number;
  redBaseIcms: number;
  csosn: string | null;
  cstPis: string;
  aliqPis: number;
  cstCofins: string;
  aliqCofins: number;
  // IBS / CBS
  cstIbsCbs: string;
  cClassTrib: string;
  pRedAliqIbsCbs: number;
  cCredPres: string | null;
  pCredPres: number;
  // Imposto Seletivo
  isIncideIs: boolean;
  cstIs: string | null;
  cClassTribIs: string | null;
  pIs: number;
};

export function fiscalSnapshotFromProfile(p: {
  id: string;
  name: string;
  ncm: string;
  cfop: string;
  cest: string | null;
  origem: string;
  cstIcms: string | null;
  aliqIcms: Prisma.Decimal | number;
  redBaseIcms: Prisma.Decimal | number;
  csosn: string | null;
  cstPis: string;
  aliqPis: Prisma.Decimal | number;
  cstCofins: string;
  aliqCofins: Prisma.Decimal | number;
  cstIbsCbs: string;
  cClassTrib: string;
  pRedAliqIbsCbs: Prisma.Decimal | number;
  cCredPres: string | null;
  pCredPres: Prisma.Decimal | number;
  isIncideIs: boolean;
  cstIs: string | null;
  cClassTribIs: string | null;
  pIs: Prisma.Decimal | number;
}): FiscalSnapshot {
  return {
    fiscalProfileId: p.id,
    name: p.name,
    ncm: p.ncm,
    cfop: p.cfop,
    cest: p.cest,
    origem: p.origem,
    cstIcms: p.cstIcms,
    aliqIcms: Number(p.aliqIcms),
    redBaseIcms: Number(p.redBaseIcms),
    csosn: p.csosn,
    cstPis: p.cstPis,
    aliqPis: Number(p.aliqPis),
    cstCofins: p.cstCofins,
    aliqCofins: Number(p.aliqCofins),
    cstIbsCbs: p.cstIbsCbs,
    cClassTrib: p.cClassTrib,
    pRedAliqIbsCbs: Number(p.pRedAliqIbsCbs),
    cCredPres: p.cCredPres,
    pCredPres: Number(p.pCredPres),
    isIncideIs: p.isIncideIs,
    cstIs: p.cstIs,
    cClassTribIs: p.cClassTribIs,
    pIs: Number(p.pIs),
  };
}

export type ResolvedItem = {
  kind: "PRATO" | "PRODUTO";
  dishId: string | null;
  productId: string | null;
  name: string;
  unitPrice: number;
  fiscalSnapshot: FiscalSnapshot | null;
};

// Resolve um item vendável (prato ou produto) pelo id explícito ou por código de barras,
// SEMPRE filtrando pelo tenant — nunca confia no id cru vindo do cliente. Retorna null se não
// achar. O perfil fiscal é opcional aqui; quem barra a venda sem perfil é a rota de fechamento.
export async function resolveSellableItem(
  tx: Prisma.TransactionClient,
  tenantId: string,
  ref: { dishId?: string | null; productId?: string | null; barcode?: string | null }
): Promise<ResolvedItem | null> {
  const profileSelect = {
    id: true,
    name: true,
    ncm: true,
    cfop: true,
    cest: true,
    origem: true,
    cstIcms: true,
    aliqIcms: true,
    redBaseIcms: true,
    csosn: true,
    cstPis: true,
    aliqPis: true,
    cstCofins: true,
    aliqCofins: true,
    cstIbsCbs: true,
    cClassTrib: true,
    pRedAliqIbsCbs: true,
    cCredPres: true,
    pCredPres: true,
    isIncideIs: true,
    cstIs: true,
    cClassTribIs: true,
    pIs: true,
  } as const;

  if (ref.dishId) {
    const d = await tx.dish.findFirst({
      where: { id: ref.dishId, tenantId, active: true },
      select: { id: true, name: true, price: true, fiscalProfile: { select: profileSelect } },
    });
    if (!d) return null;
    return {
      kind: "PRATO",
      dishId: d.id,
      productId: null,
      name: d.name,
      unitPrice: Number(d.price),
      fiscalSnapshot: d.fiscalProfile ? fiscalSnapshotFromProfile(d.fiscalProfile) : null,
    };
  }

  if (ref.productId || ref.barcode) {
    const p = await tx.product.findFirst({
      where: ref.productId
        ? { id: ref.productId, tenantId }
        : { tenantId, OR: [{ barcode: ref.barcode! }, { barcodes: { some: { code: ref.barcode! } } }] },
      select: { id: true, name: true, salePrice: true, fiscalProfile: { select: profileSelect } },
    });
    if (!p) return null;
    return {
      kind: "PRODUTO",
      dishId: null,
      productId: p.id,
      name: p.name,
      unitPrice: Number(p.salePrice),
      fiscalSnapshot: p.fiscalProfile ? fiscalSnapshotFromProfile(p.fiscalProfile) : null,
    };
  }

  return null;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// Total de um item = (preço unitário × qtd) − desconto do item, nunca negativo.
export function itemTotal(unitPrice: number, quantity: number, discount: number): number {
  return round2(Math.max(0, unitPrice * quantity - discount));
}

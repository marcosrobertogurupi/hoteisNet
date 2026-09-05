import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/pdvSale";
import type { FiscalSnapshot } from "@/lib/pdvSale";

// Monta o "payload fiscal canônico" de uma NFC-e (modelo 65) a partir de um atendimento fechado.
// É um JSON neutro que o agente .NET converte em XML via ACBr — este arquivo NÃO gera XML nem
// assina nada. Tudo que sai daqui já vem validado contra o tenant da sessão que fechou a comanda.

// Código do meio de pagamento na NFC-e (tag <tPag>).
const TPAG: Record<string, string> = {
  DINHEIRO: "01",
  CREDITO: "03",
  DEBITO: "04",
  PIX: "17",
  CONTA_QUARTO: "99", // "outros" — o valor foi lançado na conta da hospedagem
};

export interface NfcePayload {
  modelo: 65;
  serie: number;
  numero: number;
  ambiente: "HOMOLOGACAO" | "PRODUCAO";
  dhEmi: string;
  emitente: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    inscricaoEstadual: string;
    crt: string; // 1 Simples, 2 Simples excesso, 3 Regime normal
    endereco: {
      logradouro: string;
      numero: string;
      bairro: string;
      municipio: string;
      codigoMunicipioIbge: string;
      uf: string;
      cep: string;
    };
  };
  destinatario: { cpfCnpj: string } | null;
  csc: { id: string; codigo: string };
  itens: Array<{
    numero: number;
    codigo: string;
    descricao: string;
    ncm: string;
    cfop: string;
    cest: string | null;
    ean: string | null;
    unidade: string;
    quantidade: number;
    valorUnitario: number;
    valorDesconto: number;
    valorTotal: number;
    origem: string;
    // Tributos atuais — durante a transição da Reforma seguem no XML em paralelo ao grupo UB.
    icms: { cst: string | null; csosn: string | null; aliquota: number; reducaoBase: number };
    pis: { cst: string; aliquota: number };
    cofins: { cst: string; aliquota: number };
    // Grupo UB do XML (NT 2025.002): IBS + CBS. As alíquotas efetivas de IBS (UF/Município) e
    // CBS e o escalonamento da transição são calculados pelo agente/ACBr na emissão a partir da
    // classificação abaixo.
    ibsCbs: {
      cst: string;
      cClassTrib: string;
      pRedAliq: number;
      cCredPres: string | null;
      pCredPres: number;
    };
    // Imposto Seletivo — null quando não incide sobre o item.
    is: { cst: string | null; cClassTrib: string | null; aliquota: number } | null;
  }>;
  totais: { produtos: number; desconto: number; total: number };
  pagamentos: Array<{ tPag: string; valor: number }>;
  informacoesComplementares: string | null;
}

type SessionForPayload = Prisma.ComandaSessionGetPayload<{
  select: {
    id: true;
    total: true;
    discount: true;
    subtotal: true;
    cpfNota: true;
    closedAt: true;
    customerType: true;
    items: {
      select: { id: true; name: true; quantity: true; unitPrice: true; discount: true; total: true; fiscalSnapshot: true; productId: true; dishId: true; canceled: true };
    };
    payments: { select: { method: true; amount: true; kind: true } };
  };
}>;

export const SESSION_FOR_PAYLOAD_SELECT = {
  id: true,
  total: true,
  discount: true,
  subtotal: true,
  cpfNota: true,
  closedAt: true,
  customerType: true,
  items: {
    select: { id: true, name: true, quantity: true, unitPrice: true, discount: true, total: true, fiscalSnapshot: true, productId: true, dishId: true, canceled: true },
  },
  payments: { select: { method: true, amount: true, kind: true } },
} as const;

async function resolveIbgeCode(city: string | null, uf: string | null): Promise<string | null> {
  if (!city) return null;
  const name = city.trim();
  const match =
    (uf && (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" }, uf: uf.toUpperCase() }, select: { ibgeCode: true } }))) ||
    (await prisma.municipality.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { ibgeCode: true } }));
  return match?.ibgeCode ?? null;
}

function crtFromRegime(taxRegime: string | null): string {
  // MEI e Simples → CRT 1; regime normal (Presumido/Real) → CRT 3.
  if (taxRegime === "SIMPLES_NACIONAL" || taxRegime === "MEI") return "1";
  return "3";
}

export class FiscalPayloadError extends Error {}

export async function buildNfcePayload(params: {
  tenantId: string;
  session: SessionForPayload;
  serie: number;
  numero: number;
}): Promise<NfcePayload> {
  const { tenantId, session, serie, numero } = params;

  const [config, tenant] = await Promise.all([
    prisma.fiscalConfig.findUnique({
      where: { tenantId },
      select: { environment: true, nfceCscId: true, nfceCsc: true, additionalInfo: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        cnpj: true, name: true, tradeName: true, stateRegistration: true, taxRegime: true,
        street: true, number: true, neighborhood: true, city: true, state: true, zipCode: true,
      },
    }),
  ]);

  if (!config) throw new FiscalPayloadError("Configuração fiscal não preenchida (Fiscal & PDV → Configuração).");
  if (!config.nfceCscId || !config.nfceCsc) throw new FiscalPayloadError("CSC da NFC-e não configurado.");
  if (!tenant?.cnpj) throw new FiscalPayloadError("CNPJ do hotel não preenchido (Configurações → Dados do Hotel).");
  if (!tenant.stateRegistration) throw new FiscalPayloadError("Inscrição estadual do hotel não preenchida.");

  const ibge = await resolveIbgeCode(tenant.city, tenant.state);
  if (!ibge) throw new FiscalPayloadError(`Município "${tenant.city ?? "—"}/${tenant.state ?? "—"}" não encontrado na tabela do IBGE — confira o endereço do hotel.`);

  const itensAtivos = session.items.filter((it) => !it.canceled);
  if (itensAtivos.length === 0) throw new FiscalPayloadError("A comanda não tem itens.");

  const itens = itensAtivos.map((it, idx) => {
    const fs = it.fiscalSnapshot as unknown as FiscalSnapshot | null;
    if (!fs) throw new FiscalPayloadError(`O item "${it.name}" está sem perfil fiscal.`);
    return {
      numero: idx + 1,
      codigo: it.productId || it.dishId || it.id,
      descricao: it.name,
      ncm: fs.ncm,
      cfop: fs.cfop,
      cest: fs.cest,
      ean: null as string | null,
      unidade: "UN",
      quantidade: Number(it.quantity),
      valorUnitario: Number(it.unitPrice),
      valorDesconto: Number(it.discount),
      valorTotal: Number(it.total),
      origem: fs.origem,
      icms: { cst: fs.cstIcms, csosn: fs.csosn, aliquota: fs.aliqIcms, reducaoBase: fs.redBaseIcms },
      pis: { cst: fs.cstPis, aliquota: fs.aliqPis },
      cofins: { cst: fs.cstCofins, aliquota: fs.aliqCofins },
      ibsCbs: {
        cst: fs.cstIbsCbs ?? "000",
        cClassTrib: fs.cClassTrib ?? "000001",
        pRedAliq: fs.pRedAliqIbsCbs ?? 0,
        cCredPres: fs.cCredPres ?? null,
        pCredPres: fs.pCredPres ?? 0,
      },
      is: fs.isIncideIs
        ? { cst: fs.cstIs ?? null, cClassTrib: fs.cClassTribIs ?? null, aliquota: fs.pIs ?? 0 }
        : null,
    };
  });

  const produtos = round2(itens.reduce((a, i) => a + i.valorTotal, 0));
  const desconto = round2(Number(session.discount));
  const total = round2(Number(session.total));

  const pagamentos =
    session.customerType === "HOSPEDE" && session.payments.length === 0
      ? [{ tPag: TPAG.CONTA_QUARTO, valor: total }]
      : session.payments.map((p) => ({ tPag: TPAG[p.method] ?? "99", valor: Number(p.amount) }));

  return {
    modelo: 65,
    serie,
    numero,
    ambiente: config.environment,
    dhEmi: new Date().toISOString(),
    emitente: {
      cnpj: tenant.cnpj.replace(/\D/g, ""),
      razaoSocial: tenant.name,
      nomeFantasia: tenant.tradeName,
      inscricaoEstadual: tenant.stateRegistration.replace(/\D/g, ""),
      crt: crtFromRegime(tenant.taxRegime),
      endereco: {
        logradouro: tenant.street || "",
        numero: tenant.number || "S/N",
        bairro: tenant.neighborhood || "",
        municipio: tenant.city || "",
        codigoMunicipioIbge: ibge,
        uf: (tenant.state || "").toUpperCase(),
        cep: (tenant.zipCode || "").replace(/\D/g, ""),
      },
    },
    destinatario: session.cpfNota ? { cpfCnpj: session.cpfNota.replace(/\D/g, "") } : null,
    csc: { id: config.nfceCscId, codigo: config.nfceCsc },
    itens,
    totais: { produtos, desconto, total },
    pagamentos,
    informacoesComplementares: config.additionalInfo,
  };
}

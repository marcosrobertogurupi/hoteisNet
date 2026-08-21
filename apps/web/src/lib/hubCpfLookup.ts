// Consulta de CPF via Hub do Desenvolvedor, reutilizável por qualquer chamador server-side que já
// tenha o tenantId resolvido (não depende de sessão de usuário logado). Espelha a mesma lógica de
// endpoints/quota de apps/web/src/app/api/stay/hub-consult-cpf/route.ts (usada pela tela de
// check-in) — mesma cota mensal por tenant (Tenant.cpfQueryQuotaMonthly/cpfQueryUsed), mesmo par
// de endpoints com fallback, mesmo token master comprado pelo HoteisNet e revendido via cota.
import { prisma } from "@/lib/prisma";

const DEFAULT_HUB_TOKEN = "183262310hxRtwiDQAo330874544";
const DEFAULT_HUB_CONTRACT = "c2NqUUo0bFBLYzhuRmhrUWtvMXhUcjg4ZHFiTitCK1hBT3M4TDlRenllVT0=";

export type HubCpfData = {
  nome: string;
  cpf: string;
  dataNascimentoISO: string;
  telefones: string[];
  emails: string[];
  enderecoCompleto: string;
  logradouro: string;
  numero: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
};

export type HubCpfResult =
  | { ok: true; data: HubCpfData }
  | { ok: false; reason: "invalid_cpf" | "quota_exceeded" | "no_token" | "not_found" | "fetch_error"; message: string };

export async function consultCpfHub(tenantId: string, cpfRaw: string): Promise<HubCpfResult> {
  const cleanCpf = cpfRaw.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    return { ok: false, reason: "invalid_cpf", message: "CPF inválido. Deve conter 11 dígitos." };
  }

  let tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, cpfQueryQuotaMonthly: true, cpfQueryUsed: true, cpfQueryCycleStart: true },
  });
  if (!tenant) return { ok: false, reason: "fetch_error", message: "Assinante não encontrado." };

  const now = new Date();
  const cycleExpired =
    tenant.cpfQueryCycleStart.getUTCFullYear() !== now.getUTCFullYear() ||
    tenant.cpfQueryCycleStart.getUTCMonth() !== now.getUTCMonth();
  if (cycleExpired) {
    tenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: { cpfQueryUsed: 0, cpfQueryCycleStart: now },
      select: { id: true, cpfQueryQuotaMonthly: true, cpfQueryUsed: true, cpfQueryCycleStart: true },
    });
  }

  if (tenant.cpfQueryUsed >= tenant.cpfQueryQuotaMonthly) {
    return {
      ok: false,
      reason: "quota_exceeded",
      message: `Limite mensal de consultas de CPF do hotel (${tenant.cpfQueryUsed}/${tenant.cpfQueryQuotaMonthly}) atingido.`,
    };
  }

  const hubToken = process.env.HUB_DESENVOLVEDOR_TOKEN || process.env.HUB_DEV_CLIENT_ID || DEFAULT_HUB_TOKEN;
  const hubContract = process.env.HUB_DESENVOLVEDOR_CONTRACT || DEFAULT_HUB_CONTRACT;
  if (!hubToken || hubToken.trim() === "" || hubToken.includes("your-")) {
    return { ok: false, reason: "no_token", message: "Consulta de CPF não configurada para este hotel." };
  }

  const endpoints = [
    `https://ws.hubdodesenvolvedor.com.br/v2/cadastropf/?cpf=${cleanCpf}&token=${hubToken.trim()}&contract=${hubContract.trim()}`,
    `https://ws.hubdodesenvolvedor.com.br/v2/cpf/?cpf=${cleanCpf}&token=${hubToken.trim()}&contract=${hubContract.trim()}`,
  ];

  let data: any = null;
  let fetchSuccess = false;
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      data = await res.json();
      if (data && (data.status === true || data.status === "true")) {
        fetchSuccess = true;
        break;
      }
    } catch {
      // tenta o próximo endpoint
    }
  }

  if (!fetchSuccess || !data) {
    return { ok: false, reason: "not_found", message: "Não foram localizados registros para este CPF." };
  }

  await prisma.tenant.update({ where: { id: tenant.id }, data: { cpfQueryUsed: { increment: 1 } } });

  const result = data.result || {};
  const nome = result.nomeCompleto || result.nome_da_pf || result.nome_da_pessoa_fisica || result.nome || "";
  const dtNascRaw = result.dataDeNascimento || result.data_nascimento || "";
  let dataNascimentoISO = "";
  if (dtNascRaw.includes("/")) {
    const [dd, mm, yyyy] = dtNascRaw.split("/");
    dataNascimentoISO = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const telefones: string[] = Array.isArray(result.listaTelefones)
    ? result.listaTelefones.map((t: any) => t.telefoneComDDD || t.telefone || t.numero).filter(Boolean)
    : Array.isArray(result.telefones)
      ? result.telefones
      : [];
  const emails: string[] = Array.isArray(result.listaEmails)
    ? result.listaEmails.map((e: any) => e.enderecoEmail || e.email).filter(Boolean)
    : Array.isArray(result.emails)
      ? result.emails
      : [];

  let logradouro = "", numero = "", bairro = "", cidade = "", uf = "", cep = "", enderecoCompleto = "";
  const end = Array.isArray(result.listaEnderecos) && result.listaEnderecos.length > 0 ? result.listaEnderecos[0] : result;
  if (end) {
    logradouro = (end.logradouro || "").toUpperCase();
    numero = (end.numero || "S/N").toUpperCase();
    bairro = (end.bairro || "").toUpperCase();
    cidade = (end.cidade || end.municipio || "").toUpperCase();
    uf = (end.uf || "").toUpperCase();
    cep = end.cep || "";
    if (logradouro) enderecoCompleto = `${logradouro}, ${numero} - ${bairro}, ${cidade}/${uf} - CEP ${cep}`;
  }

  return {
    ok: true,
    data: {
      nome: nome.toUpperCase(),
      cpf: cleanCpf,
      dataNascimentoISO,
      telefones,
      emails,
      enderecoCompleto,
      logradouro,
      numero,
      bairro,
      cidade,
      uf,
      cep,
    },
  };
}

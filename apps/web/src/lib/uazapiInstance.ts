import { prisma } from "@/lib/prisma";

// Credenciais legadas usadas antes de existir a tela "Configuração do sistema > API Whatsapp"
// (Configurações > API Whatsapp). Servem apenas de fallback para tenants que ainda não
// configuraram sua própria instância uazapi. Nunca hardcoded no código-fonte — um token de API
// commitado no git fica exposto permanentemente no histórico e, combinado com uma rota sem
// autenticação, é explorável por qualquer pessoa; deve vir só de variável de ambiente.
const FALLBACK_SERVER_URL = process.env.UAZAPI_FALLBACK_SERVER_URL || "";
const FALLBACK_INSTANCE_TOKEN = process.env.UAZAPI_FALLBACK_INSTANCE_TOKEN || "";

export interface UazapiCredentials {
  serverUrl: string;
  instanceToken: string;
}

const UAZAPI_TIMEOUT_MS = 15000;

// Erro dedicado para timeout/falha de rede ao chamar a instância uazapi, para que as rotas
// consigam diferenciar "a instância está instável/fora do ar" (deve avisar o usuário para tentar
// de novo) de um erro de aplicação (ex: número inválido).
export class UazapiUnreachableError extends Error {
  constructor(message = "Não foi possível conectar à instância do WhatsApp (uazapi). A instância pode estar instável ou fora do ar.") {
    super(message);
    this.name = "UazapiUnreachableError";
  }
}

// Wrapper de fetch com timeout para chamadas à instância uazapi. Como a instância é uma dependência
// externa sujeita a instabilidade, sem um timeout explícito uma instância travada deixaria a
// requisição pendurada até o limite da função serverless, com o usuário vendo só um spinner infinito
// sem nenhuma mensagem de erro.
export async function fetchUazapi(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UAZAPI_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error: any) {
    throw new UazapiUnreachableError();
  } finally {
    clearTimeout(timeout);
  }
}

// Resolve o servidor uazapi + token da instância do tenant, salvos em UazapiSetting pela tela de
// conexão da instância. Cai para as credenciais legadas quando o tenant ainda não configurou nada.
export async function getTenantUazapiCredentials(tenantId: string | null | undefined): Promise<UazapiCredentials> {
  if (tenantId) {
    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId } });
    if (setting?.serverUrl && setting?.instanceToken) {
      return {
        serverUrl: setting.serverUrl.trim().replace(/\/$/, ""),
        instanceToken: setting.instanceToken.trim(),
      };
    }
  }
  return { serverUrl: FALLBACK_SERVER_URL, instanceToken: FALLBACK_INSTANCE_TOKEN };
}

// Normaliza um número de telefone brasileiro para o formato aceito pela uazapi (DDI 55 + DDD + número).
export function normalizeUazapiPhone(phone: string): string {
  let clean = String(phone || "").replace(/\D/g, "");
  if (!clean.startsWith("55") && clean.length <= 11) {
    clean = `55${clean}`;
  }
  return clean;
}

// Gera as variações possíveis (com e sem o 9º dígito) de um telefone celular brasileiro, sem DDI.
// Números celulares no Brasil "deveriam" ter 9 dígitos (DDD + 9 + 8 dígitos), mas várias contas de
// WhatsApp continuam registradas na forma antiga de 8 dígitos (sem o 9) — o chatid que a uazapi
// entrega no webhook às vezes vem em um formato e o telefone salvo no cadastro do hóspede em
// outro, então uma comparação direta de dígitos falha silenciosamente. Retorna sempre DDD+8 e
// DDD+9 (quando aplicável), para que a busca por hospedagem compare por interseção, não igualdade.
export function brazilPhoneVariants(phone: string): string[] {
  let digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length > 11) {
    digits = digits.slice(2);
  }
  if (digits.length < 10 || digits.length > 11) {
    return digits ? [digits] : [];
  }

  const ddd = digits.slice(0, 2);
  const subscriber = digits.slice(2);
  const variants = new Set<string>([ddd + subscriber]);

  if (subscriber.length === 9 && subscriber.startsWith("9")) {
    variants.add(ddd + subscriber.slice(1));
  } else if (subscriber.length === 8) {
    variants.add(ddd + "9" + subscriber);
  }

  return Array.from(variants);
}

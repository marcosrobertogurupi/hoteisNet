import { prisma } from "@/lib/prisma";

// Credenciais legadas usadas antes de existir a tela "Configuração do sistema > API Whatsapp"
// (Configurações > API Whatsapp). Servem apenas de fallback para tenants que ainda não
// configuraram sua própria instância uazapi.
const FALLBACK_SERVER_URL = "https://netservice.uazapi.com";
const FALLBACK_INSTANCE_TOKEN = "fbe5bfbb-226a-47a2-9d1d-6b657933318c";

export interface UazapiCredentials {
  serverUrl: string;
  instanceToken: string;
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

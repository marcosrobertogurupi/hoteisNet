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

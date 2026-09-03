import { PrismaClient } from "@prisma/client";

// Credenciais legadas — usadas apenas para tenants que ainda não configuraram sua própria
// instância uazapi em Configurações > API Whatsapp (tabela UazapiSetting). Nunca hardcoded no
// código-fonte: um token de API commitado fica exposto para sempre no histórico do git (regra 6 do
// CLAUDE.md). Mesmo padrão de apps/web/src/lib/uazapiInstance.ts. Configure no Railway:
// UAZAPI_FALLBACK_SERVER_URL / UAZAPI_FALLBACK_INSTANCE_TOKEN.
const FALLBACK_UAZAPI_SERVER = process.env.UAZAPI_FALLBACK_SERVER_URL || "";
const FALLBACK_UAZAPI_TOKEN = process.env.UAZAPI_FALLBACK_INSTANCE_TOKEN || "";

// Normaliza um número brasileiro para o formato aceito pela uazapi (DDI 55 + DDD + número).
export function normalizeBrazilPhone(phone: string): string {
  let clean = String(phone || "").replace(/\D/g, "");
  if (!clean.startsWith("55") && clean.length <= 11) {
    clean = `55${clean}`;
  }
  return clean;
}

/**
 * Envia uma mensagem de texto pela instância uazapi do tenant (ou pela instância de fallback, se o
 * tenant ainda não configurou a sua). Compartilhado por todos os disparos do worker.
 *
 * A uazapi responde HTTP 200 mesmo em várias falhas "leves" (número inválido, corpo de erro), então
 * checar só `response.ok` marcava como enviado algo que nunca saiu. Aqui exigimos um identificador
 * real de mensagem (`messageid`/`id`) e ausência de `error` no corpo; qualquer outra coisa é logada
 * e conta como falha, para o chamador poder re-tentar / não marcar como notificado.
 */
export async function sendUazapiText(
  prisma: PrismaClient,
  phone: string,
  message: string,
  tenantId: string
): Promise<boolean> {
  const cleanPhone = normalizeBrazilPhone(phone);

  const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId } });
  const hasOwn = !!(setting?.serverUrl && setting?.instanceToken);
  const server = (hasOwn ? setting!.serverUrl! : FALLBACK_UAZAPI_SERVER).replace(/\/$/, "");
  const token = hasOwn ? setting!.instanceToken! : FALLBACK_UAZAPI_TOKEN;

  if (!server || !token) {
    console.error(`[uazapi] envio abortado — tenant=${tenantId} sem instância própria e sem fallback configurado (UAZAPI_FALLBACK_*).`);
    return false;
  }

  try {
    const response = await fetch(`${server}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });

    const raw = await response.text();
    let body: any = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }

    const ok = response.ok && !!body && !body.error && (body.messageid || body.id);
    if (!ok) {
      console.error(
        `[uazapi] falha ao enviar — tenant=${tenantId} http=${response.status} resposta=${raw.slice(0, 300)}`
      );
      return false;
    }
    return true;
  } catch (err: any) {
    console.error(`[uazapi] erro de rede ao enviar — tenant=${tenantId}:`, err?.message || err);
    return false;
  }
}

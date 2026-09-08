import { normalizeUazapiPhone } from "@/lib/uazapiInstance";

// Envio de WhatsApp pela instância DA PLATAFORMA (número compartilhado do SaaS,
// UAZAPI_FALLBACK_*), nunca pela instância do hotel — usado pelo painel /admin → Mensagens para
// falar com os assinantes. Segredos só de env (CLAUDE.md §6).

const SERVER = (process.env.UAZAPI_FALLBACK_SERVER_URL || "").replace(/\/$/, "");
const TOKEN = process.env.UAZAPI_FALLBACK_INSTANCE_TOKEN || "";

export function platformWhatsAppConfigured(): boolean {
  return !!SERVER && !!TOKEN;
}

async function post(path: string, payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  if (!platformWhatsAppConfigured()) return { ok: false, error: "Instância WhatsApp da plataforma não configurada (UAZAPI_FALLBACK_*)." };
  try {
    const res = await fetch(`${SERVER}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: TOKEN },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    const raw = await res.text();
    let body: any = null;
    try { body = JSON.parse(raw); } catch { /* resposta não-JSON */ }
    const ok = res.ok && !!body && !body.error && (body.messageid || body.id || body.status);
    return ok ? { ok: true } : { ok: false, error: (body?.error || `HTTP ${res.status}`) + " " + raw.slice(0, 120) };
  } catch (err: any) {
    return { ok: false, error: err?.message || "falha de rede" };
  }
}

export function sendPlatformText(phone: string, text: string) {
  return post("/send/text", { number: normalizeUazapiPhone(phone), text });
}

// dataUri: "data:<mime>;base64,...." — kind "document" (PDF/imagem como arquivo) ou "audio".
export function sendPlatformMedia(
  phone: string,
  dataUri: string,
  kind: "document" | "audio",
  opts?: { filename?: string; caption?: string }
) {
  return post("/send/media", {
    number: normalizeUazapiPhone(phone),
    type: kind,
    file: dataUri,
    ...(kind === "document" && opts?.filename ? { docName: opts.filename } : {}),
    ...(opts?.caption ? { text: opts.caption } : {}),
  });
}

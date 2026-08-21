// Envio server-to-server de mensagem de texto via Uazapi, usado pelos disparos automáticos
// (boas-vindas no check-in e aviso de check-out) que partem diretamente das rotas de API,
// sem depender de um hop HTTP interno para /api/uazapi/send-text.
import { getTenantUazapiCredentials, normalizeUazapiPhone } from "@/lib/uazapiInstance";

export async function sendUazapiText(phone: string, message: string, tenantId?: string): Promise<boolean> {
  if (!phone || !message) return false;

  const { serverUrl, instanceToken } = await getTenantUazapiCredentials(tenantId);
  const cleanPhone = normalizeUazapiPhone(phone);

  try {
    const response = await fetch(`${serverUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Envia uma imagem já salva como data URI base64 (mesmo formato em que `Room.photos` é gravado
// pelo upload do cadastro de apartamentos — ver CadastroApartamentoModal.tsx) via
// POST {serverUrl}/send/media, type "image". Mesmo endpoint já usado para PDF em send-reserva.
export async function sendUazapiImage(phone: string, imageDataUri: string, caption: string | undefined, tenantId?: string): Promise<boolean> {
  if (!phone || !imageDataUri) return false;

  const { serverUrl, instanceToken } = await getTenantUazapiCredentials(tenantId);
  const cleanPhone = normalizeUazapiPhone(phone);

  try {
    const response = await fetch(`${serverUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: cleanPhone, type: "image", file: imageDataUri, text: caption || "" }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

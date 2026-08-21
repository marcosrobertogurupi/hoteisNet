// Envio server-to-server de mensagem de texto via Uazapi, usado pelos disparos automáticos
// (boas-vindas no check-in e aviso de check-out) que partem diretamente das rotas de API,
// sem depender de um hop HTTP interno para /api/uazapi/send-text.
import { getTenantUazapiCredentials, normalizeUazapiPhone, fetchUazapi } from "@/lib/uazapiInstance";

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

// Baixa e descriptografa um anexo recebido do hóspede via webhook — a URL que a uazapi entrega
// originalmente (data.content.URL) é criptografada E2E e não pode ser usada diretamente. Mesma
// chamada usada por api/uazapi/messages/download (POST {serverUrl}/message/download), exposta
// aqui como função direta para o agente de IA não depender de um hop HTTP interno. O `mimetype`
// retornado é o real (ex: "image/jpeg", "audio/ogg"), diferente do campo grosseiro
// (image/audio/document/video/ptt) que o webhook grava de antemão em WhatsappMessage.mimeType.
export async function downloadUazapiMedia(messageId: string, tenantId?: string): Promise<{ mediaUrl: string; mimetype: string } | null> {
  try {
    const { serverUrl, instanceToken } = await getTenantUazapiCredentials(tenantId);
    const response = await fetchUazapi(`${serverUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ id: messageId, return_link: true }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.mimetype || !data?.fileURL) return null;
    return { mediaUrl: data.fileURL, mimetype: data.mimetype };
  } catch {
    return null;
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

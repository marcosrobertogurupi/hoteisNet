import { NextResponse } from "next/server";
import { getTenantUazapiCredentials, normalizeUazapiPhone } from "@/lib/uazapiInstance";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/uazapi/send-text — envia uma mensagem de texto simples (sem anexo) via Uazapi
// (POST {serverUrl}/send/text). Usada pelos disparos automáticos de Configurações > Mensagens de
// WhatsApp e pela tela "Mensagens WhatsApp" do quarto ocupado.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, message, tenantId, serverUrl, instanceToken } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: "Telefone e mensagem são obrigatórios." },
        { status: 400 }
      );
    }

    const creds =
      serverUrl && instanceToken
        ? { serverUrl: String(serverUrl).trim().replace(/\/$/, ""), instanceToken: String(instanceToken).trim() }
        : await getTenantUazapiCredentials(tenantId || DEFAULT_TENANT_ID);

    const cleanPhone = normalizeUazapiPhone(phone);

    const response = await fetch(`${creds.serverUrl}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: creds.instanceToken },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });

    const resText = await response.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { text: resText };
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        message: resJson?.error || resJson?.text || "Erro ao enviar mensagem via Uazapi.",
        lastError: resJson,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Mensagem enviada com sucesso via WhatsApp!",
      details: resJson,
    });
  } catch (error: any) {
    console.error("[Uazapi Send Text Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTenantUazapiCredentials, normalizeUazapiPhone, fetchUazapi, UazapiUnreachableError } from "@/lib/uazapiInstance";

// POST /api/uazapi/send-text — envia uma mensagem de texto simples (sem anexo) via Uazapi
// (POST {serverUrl}/send/text). Usada pelos disparos automáticos de Configurações > Mensagens de
// WhatsApp e pela tela "Mensagens WhatsApp" do quarto ocupado. Credenciais sempre resolvidas pelo
// tenant da sessão — nunca aceitas do corpo da requisição (senão qualquer um usa a instância
// WhatsApp do hotel para enviar mensagens arbitrárias, ou usa a rota como relay/SSRF para
// qualquer serverUrl escolhido pelo chamador).
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { phone, message } = body;

    if (!phone || !message) {
      return NextResponse.json(
        { success: false, error: "Telefone e mensagem são obrigatórios." },
        { status: 400 }
      );
    }

    const creds = await getTenantUazapiCredentials(session.tenantId);

    const cleanPhone = normalizeUazapiPhone(phone);

    const response = await fetchUazapi(`${creds.serverUrl}/send/text`, {
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
    const isUnreachable = error instanceof UazapiUnreachableError;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erro interno.",
        unreachable: isUnreachable,
      },
      { status: isUnreachable ? 503 : 500 }
    );
  }
}

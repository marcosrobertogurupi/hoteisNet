import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTenantUazapiCredentials, normalizeUazapiPhone } from "@/lib/uazapiInstance";

// POST /api/uazapi/send-reserva — envia a confirmação de reserva em PDF via Uazapi
// (POST {serverUrl}/send/media, type "document"). Credenciais sempre do tenant da sessão.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { phone, caption, pdfBase64, filename } = body;

    if (!phone || !pdfBase64) {
      return NextResponse.json(
        { success: false, error: "Telefone e documento PDF são obrigatórios." },
        { status: 400 }
      );
    }

    const creds = await getTenantUazapiCredentials(session.tenantId);

    const cleanPhone = normalizeUazapiPhone(phone);
    const documentName = filename || "Confirmacao_Reserva.pdf";
    const messageCaption = caption || `Segue confirmação da reserva para ${body.guestName || ""}.`;

    const formattedPdfBase64 = pdfBase64.startsWith("data:") ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`;

    const response = await fetch(`${creds.serverUrl}/send/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: creds.instanceToken },
      body: JSON.stringify({
        number: cleanPhone,
        type: "document",
        file: formattedPdfBase64,
        text: messageCaption,
        docName: documentName,
      }),
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
        message: resJson?.error || resJson?.text || "Erro ao enviar confirmação de reserva via Uazapi.",
        lastError: resJson,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Confirmação de reserva enviada com sucesso via WhatsApp!",
      details: resJson,
    });
  } catch (error: any) {
    console.error("[Uazapi Send Reserva Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

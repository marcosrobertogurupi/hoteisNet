import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTenantUazapiCredentials, normalizeUazapiPhone, fetchUazapi, UazapiUnreachableError } from "@/lib/uazapiInstance";

// POST /api/uazapi/send-extrato — envia um documento PDF (extrato, resumo, comprovante de
// consumo, voucher, recibo, etc.) via Uazapi (POST {serverUrl}/send/media, type "document").
// Apesar do nome histórico ("extrato"), esta rota é genérica: qualquer tela que precise mandar um
// PDF em anexo por WhatsApp pode chamá-la. Credenciais sempre do tenant da sessão.
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
    const documentName = filename || "Documento.pdf";
    const messageCaption =
      caption || `Segue anexo o documento da hospedagem do hóspede: ${body.guestName || ""} quarto: ${body.roomNumber || ""}`.trim();

    const formattedPdfBase64 = pdfBase64.startsWith("data:") ? pdfBase64 : `data:application/pdf;base64,${pdfBase64}`;

    const response = await fetchUazapi(`${creds.serverUrl}/send/media`, {
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
        message: resJson?.error || resJson?.text || "Erro ao enviar documento via Uazapi.",
        lastError: resJson,
      });
    }

    return NextResponse.json({
      success: true,
      message: "Documento em PDF enviado com sucesso via WhatsApp!",
      details: resJson,
    });
  } catch (error: any) {
    console.error("[Uazapi Route Handler Error]", error);
    const isUnreachable = error instanceof UazapiUnreachableError;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erro interno no servidor.",
        unreachable: isUnreachable,
      },
      { status: isUnreachable ? 503 : 500 }
    );
  }
}

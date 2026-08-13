import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, caption, pdfBase64, filename, serverUrl, instanceToken } = body;

    if (!phone || !pdfBase64) {
      return NextResponse.json(
        { success: false, error: "Telefone e documento PDF são obrigatórios." },
        { status: 400 }
      );
    }

    const targetServer = (serverUrl || "https://netservice.uazapi.com").trim().replace(/\/$/, "");
    const targetToken = (instanceToken || "fbe5bfbb-226a-47a2-9d1d-6b657933318c").trim();

    // Format phone number: digits only, ensure 55 prefix if not present
    let cleanPhone = phone.replace(/\D/g, "");
    if (!cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
      cleanPhone = `55${cleanPhone}`;
    }

    const documentName = filename || "Confirmacao_Reserva.pdf";
    const messageCaption = caption || `Segue confirmação da reserva para ${body.guestName || ""}.`;

    // Format PDF base64 if needed
    const formattedPdfBase64 = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:application/pdf;base64,${pdfBase64}`;

    // Payload for Uazapi API
    const payload = {
      number: cleanPhone,
      type: "document",
      media: formattedPdfBase64,
      document: formattedPdfBase64,
      file: formattedPdfBase64,
      path: formattedPdfBase64,
      fileName: documentName,
      filename: documentName,
      name: documentName,
      title: documentName,
      caption: messageCaption,
      text: messageCaption,
      message: messageCaption,
      body: messageCaption,
    };

    console.log(`[Uazapi Reserva] Target: ${targetServer}/send/media, Phone: ${cleanPhone}, Doc: ${documentName}`);

    const candidateEndpoints = [
      `${targetServer}/send/media`,
      `${targetServer}/send/document`,
      `${targetServer}/message/sendMedia`,
      `${targetServer}/sendFile64`,
    ];

    let lastError: any = null;
    let successResponse: any = null;

    for (const endpoint of candidateEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            token: targetToken,
            "Client-Token": targetToken,
            Authorization: `Bearer ${targetToken}`,
          },
          body: JSON.stringify(payload),
        });

        const resText = await response.text();
        let resJson: any = null;
        try { resJson = JSON.parse(resText); } catch { resJson = { text: resText }; }

        if (response.ok) {
          successResponse = { endpointUsed: endpoint, data: resJson };
          break;
        } else {
          lastError = { status: response.status, endpoint, detail: resText };
        }
      } catch (err: any) {
        lastError = { endpoint, detail: err.message };
      }
    }

    if (successResponse) {
      return NextResponse.json({
        success: true,
        message: "Confirmação de reserva enviada com sucesso via WhatsApp!",
        details: successResponse,
      });
    } else {
      return NextResponse.json({
        success: false,
        message: `Servidor Uazapi: ${lastError?.detail || "Erro ao conectar ao Uazapi."}`,
        lastError,
      });
    }
  } catch (error: any) {
    console.error("[Uazapi Reserva Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno." },
      { status: 500 }
    );
  }
}

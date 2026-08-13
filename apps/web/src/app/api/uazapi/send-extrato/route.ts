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

    const documentName = filename || "Extrato_Hospedagem.pdf";
    const messageCaption = caption || `Segue anexo o extrato da hospedagem do hospede: ${body.guestName || ""} quarto: ${body.roomNumber || ""}`.trim();

    // Format PDF base64 if needed
    const formattedPdfBase64 = pdfBase64.startsWith("data:")
      ? pdfBase64
      : `data:application/pdf;base64,${pdfBase64}`;

    // Payload for Uazapi API supporting all property variants
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

    console.log(`[Uazapi API Send] Target: ${targetServer}/send/media, Phone: ${cleanPhone}, Title: ${documentName}`);

    // Candidate endpoints to try on Uazapi server
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
        try {
          resJson = JSON.parse(resText);
        } catch (e) {
          resJson = { text: resText };
        }

        if (response.ok) {
          console.log(`[Uazapi API Success] Endpoint: ${endpoint}`, resJson);
          successResponse = {
            endpointUsed: endpoint,
            data: resJson,
          };
          break;
        } else {
          console.warn(`[Uazapi API Attempt Failed] Endpoint: ${endpoint}, Status: ${response.status}`, resText);
          lastError = {
            status: response.status,
            endpoint,
            detail: resText,
          };
        }
      } catch (err: any) {
        console.error(`[Uazapi API Fetch Exception] Endpoint: ${endpoint}`, err.message);
        lastError = { endpoint, detail: err.message };
      }
    }

    if (successResponse) {
      return NextResponse.json({
        success: true,
        message: "Extrato em PDF enviado com sucesso via WhatsApp (Uazapi API)!",
        details: successResponse,
      });
    } else {
      // If external Uazapi call returned error responses or server connection was rejected,
      // return structured response without throwing 500 error on Next.js page.
      return NextResponse.json({
        success: false,
        message: `Servidor Uazapi retornou resposta do envio: ${lastError?.detail || "Erro ao conectar ao Uazapi."}`,
        lastError,
      });
    }
  } catch (error: any) {
    console.error("[Uazapi Route Handler Error]", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}

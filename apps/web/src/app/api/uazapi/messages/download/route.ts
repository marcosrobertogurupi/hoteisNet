import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTenantUazapiCredentials, fetchUazapi, UazapiUnreachableError } from "@/lib/uazapiInstance";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/uazapi/messages/download — a URL de mídia que a uazapi entrega no webhook
// (data.content.URL) é a URL criptografada original do WhatsApp (E2E) e não pode ser usada
// diretamente num <img>/link. Esta rota chama POST {serverUrl}/message/download da uazapi, que
// baixa e descriptografa o anexo, devolvendo uma URL pública temporária (retida por 2 dias no
// storage da uazapi). O resultado é salvo em WhatsappMessage.mediaUrl/mimeType para não precisar
// baixar de novo enquanto a URL ainda for válida.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messageId, tenantId } = body;

    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId é obrigatório." }, { status: 400 });
    }

    const creds = await getTenantUazapiCredentials(tenantId || DEFAULT_TENANT_ID);

    const response = await fetchUazapi(`${creds.serverUrl}/message/download`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: creds.instanceToken },
      body: JSON.stringify({ id: messageId, return_link: true }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.mimetype) {
      return NextResponse.json(
        { success: false, error: data?.error || "Falha ao baixar anexo do WhatsApp." },
        { status: 502 }
      );
    }

    await prisma.whatsappMessage.updateMany({
      where: { externalId: messageId },
      data: { mediaUrl: data.fileURL || null, mimeType: data.mimetype },
    });

    return NextResponse.json({ success: true, fileURL: data.fileURL || null, mimetype: data.mimetype });
  } catch (error: any) {
    console.error("[POST /api/uazapi/messages/download] Erro:", error);
    const isUnreachable = error instanceof UazapiUnreachableError;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Erro ao baixar anexo.",
        unreachable: isUnreachable,
      },
      { status: isUnreachable ? 503 : 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTenantUazapiCredentials, fetchUazapi, UazapiUnreachableError } from "@/lib/uazapiInstance";

// POST /api/uazapi/messages/download — a URL de mídia que a uazapi entrega no webhook
// (data.content.URL) é a URL criptografada original do WhatsApp (E2E) e não pode ser usada
// diretamente num <img>/link. Esta rota chama POST {serverUrl}/message/download da uazapi, que
// baixa e descriptografa o anexo, devolvendo uma URL pública temporária (retida por 2 dias no
// storage da uazapi). O resultado é salvo em WhatsappMessage.mediaUrl/mimeType para não precisar
// baixar de novo enquanto a URL ainda for válida. Credenciais sempre do tenant da sessão, e a
// mensagem precisa pertencer a esse tenant.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ success: false, error: "messageId é obrigatório." }, { status: 400 });
    }

    const message = await prisma.whatsappMessage.findFirst({ where: { externalId: messageId, tenantId: session.tenantId } });
    if (!message) {
      return NextResponse.json({ success: false, error: "Mensagem não encontrada." }, { status: 404 });
    }

    const creds = await getTenantUazapiCredentials(session.tenantId);

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
      where: { externalId: messageId, tenantId: session.tenantId },
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

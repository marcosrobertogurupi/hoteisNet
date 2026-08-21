import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/uazapi/messages?stayId=... — lista o histórico de mensagens WhatsApp da hospedagem
// (enviadas pelo hotel e recebidas do hóspede via webhook), em ordem cronológica.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const stayId = searchParams.get("stayId");
    if (!stayId) {
      return NextResponse.json({ success: false, error: "stayId é obrigatório." }, { status: 400 });
    }

    const messages = await prisma.whatsappMessage.findMany({
      where: { stayId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ success: true, messages });
  } catch (error: any) {
    console.error("[GET /api/uazapi/messages] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar mensagens." },
      { status: 500 }
    );
  }
}

// POST /api/uazapi/messages — registra localmente uma mensagem enviada pelo hotel (texto ou
// documento) para aparecer no histórico da tela. Não faz o envio em si — isso é feito pelas rotas
// send-text / send-extrato antes de chamar este endpoint.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, stayId, phone, type, content, filename } = body;

    if (!phone || !type) {
      return NextResponse.json({ success: false, error: "Telefone e tipo são obrigatórios." }, { status: 400 });
    }

    const resolvedTenantId = await resolveTenantId(tenantId || null);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const record = await prisma.whatsappMessage.create({
      data: {
        tenantId: resolvedTenantId,
        stayId: stayId || null,
        phone,
        direction: "OUT",
        type,
        content: content || null,
        filename: filename || null,
        read: true,
        // Toda mensagem registrada por esta rota parte de uma ação manual do operador na tela —
        // usado pelo agente de IA para não responder por cima de quem já assumiu a conversa (ver
        // runGuestSupportAgent em api/uazapi/webhook/[tenantId]/route.ts).
        sentBy: "HUMAN",
      },
    });

    return NextResponse.json({ success: true, message: record });
  } catch (error: any) {
    console.error("[POST /api/uazapi/messages] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao registrar mensagem enviada." },
      { status: 500 }
    );
  }
}

// PATCH /api/uazapi/messages — marca como lidas todas as mensagens recebidas (IN) de uma
// hospedagem, chamado quando o operador abre a tela "Mensagens WhatsApp" do quarto.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { stayId } = body;
    if (!stayId) {
      return NextResponse.json({ success: false, error: "stayId é obrigatório." }, { status: 400 });
    }

    await prisma.whatsappMessage.updateMany({
      where: { stayId, direction: "IN", read: false },
      data: { read: true },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/uazapi/messages] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao marcar mensagens como lidas." },
      { status: 500 }
    );
  }
}

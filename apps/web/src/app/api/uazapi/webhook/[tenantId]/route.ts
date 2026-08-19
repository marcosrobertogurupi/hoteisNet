import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { brazilPhoneVariants } from "@/lib/uazapiInstance";

// POST /api/uazapi/webhook/[tenantId] — recebe eventos da uazapi (configurados em Configurações >
// API Whatsapp > URL WebHook). Só processa mensagens recebidas do hóspede (fromMe=false); mensagens
// enviadas pelo próprio HoteisNet já ficam de fora pelo filtro excludeMessages=["wasSentByApi"]
// configurado no /webhook da uazapi, mas fromMe também é checado aqui por segurança.
export async function POST(req: NextRequest, { params }: { params: Promise<{ tenantId: string }> }) {
  try {
    const { tenantId } = await params;
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ success: true }); // uazapi só precisa de um 200

    const data = body.data || body;
    const fromMe = !!data?.fromMe;
    const wasSentByApi = !!data?.wasSentByApi;
    if (fromMe || wasSentByApi) {
      return NextResponse.json({ success: true, ignored: "outbound" });
    }

    const chatId: string = data?.chatid || data?.sender || "";
    const isGroup = !!data?.isGroup || chatId.includes("@g.us");
    if (!chatId || isGroup) {
      return NextResponse.json({ success: true, ignored: "no-chatid-or-group" });
    }

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return NextResponse.json({ success: true, ignored: "tenant-not-found" });

    const phone = chatId.replace(/\D/g, "");
    const externalId: string | undefined = data?.messageid || undefined;

    // Idempotência: reentregas de webhook não devem duplicar a mesma mensagem.
    if (externalId) {
      const existing = await prisma.whatsappMessage.findFirst({ where: { tenantId, externalId } });
      if (existing) return NextResponse.json({ success: true, duplicate: true });
    }

    // Encontra a hospedagem em aberto do tenant cujo hóspede tem esse telefone. Compara por
    // interseção de variantes (com/sem o 9º dígito), não igualdade direta — o chatid que a uazapi
    // entrega às vezes vem sem o 9 mesmo quando o cadastro do hóspede foi salvo com ele (ou
    // vice-versa), o que faria uma comparação exata de dígitos nunca bater.
    const chatVariants = brazilPhoneVariants(phone);
    let stayId: string | null = null;
    if (chatVariants.length > 0) {
      const openStays = await prisma.stayCheckin.findMany({
        where: { tenantId, isClosed: false },
        orderBy: { checkInDate: "desc" },
        include: { primaryGuest: { select: { phone: true, whatsappPhone: true } } },
      });
      const match = openStays.find((s) => {
        const guestVariants = [
          ...brazilPhoneVariants(s.primaryGuest?.phone || ""),
          ...brazilPhoneVariants(s.primaryGuest?.whatsappPhone || ""),
        ];
        return guestVariants.some((v) => chatVariants.includes(v));
      });
      stayId = match?.id || null;
    }

    const messageType: string = data?.messageType || "text";
    const type = messageType === "text" || messageType === "extendedTextMessage" ? "text" : "media";

    await prisma.whatsappMessage.create({
      data: {
        tenantId,
        stayId,
        phone,
        direction: "IN",
        type,
        content: data?.text || null,
        filename: data?.fileURL || null,
        senderName: data?.senderName || null,
        externalId,
        read: false,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/uazapi/webhook/[tenantId]] Erro:", error);
    // Sempre 200 para a uazapi não ficar retentando indefinidamente por um erro nosso.
    return NextResponse.json({ success: false, error: error.message || "Erro interno." });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendUazapiText } from "@/lib/uazapi";
import { resolveAppBaseUrl } from "@/lib/preCheckinLink";
import { UazapiUnreachableError } from "@/lib/uazapiInstance";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// POST /api/tenant/housekeepers/[id]/send-link — envia por WhatsApp o link fixo do app de
// governança (/housekeeping) para a governanta. O link nunca muda entre envios — é sempre a
// mesma URL pública do SaaS, então pode ser reenviado a qualquer momento sem gerar token novo.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: session!.tenantId! },
      select: { id: true, name: true, tradeName: true },
    });
    if (!tenant) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const housekeeper = await prisma.housekeeper.findFirst({ where: { id, tenantId: tenant.id } });
    if (!housekeeper) {
      return NextResponse.json({ success: false, error: "Governanta não encontrada." }, { status: 404 });
    }

    const link = `${resolveAppBaseUrl()}/housekeeping`;
    const hotelName = tenant.tradeName || tenant.name;
    const message = `Olá, ${housekeeper.name}! Aqui está o link do app de governança do ${hotelName} para você ver e gerenciar a limpeza dos seus quartos:\n${link}\n\nFaça login com este WhatsApp e a senha cadastrada. Você pode salvar esse link na tela inicial do seu celular.`;

    const sent = await sendUazapiText(housekeeper.whatsapp, message, tenant.id);
    if (!sent) {
      return NextResponse.json(
        { success: false, error: "Não foi possível enviar o link via WhatsApp. Verifique a conexão do WhatsApp do hotel em Configurações." },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error instanceof UazapiUnreachableError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 502 });
    }
    console.error("[POST /api/tenant/housekeepers/[id]/send-link] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao enviar link por WhatsApp." },
      { status: 500 }
    );
  }
}

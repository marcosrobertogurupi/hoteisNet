import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

const DEFAULTS = {
  reservationConfirmEnabled: true,
  reservationConfirmMessage: "Foi efetuado uma reserva. Segue anexo o PDF com o voucher.",
  checkinWelcomeEnabled: true,
  checkinWelcomeMessage:
    "*Bem-vindo(a) ao {HOTEL}!*\n\nDesejamos a você uma excelente estadia. Qualquer necessidade, estamos à disposição na recepção.",
  checkoutPrevisionEnabled: false,
  checkoutPrevisionMessage:
    "Olá {HOSPEDE}, lembramos que o check-out do quarto {QUARTO} está previsto para hoje. Contamos com você!",
  checkoutPrevisionTime: "10:00",
  checkoutEnabled: false,
  checkoutMessage: "Checkout feito com sucesso. Esperamos que seja breve o seu retorno.",
};

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/whatsapp-messages?tenantId=... — devolve a config de mensagens automáticas de
// WhatsApp do assinante (confirmação de reserva, boas-vindas, previsão de checkout e checkout).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));

    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const settings = await prisma.whatsappMessageSetting.findUnique({ where: { tenantId: resolvedTenantId } });

    return NextResponse.json({
      success: true,
      settings: settings
        ? {
            reservationConfirmEnabled: settings.reservationConfirmEnabled,
            reservationConfirmMessage: settings.reservationConfirmMessage,
            checkinWelcomeEnabled: settings.checkinWelcomeEnabled,
            checkinWelcomeMessage: settings.checkinWelcomeMessage,
            checkoutPrevisionEnabled: settings.checkoutPrevisionEnabled,
            checkoutPrevisionMessage: settings.checkoutPrevisionMessage,
            checkoutPrevisionTime: settings.checkoutPrevisionTime,
            checkoutEnabled: settings.checkoutEnabled,
            checkoutMessage: settings.checkoutMessage,
          }
        : DEFAULTS,
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/whatsapp-messages] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar configurações de mensagens." },
      { status: 500 }
    );
  }
}

// PATCH /api/tenant/whatsapp-messages — cria/atualiza (upsert) a config de mensagens automáticas
// de WhatsApp do assinante.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, ...fields } = body;

    if (fields.checkoutPrevisionTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.checkoutPrevisionTime)) {
      return NextResponse.json(
        { success: false, error: "Horário de previsão de checkout inválido (use HH:MM)." },
        { status: 400 }
      );
    }

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const allowedKeys = [
      "reservationConfirmEnabled",
      "reservationConfirmMessage",
      "checkinWelcomeEnabled",
      "checkinWelcomeMessage",
      "checkoutPrevisionEnabled",
      "checkoutPrevisionMessage",
      "checkoutPrevisionTime",
      "checkoutEnabled",
      "checkoutMessage",
    ] as const;

    const data: Record<string, any> = {};
    for (const key of allowedKeys) {
      if (fields[key] !== undefined) data[key] = fields[key];
    }

    await prisma.whatsappMessageSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: { tenantId: resolvedTenantId, ...DEFAULTS, ...data },
      update: data,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/whatsapp-messages] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao salvar configurações de mensagens." },
      { status: 500 }
    );
  }
}

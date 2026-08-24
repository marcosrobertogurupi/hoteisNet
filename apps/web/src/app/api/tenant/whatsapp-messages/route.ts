import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

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
  preCheckinFnrhEnabled: true,
  preCheckinFnrhMessage:
    "Olá {HOSPEDE}! Faltam poucas horas para sua chegada ao {HOTEL}. Para agilizar seu check-in, preencha seus dados no link abaixo:\n{LINK}",
  preCheckinFnrhHoursBefore: 3,
};

// GET /api/tenant/whatsapp-messages — devolve a config de mensagens automáticas de WhatsApp do
// tenant da sessão (confirmação de reserva, boas-vindas, previsão de checkout e checkout).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const settings = await prisma.whatsappMessageSetting.findUnique({ where: { tenantId: session.tenantId } });

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
            preCheckinFnrhEnabled: settings.preCheckinFnrhEnabled,
            preCheckinFnrhMessage: settings.preCheckinFnrhMessage,
            preCheckinFnrhHoursBefore: settings.preCheckinFnrhHoursBefore,
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
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const fields = await req.json();

    if (fields.checkoutPrevisionTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.checkoutPrevisionTime)) {
      return NextResponse.json(
        { success: false, error: "Horário de previsão de checkout inválido (use HH:MM)." },
        { status: 400 }
      );
    }

    const resolvedTenantId = session!.tenantId!;

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
      "preCheckinFnrhEnabled",
      "preCheckinFnrhMessage",
      "preCheckinFnrhHoursBefore",
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

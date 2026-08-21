import { prisma } from "@/lib/prisma";
import { sendUazapiText } from "@/lib/uazapi";
import { renderWhatsappTemplate } from "@/lib/whatsappMessages";
import { createPreCheckinLink } from "@/lib/preCheckinLink";
import { logActivity } from "@/lib/audit";
import { UazapiUnreachableError } from "@/lib/uazapiInstance";

export type SendPreCheckinLinkResult =
  | { success: true }
  | { success: false; error: string; unreachable?: boolean };

// Gera e envia o link de pré-check-in/FNRH de uma reserva via WhatsApp (Uazapi). Usada tanto pelo
// disparo manual (POST /api/uazapi/send-precheckin-link) quanto pelo cron automático
// (/api/cron/pre-checkin-fnrh), para não duplicar a lógica de resolução de tenant/template/envio.
//
// IMPORTANTE: reservation.tenantId NÃO é o tenant real do hotel (convenção histórica deste
// projeto — toda Reservation vive sob um tenantId fixo). O tenant real é sempre
// reservation.room.tenantId, usado aqui para resolver credenciais Uazapi e configurações.
export async function sendPreCheckinLink(reservationId: string): Promise<SendPreCheckinLinkResult> {
  const reservation = await prisma.reservation.findUnique({
    where: { id: reservationId },
    include: { room: { include: { tenant: { include: { whatsappMessageSettings: true } } } } },
  });

  if (!reservation) {
    return { success: false, error: "Reserva não encontrada." };
  }
  if (!reservation.guestPhone) {
    return { success: false, error: "Reserva sem telefone de WhatsApp cadastrado." };
  }

  const tenantId = reservation.room.tenantId;
  const tenant = reservation.room.tenant;
  const settings = tenant.whatsappMessageSettings;

  if (settings && settings.preCheckinFnrhEnabled === false) {
    return { success: false, error: "Envio automático de pré-check-in está desativado nas configurações." };
  }

  const template =
    settings?.preCheckinFnrhMessage ||
    "Olá {HOSPEDE}! Faltam poucas horas para sua chegada ao {HOTEL}. Para agilizar seu check-in, preencha seus dados no link abaixo:\n{LINK}";

  try {
    const { token, url } = await prisma.$transaction((tx) =>
      createPreCheckinLink(tx, { tenantId, reservationId, checkInDate: reservation.checkInDate })
    );

    const message = renderWhatsappTemplate(template, {
      hospede: reservation.guestName,
      hotel: tenant.tradeName || tenant.name,
      link: url,
    });

    const sent = await sendUazapiText(reservation.guestPhone, message, tenantId);
    if (!sent) {
      return { success: false, error: "Não foi possível enviar a mensagem via WhatsApp. Tente novamente." };
    }

    await prisma.$transaction([
      prisma.reservation.update({ where: { id: reservationId }, data: { preCheckinSent: true } }),
      prisma.preCheckinLink.update({
        where: { token },
        data: { sentAt: new Date(), sendAttempts: { increment: 1 } },
      }),
    ]);

    await logActivity({
      tenantId,
      action: "PRE_CHECKIN_LINK_SENT",
      entityType: "Reservation",
      entityId: reservationId,
      description: `Link de pré-check-in FNRH enviado via WhatsApp para ${reservation.guestName}.`,
    });

    return { success: true };
  } catch (error) {
    if (error instanceof UazapiUnreachableError) {
      return { success: false, error: error.message, unreachable: true };
    }
    console.error("[sendPreCheckinLink] Erro inesperado:", error);
    return { success: false, error: "Erro interno ao enviar o link de pré-check-in." };
  }
}

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

// Credenciais legadas — usadas apenas para tenants que ainda não configuraram sua própria
// instância uazapi em Configurações > API Whatsapp (tabela UazapiSetting).
const FALLBACK_UAZAPI_SERVER = "https://netservice.uazapi.com";
const FALLBACK_UAZAPI_TOKEN = "fbe5bfbb-226a-47a2-9d1d-6b657933318c";

function resolveAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function renderTemplate(template: string, vars: { hospede?: string; hotel?: string; link?: string }): string {
  return template
    .replace(/\{HOSPEDE\}/gi, vars.hospede || "")
    .replace(/\{HOTEL\}/gi, vars.hotel || "")
    .replace(/\{LINK\}/gi, vars.link || "");
}

async function sendUazapiText(phone: string, message: string, tenantId: string): Promise<boolean> {
  let cleanPhone = phone.replace(/\D/g, "");
  if (!cleanPhone.startsWith("55") && cleanPhone.length <= 11) {
    cleanPhone = `55${cleanPhone}`;
  }

  const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId } });
  const server = (setting?.serverUrl && setting?.instanceToken ? setting.serverUrl : FALLBACK_UAZAPI_SERVER).replace(/\/$/, "");
  const token = setting?.serverUrl && setting?.instanceToken ? setting.instanceToken : FALLBACK_UAZAPI_TOKEN;

  try {
    const response = await fetch(`${server}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ number: cleanPhone, text: message }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Roda a cada minuto (agendado em index.ts). Para cada reserva confirmada cujo check-in caiu
 * dentro da janela configurada por tenant (WhatsappMessageSetting.preCheckinFnrhHoursBefore),
 * gera um link de pré-check-in/FNRH e envia por WhatsApp — uma única vez por reserva
 * (Reservation.preCheckinSent evita reenvio duplicado; guarda otimista via updateMany evita
 * corrida caso o worker rode mais de uma instância).
 *
 * O tenant "real" de uma reserva é sempre reservation.room.tenantId, nunca reservation.tenantId
 * — convenção histórica deste projeto em que toda Reservation vive sob um tenantId fixo
 * independente do tenant dono do quarto (ver mesmo cuidado em checkoutPrevision.ts).
 */
export async function runPreCheckinFnrh(): Promise<void> {
  const now = new Date();
  const searchWindowEnd = new Date(now.getTime() + 48 * 60 * 60 * 1000);

  const candidates = await prisma.reservation.findMany({
    where: {
      status: { in: ["PRE_RESERVATION", "CONFIRMED"] },
      preCheckinSent: false,
      hasWhatsapp: true,
      guestPhone: { not: null },
      checkInDate: { gte: now, lte: searchWindowEnd },
    },
    include: { room: { include: { tenant: { include: { whatsappMessageSettings: true } } } } },
  });

  for (const reservation of candidates) {
    const tenant = reservation.room.tenant;
    const settings = tenant.whatsappMessageSettings;
    if (settings && settings.preCheckinFnrhEnabled === false) continue;

    const hoursBefore = settings?.preCheckinFnrhHoursBefore ?? 3;
    const sendFrom = new Date(reservation.checkInDate.getTime() - hoursBefore * 60 * 60 * 1000);
    if (now < sendFrom) continue;

    const tenantId = reservation.room.tenantId;

    const claim = await prisma.reservation.updateMany({
      where: { id: reservation.id, preCheckinSent: false },
      data: { preCheckinSent: true },
    });
    if (claim.count === 0) continue;

    try {
      await prisma.preCheckinLink.updateMany({
        where: { reservationId: reservation.id, status: { in: ["PENDING", "OPENED"] } },
        data: { status: "REVOKED" },
      });

      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(reservation.checkInDate.getTime() + 48 * 60 * 60 * 1000);
      await prisma.preCheckinLink.create({
        data: { tenantId, reservationId: reservation.id, token, expiresAt },
      });

      const url = `${resolveAppBaseUrl()}/self-checkin/${token}`;
      const template =
        settings?.preCheckinFnrhMessage ||
        "Olá {HOSPEDE}! Faltam poucas horas para sua chegada ao {HOTEL}. Para agilizar seu check-in, preencha seus dados no link abaixo:\n{LINK}";
      const message = renderTemplate(template, {
        hospede: reservation.guestName,
        hotel: tenant.tradeName || tenant.name,
        link: url,
      });

      const sent = await sendUazapiText(reservation.guestPhone!, message, tenantId);
      if (sent) {
        await prisma.preCheckinLink.update({
          where: { token },
          data: { sentAt: new Date(), sendAttempts: { increment: 1 } },
        });
        console.log(`[pre-checkin-fnrh] enviado — tenant=${tenant.name} reserva=${reservation.id}`);
      } else {
        await prisma.reservation.updateMany({
          where: { id: reservation.id, preCheckinSent: true },
          data: { preCheckinSent: false },
        });
        console.error(`[pre-checkin-fnrh] falha ao enviar — tenant=${tenant.name} reserva=${reservation.id}`);
      }
    } catch (err) {
      await prisma.reservation.updateMany({
        where: { id: reservation.id, preCheckinSent: true },
        data: { preCheckinSent: false },
      });
      console.error(`[pre-checkin-fnrh] erro inesperado — reserva=${reservation.id}:`, err);
    }
  }
}

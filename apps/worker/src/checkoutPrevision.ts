import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Todos os hotéis atendidos hoje operam no fuso de Brasília.
const TENANT_TIMEZONE = "America/Sao_Paulo";
// Credenciais legadas — usadas apenas para tenants que ainda não configuraram sua própria
// instância uazapi em Configurações > API Whatsapp (tabela UazapiSetting).
const FALLBACK_UAZAPI_SERVER = "https://netservice.uazapi.com";
const FALLBACK_UAZAPI_TOKEN = "fbe5bfbb-226a-47a2-9d1d-6b657933318c";

function currentHHMM(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
}

function dateKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(date); // YYYY-MM-DD
}

function renderTemplate(template: string, vars: { hospede?: string; hotel?: string; quarto?: string }): string {
  return template
    .replace(/\{HOSPEDE\}/gi, vars.hospede || "")
    .replace(/\{HOTEL\}/gi, vars.hotel || "")
    .replace(/\{QUARTO\}/gi, vars.quarto || "");
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
 * Roda a cada minuto. Para cada assinante com o disparo de "Previsão de checkout" habilitado
 * (WhatsappMessageSetting.checkoutPrevisionEnabled) cujo horário configurado
 * (checkoutPrevisionTime) bate com o horário atual em Brasília, envia a mensagem de aviso a
 * todos os hóspedes com hospedagem em aberto cuja saída está prevista para hoje — uma única vez
 * por dia por hospedagem (StayCheckin.checkoutPrevisionSentDate evita duplicidade caso o job
 * rode mais de uma vez no mesmo minuto ou a estadia se estenda por vários dias).
 */
export async function runCheckoutPrevision(): Promise<void> {
  const nowHHMM = currentHHMM(TENANT_TIMEZONE);
  const todayKey = dateKey(new Date(), TENANT_TIMEZONE);

  const settingsToRun = await prisma.whatsappMessageSetting.findMany({
    where: { checkoutPrevisionEnabled: true, checkoutPrevisionTime: nowHHMM },
  });

  for (const settings of settingsToRun) {
    const tenant = await prisma.tenant.findUnique({ where: { id: settings.tenantId }, select: { name: true } });

    const openStays = await prisma.stayCheckin.findMany({
      where: { tenantId: settings.tenantId, isClosed: false },
      include: { primaryGuest: true, room: true },
    });

    for (const stay of openStays) {
      if (dateKey(stay.expectedCheckOut, TENANT_TIMEZONE) !== todayKey) continue;
      if (stay.checkoutPrevisionSentDate === todayKey) continue;

      const phone = stay.primaryGuest.whatsappPhone || stay.primaryGuest.phone;
      if (!phone) continue;

      const message = renderTemplate(settings.checkoutPrevisionMessage, {
        hospede: stay.primaryGuest.fullName,
        hotel: tenant?.name || "",
        quarto: stay.room.number,
      });

      const sent = await sendUazapiText(phone, message, settings.tenantId);
      if (sent) {
        await prisma.stayCheckin.update({
          where: { id: stay.id },
          data: { checkoutPrevisionSentDate: todayKey },
        });
        console.log(`[checkout-prevision] enviado — tenant=${tenant?.name} stay=${stay.id}`);
      } else {
        console.error(`[checkout-prevision] falha ao enviar — tenant=${tenant?.name} stay=${stay.id}`);
      }
    }
  }
}

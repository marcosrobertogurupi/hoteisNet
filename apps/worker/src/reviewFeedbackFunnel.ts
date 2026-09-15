// Funil de satisfação pós-checkout — pergunta de 1 a 5 enviada por WhatsApp horas depois do
// check-out efetivo do hóspede (StayCheckin.actualCheckOut). Nota alta (ver threshold em
// apps/web/src/app/api/public/review-feedback/[token]/route.ts) redireciona o hóspede para um
// review público (Google Maps/TripAdvisor); nota baixa vira atendimento interno (HumanEscalation)
// em vez de virar reclamação pública. Mesmo padrão de link público do pré-check-in
// (preCheckinFnrh.ts): token opaco de 32 bytes, nunca aceita id nenhum do cliente.
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";
import { sendUazapiText } from "./uazapiSend";

const prisma = new PrismaClient();

// Só dispara depois desse intervalo do check-out — dar tempo do hóspede sair do hotel e assentar a
// experiência antes de pedir a nota, em vez de perguntar "porta afora".
const HOURS_AFTER_CHECKOUT = 3;
// Nunca olha check-outs mais antigos que isso — evita disparar em massa pra hospedagens antigas
// quando o assinante liga o recurso pela primeira vez, ou depois de um período com o worker parado.
const LOOKBACK_DAYS = 3;
// Link expira — depois disso, o hóspede que abrir vê "link expirado" em vez de responder fora de
// contexto muito tempo depois da estadia.
const LINK_VALID_DAYS = 14;

function resolveAppBaseUrl(): string {
  return (process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Roda periodicamente (agendado em index.ts). Para cada hospedagem fechada com check-out efetivo
 * dentro da janela e sem pedido de feedback ainda, gera o link e envia por WhatsApp — uma única vez
 * por hospedagem (a checagem "já existe ReviewFeedbackRequest para este stayCheckinId" faz o papel
 * de flag de dedupe, sem precisar de uma coluna nova em StayCheckin).
 */
export async function runReviewFeedbackFunnel(): Promise<void> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() - HOURS_AFTER_CHECKOUT * 60 * 60 * 1000);
  const windowStart = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const candidates = await prisma.stayCheckin.findMany({
    where: {
      isClosed: true,
      actualCheckOut: { not: null, gte: windowStart, lte: windowEnd },
      tenant: { reviewFeedbackEnabled: true },
      reviewFeedbackRequests: { none: {} },
    },
    select: {
      id: true,
      tenantId: true,
      primaryGuest: { select: { fullName: true, whatsappPhone: true, hasWhatsapp: true } },
      tenant: { select: { name: true, tradeName: true } },
    },
  });

  for (const stay of candidates) {
    if (!stay.primaryGuest.hasWhatsapp || !stay.primaryGuest.whatsappPhone) continue;

    try {
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(now.getTime() + LINK_VALID_DAYS * 24 * 60 * 60 * 1000);

      // A criação em si já serve de trava de dedupe: se duas execuções concorrentes pegarem a
      // mesma hospedagem (janela pequena entre o SELECT acima e este INSERT), a segunda ainda
      // tentaria — aceitável aqui porque o pior caso é o hóspede receber o WhatsApp duas vezes,
      // não um dado incorreto gravado; diferente de reservas/pagamentos, não precisa de
      // updateMany atômico prévio.
      await prisma.reviewFeedbackRequest.create({
        data: { tenantId: stay.tenantId, stayCheckinId: stay.id, token, expiresAt },
      });

      const hotelName = stay.tenant.tradeName || stay.tenant.name;
      const url = `${resolveAppBaseUrl()}/avaliar/${token}`;
      const message = `Olá, ${stay.primaryGuest.fullName}! Esperamos que tenha gostado da sua estadia no ${hotelName}. Pode nos dar uma nota rápida (leva 10 segundos)?\n\n${url}`;

      const sent = await sendUazapiText(prisma, stay.primaryGuest.whatsappPhone, message, stay.tenantId);
      if (sent) {
        await prisma.reviewFeedbackRequest.update({ where: { token }, data: { sentAt: new Date() } });
        console.log(`[review-feedback-funnel] enviado — tenant=${stay.tenantId} stay=${stay.id}`);
      } else {
        console.error(`[review-feedback-funnel] falha ao enviar — tenant=${stay.tenantId} stay=${stay.id}`);
      }
    } catch (err: any) {
      console.error(`[review-feedback-funnel] erro inesperado — stay=${stay.id}:`, err?.message || err);
    }
  }
}

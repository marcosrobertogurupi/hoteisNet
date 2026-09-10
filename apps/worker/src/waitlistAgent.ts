import { PrismaClient } from "@prisma/client";
import { sendUazapiText } from "./uazapiSend";

const prisma = new PrismaClient();

// Horário padrão de check-in/out — mesma constante assumida em todo o sistema quando não há horário
// definido (ver apps/web/src/lib/waitlistMatch.ts, aiAgent/tools.ts).
const DEFAULT_CHECK_IN_TIME = "14:00";
const DEFAULT_CHECK_OUT_TIME = "12:00";

// Ancora só a data (AAAA-MM-DD) no horário padrão do hotel, no fuso de Brasília (UTC-3 o ano todo).
function atBrasiliaTime(dateYmd: string, hhmm: string): Date {
  return new Date(`${dateYmd}T${hhmm}:00-03:00`);
}
function checkInAt(d: Date): Date {
  return atBrasiliaTime(d.toISOString().slice(0, 10), DEFAULT_CHECK_IN_TIME);
}
function checkOutAt(d: Date): Date {
  return atBrasiliaTime(d.toISOString().slice(0, 10), DEFAULT_CHECK_OUT_TIME);
}

// Meia-noite (Brasília) do dia seguinte ao da data informada. Usado para "arredondar" a ocupação de
// um overstay para o fim do dia. `en-CA` dá AAAA-MM-DD.
function endOfDayBrasilia(d: Date): Date {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(atBrasiliaTime(ymd, "00:00").getTime() + 24 * 60 * 60 * 1000);
}

// Ocupação EFETIVA de uma hospedagem — o maior valor entre a saída prevista e (check-in + diárias
// já lançadas). Cobre overstay. Duplicado de apps/web/src/lib/reservationHelpers.ts (stayOccupiedUntil)
// — o worker não importa apps/web (mesmo padrão de busyRoomIds em operationalAgent.ts). O ramo de
// overstay (arredonda para o fim do dia BRT) precisa ficar idêntico ao do web.
function stayOccupiedUntil(stay: { checkInDate: Date; expectedCheckOut: Date; dailiesCount: number }): Date {
  const billedThrough = new Date(stay.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stay.dailiesCount);
  const effective = billedThrough > stay.expectedCheckOut ? billedThrough : stay.expectedCheckOut;
  if (stay.expectedCheckOut.getTime() < Date.now()) {
    return endOfDayBrasilia(new Date(Math.max(effective.getTime(), Date.now())));
  }
  return effective;
}

// Procura um quarto ativo da categoria genuinamente livre para todo o período pedido. A reserva tem
// prioridade absoluta: um quarto só "casa" se nenhuma reserva ativa/futura nem hospedagem em aberto
// o reivindica, e se ele não está em "soft hold" por outra entrada da fila já avisada.
async function findVacancy(params: {
  tenantId: string;
  roomCategoryId: string;
  checkIn: Date;
  checkOut: Date;
  excludeWaitlistId: string;
}): Promise<string | null> {
  const checkIn = checkInAt(params.checkIn);
  const checkOut = checkOutAt(params.checkOut);
  if (checkOut <= checkIn) return null;

  const rooms = await prisma.room.findMany({
    where: { tenantId: params.tenantId, categoryId: params.roomCategoryId, active: true },
    select: { id: true },
  });
  if (rooms.length === 0) return null;
  const roomIds = rooms.map((r) => r.id);

  const [reservations, openStays, held] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: ["PRE_RESERVATION", "CONFIRMED", "CHECKED_IN"] },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { roomId: true },
    }),
    prisma.stayCheckin.findMany({
      where: { roomId: { in: roomIds }, isClosed: false, checkInDate: { lt: checkOut } },
      select: { roomId: true, checkInDate: true, expectedCheckOut: true, dailiesCount: true },
    }),
    prisma.waitlistEntry.findMany({
      where: {
        tenantId: params.tenantId,
        status: "NOTIFIED",
        notifiedRoomId: { in: roomIds },
        id: { not: params.excludeWaitlistId },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { notifiedRoomId: true },
    }),
  ]);

  const busy = new Set<string>([
    ...reservations.map((r) => r.roomId),
    ...openStays.filter((s) => stayOccupiedUntil(s) > checkIn).map((s) => s.roomId),
    ...(held.map((h) => h.notifiedRoomId).filter(Boolean) as string[]),
  ]);
  return roomIds.find((id) => !busy.has(id)) ?? null;
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
}

// Trava de reentrância — node-cron não pula um disparo se o anterior ainda roda.
let waitlistAgentRunning = false;

/**
 * Roda periodicamente (agendado em index.ts). Reavalia a fila de espera de cada tenant que tem
 * alguma entrada WAITING: quando abre uma vaga da MESMA categoria num período compatível, avisa o
 * primeiro da fila (createdAt asc).
 *
 * Fase 1 — só o modo MANUAL: abre uma escalação no sino do Mapa de Quartos/Reservas e, quando há um
 * telefone de alerta configurado (AIAgentSetting.alertPhone), manda um aviso por WhatsApp para a
 * recepção. A entrada é marcada NOTIFIED (claim otimista via updateMany). O agente de IA avisar o
 * hóspede e criar a reserva sozinho fica para a Fase 2 (waitlistAutoOfferEnabled).
 *
 * Nenhuma chamada de LLM aqui — detecção 100% determinística.
 */
export async function runWaitlistAgent(): Promise<void> {
  if (waitlistAgentRunning) {
    console.warn("[waitlist-agent] ciclo anterior ainda em execução — disparo ignorado.");
    return;
  }
  waitlistAgentRunning = true;
  try {
    await runWaitlistAgentInner();
  } finally {
    waitlistAgentRunning = false;
  }
}

async function runWaitlistAgentInner(): Promise<void> {
  // Tenants com fila ativa (WAITING ou NOTIFIED).
  const active = await prisma.waitlistEntry.groupBy({
    by: ["tenantId"],
    where: { status: { in: ["WAITING", "NOTIFIED"] } },
    _count: { _all: true },
  });
  if (active.length === 0) return;

  for (const { tenantId } of active) {
    try {
      const [tenant, aiSetting] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true, tradeName: true } }),
        prisma.aIAgentSetting.findUnique({
          where: { tenantId },
          select: { alertPhone: true, blocked: true, waitlistAutoOfferEnabled: true },
        }),
      ]);
      if (!tenant) continue;
      const hotelName = tenant.tradeName || tenant.name;

      // ── 1. Entradas NOTIFIED cuja vaga sumiu (uma reserva pegou o quarto) → EXPIRED/SLOT_LOST ──
      const notified = await prisma.waitlistEntry.findMany({
        where: { tenantId, status: "NOTIFIED" },
        select: { id: true, roomCategoryId: true, checkInDate: true, checkOutDate: true, notifiedRoomId: true },
      });
      for (const n of notified) {
        const stillFree = await findVacancy({
          tenantId,
          roomCategoryId: n.roomCategoryId,
          checkIn: n.checkInDate,
          checkOut: n.checkOutDate,
          excludeWaitlistId: n.id,
        });
        // A vaga "some" quando não há mais nenhum quarto livre da categoria E o quarto que estava
        // reservado para esta entrada também não está mais livre.
        const ownRoomStillFree =
          n.notifiedRoomId != null &&
          (await roomFreeForPeriod(tenantId, n.notifiedRoomId, n.checkInDate, n.checkOutDate, n.id));
        if (!stillFree && !ownRoomStillFree) {
          await prisma.waitlistEntry.updateMany({
            where: { id: n.id, tenantId, status: "NOTIFIED" },
            data: { status: "EXPIRED", closedReason: "SLOT_LOST", notifiedRoomId: null },
          });
          await prisma.humanEscalation.updateMany({
            where: { tenantId, entityType: "WAITLIST_MATCH", entityId: n.id, resolved: false },
            data: { resolved: true, resolvedAt: new Date() },
          });
        }
      }

      if (aiSetting?.blocked) continue; // IA bloqueada pelo admin — não avisa (nem manual nem auto)

      // ── 2. Primeiro WAITING (createdAt asc) com vaga → avisar ──
      const waiting = await prisma.waitlistEntry.findMany({
        where: { tenantId, status: "WAITING" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          guestName: true,
          guestPhone: true,
          roomCategoryId: true,
          roomCategoryName: true,
          checkInDate: true,
          checkOutDate: true,
        },
      });

      for (const entry of waiting) {
        const roomId = await findVacancy({
          tenantId,
          roomCategoryId: entry.roomCategoryId,
          checkIn: entry.checkInDate,
          checkOut: entry.checkOutDate,
          excludeWaitlistId: entry.id,
        });
        if (!roomId) continue;

        // Claim otimista: só o ciclo que conseguir mover WAITING → NOTIFIED "ganha" a vaga.
        const claim = await prisma.waitlistEntry.updateMany({
          where: { id: entry.id, tenantId, status: "WAITING" },
          data: { status: "NOTIFIED", notifiedAt: new Date(), notifiedRoomId: roomId },
        });
        if (claim.count === 0) continue;

        const reason =
          `Fila de espera: abriu uma vaga de ${entry.roomCategoryName} para ${entry.guestName} ` +
          `(${fmtDay(entry.checkInDate)} a ${fmtDay(entry.checkOutDate)}). Avise o hóspede e confirme a reserva.`;

        // Sino do Mapa de Quartos/Reservas.
        const existing = await prisma.humanEscalation.findFirst({
          where: { tenantId, entityType: "WAITLIST_MATCH", entityId: entry.id, resolved: false },
          select: { id: true },
        });
        if (!existing) {
          await prisma.humanEscalation.create({
            data: {
              tenantId,
              source: "OPERATIONAL_AGENT",
              reason,
              entityType: "WAITLIST_MATCH",
              entityId: entry.id,
              guestPhone: entry.guestPhone,
            },
          });
        }

        // Aviso por WhatsApp para a recepção (quando há telefone de alerta configurado).
        if (aiSetting?.alertPhone) {
          await sendUazapiText(prisma, aiSetting.alertPhone, `${hotelName} — ${reason}`, tenantId);
        }

        console.log(`[waitlist-agent] vaga avisada — tenant=${tenantId} entrada=${entry.id}`);

        // Fase 1: um aviso por ciclo por tenant é suficiente — o próximo é avaliado no ciclo seguinte
        // (ou quando a recepção converte/remove esta entrada).
        break;
      }
    } catch (err: any) {
      console.error(`[waitlist-agent] erro — tenant=${tenantId}:`, err?.message || err);
    }
  }
}

// Um quarto específico está livre para o período? (usado para saber se o "soft hold" de uma entrada
// NOTIFIED ainda vale). Ignora o soft hold da própria entrada.
async function roomFreeForPeriod(
  tenantId: string,
  roomId: string,
  checkInRaw: Date,
  checkOutRaw: Date,
  selfWaitlistId: string
): Promise<boolean> {
  const checkIn = checkInAt(checkInRaw);
  const checkOut = checkOutAt(checkOutRaw);
  const [res, stays, held] = await Promise.all([
    prisma.reservation.findFirst({
      where: {
        roomId,
        status: { in: ["PRE_RESERVATION", "CONFIRMED", "CHECKED_IN"] },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { id: true },
    }),
    prisma.stayCheckin.findMany({
      where: { roomId, isClosed: false, checkInDate: { lt: checkOut } },
      select: { checkInDate: true, expectedCheckOut: true, dailiesCount: true },
    }),
    prisma.waitlistEntry.findFirst({
      where: {
        tenantId,
        status: "NOTIFIED",
        notifiedRoomId: roomId,
        id: { not: selfWaitlistId },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { id: true },
    }),
  ]);
  if (res || held) return false;
  return !stays.some((s) => stayOccupiedUntil(s) > checkIn);
}

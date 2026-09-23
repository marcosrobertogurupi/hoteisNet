import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TENANT_TIMEZONE = "America/Sao_Paulo";

// YYYY-MM-DD do dia calendário em Brasília.
function dateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TENANT_TIMEZONE }).format(date);
}

/**
 * Marca como NO_SHOW as reservas cujo dia de chegada já passou por completo (em Brasília) e que
 * nunca tiveram check-in. Roda de hora em hora — determinístico, sem LLM.
 *
 * Regra de tolerância: só depois que o DIA da chegada terminou (checkInDate < hoje em Brasília).
 * Assim ninguém é marcado no-show às 15h achando que não vai chegar às 22h.
 *
 * O que NÃO faz aqui (fica manual na recepção): decidir o destino do sinal/adiantamento — reter
 * como taxa de no-show ou estornar. Cancelar a reserva (que estorna o sinal) continua sendo ação
 * explícita do operador.
 *
 * Efeito colateral desejado: uma reserva NO_SHOW deixa de bloquear o quarto
 * (findConflictingReservation / busyRoomIdsForPeriod filtram NO_SHOW), liberando-o para walk-in
 * e para a fila de espera (o worker da fila reavalia no próximo tick).
 */
// Chegada de madrugada (antes das 06:00 do dia seguinte) é um cenário que o check-in trata
// explicitamente ("noite anterior"). Marcar no-show logo depois da meia-noite liberava o quarto de
// quem ainda estava a caminho — a reserva de ontem só vira no-show a partir das 06:00 de hoje.
// Mesmo corte de OVERNIGHT_CUTOFF_MINUTES em apps/web/src/app/api/stay/checkin/route.ts.
const OVERNIGHT_CUTOFF_HHMM = "06:00";

export async function runNoShowSweep(): Promise<void> {
  const now = new Date();
  const nowHHMM = new Intl.DateTimeFormat("en-GB", { timeZone: TENANT_TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
  // Antes do corte da madrugada, "hoje" para efeito de no-show ainda é ontem.
  const todayKey = nowHHMM < OVERNIGHT_CUTOFF_HHMM ? dateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000)) : dateKey(now);
  const todayStartBr = new Date(`${todayKey}T00:00:00-03:00`);

  // Traz as candidatas (reserva ativa aguardando chegada, sem hospedagem vinculada) e filtra o
  // "dia já passou" em JS com o fuso de Brasília — evita depender do fuso do processo numa query.
  const candidates = await prisma.reservation.findMany({
    where: {
      status: { in: ["PRE_RESERVATION", "CONFIRMED"] },
      stayCheckin: { is: null },
      // Filtro de data já no banco: antes vinham TODAS as reservas futuras de todos os hotéis a
      // cada hora só para descartar quase todas em JS (egress — CLAUDE.md, ⚡ Performance §5).
      checkInDate: { lt: todayStartBr },
    },
    select: { id: true, checkInDate: true, reservationNumber: true, guestName: true, roomId: true, room: { select: { tenantId: true, number: true } } },
  });

  const stale = candidates.filter((r) => dateKey(r.checkInDate) < todayKey);
  if (stale.length === 0) return;

  for (const r of stale) {
    // updateMany com o filtro de status repetido na escrita: se um check-in aconteceu entre a
    // leitura e agora, a reserva não está mais em PRE_RESERVATION/CONFIRMED e nada é alterado.
    const res = await prisma.reservation.updateMany({
      where: { id: r.id, status: { in: ["PRE_RESERVATION", "CONFIRMED"] } },
      data: { status: "NO_SHOW" },
    });
    if (res.count === 0) continue;

    await prisma.auditLog.create({
      data: {
        tenantId: r.room.tenantId,
        userId: null,
        userName: "Sistema (rotina de no-show)",
        action: "RESERVATION_NO_SHOW",
        description:
          `Reserva ${r.reservationNumber || r.id} (${r.guestName}, quarto ${r.room.number}) marcada como NO_SHOW ` +
          `automaticamente — dia da chegada (${dateKey(r.checkInDate)}) encerrado sem check-in. ` +
          `O quarto foi liberado; a definição sobre o sinal fica com a recepção.`,
        entityType: "RESERVATION",
        entityId: r.id,
      },
    });
    console.log(`[no-show] ${r.reservationNumber || r.id} — tenant=${r.room.tenantId}`);
  }
}

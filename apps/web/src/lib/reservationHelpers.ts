import { prisma } from "@/lib/prisma";
import { Prisma, type ReservationStatus } from "@prisma/client";

// Aceita tanto o client Prisma completo quanto o client de dentro de uma `prisma.$transaction`
// (que não expõe $connect/$disconnect/$transaction/$extends) — as duas formas são usadas nas
// chamadas destas funções.
type PrismaClientOrTx = typeof prisma | Prisma.TransactionClient;

// Número da reserva (Reservation.reservationNumber) — vindo da sequência do banco
// `reservation_number_seq` (migration 20260910110000), no lugar do antigo
// `"RES-" + Math.floor(500 + Math.random() * 9000)` que colidia num hotel movimentado.
// Chamar SEMPRE dentro da mesma transação que cria a reserva.
export async function nextReservationNumber(tx: PrismaClientOrTx): Promise<string> {
  // `to_regclass` devolve NULL em vez de dar erro quando a sequência ainda não existe (migration
  // 20260910110000 não aplicada) — assim a query nunca aborta a transação. Nesse caso cai num
  // fallback com timestamp base36 (colisão desprezível) para não quebrar a criação de reserva
  // antes do deploy da migration.
  const rows = await tx.$queryRaw<{ nextval: bigint | null }[]>`
    SELECT CASE WHEN to_regclass('public.reservation_number_seq') IS NOT NULL
                THEN nextval('public.reservation_number_seq')
                ELSE NULL END AS nextval
  `;
  const n = rows?.[0]?.nextval;
  if (n !== undefined && n !== null) return "RES-" + String(n);
  // Fallback (migration ainda não rodou): timestamp + sufixo aleatório, para dois fallbacks no
  // mesmo milissegundo não colidirem no índice único.
  return "RES-" + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// Resolve o UUID real do quarto a partir de um id ou número, restrito ao tenant.
// NÃO cria mais o quarto quando não existe: as telas mandam um id/nº real escolhido de um seletor,
// então "não achou" é sempre um erro (nº digitado errado, quarto de outro hotel) — criar um quarto
// fantasma no cadastro do tenant só mascarava o bug.
export async function resolveRoomId(
  tx: PrismaClientOrTx,
  roomIdOrNumber: string,
  tenantId: string
): Promise<string> {
  const room = await tx.room.findFirst({
    where: { OR: [{ id: roomIdOrNumber }, { number: roomIdOrNumber }], tenantId },
    select: { id: true },
  });
  if (!room) {
    throw new Error(`Quarto "${roomIdOrNumber}" não encontrado neste estabelecimento.`);
  }
  return room.id;
}

// Data-limite EFETIVA de ocupação de uma hospedagem: o maior valor entre a saída prevista e
// (check-in + diárias já lançadas). É a mesma régua que o Mapa de Reservas usa para desenhar a
// barra "EM VIGÊNCIA" (ver occupiedUntilDate em lib/mapQueries.ts, que delega para cá).
//
// Por que não confiar só em `expectedCheckOut`: um hóspede em overstay tem saída prevista no
// passado mas continua no quarto até a recepção finalizar a hospedagem, e o rollover automático de
// diárias empurra `dailiesCount` dia a dia. Um caso real: o agente de IA reservou um quarto para
// "hoje" porque a saída prevista da hospedagem em aberto já tinha passado (23/08), mesmo o hóspede
// ainda estando lá e o sistema já cobrando a 18ª diária.
export function stayOccupiedUntil(stay: {
  checkInDate: Date;
  expectedCheckOut: Date;
  dailiesCount: number;
}): Date {
  const billedThrough = new Date(stay.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stay.dailiesCount);
  return billedThrough > stay.expectedCheckOut ? billedThrough : stay.expectedCheckOut;
}

// Hospedagem em aberto (isClosed:false) que impede uma reserva nova para o período pedido.
// Diferente de findConflictingReservation (que olha a tabela de reservas), aqui a fonte é
// StayCheckin — e a checagem NUNCA usa `expectedCheckOut > checkIn` cru: usa stayOccupiedUntil,
// para pegar overstay. Bloqueia quando a hospedagem começou antes do checkOut pedido E sua
// ocupação efetiva alcança o checkIn pedido. Uma hospedagem que termina antes do período (hóspede
// sai antes da nova reserva começar) não bloqueia.
export async function findBlockingOpenStay(
  tx: PrismaClientOrTx,
  roomId: string,
  checkInDate: Date,
  checkOutDate: Date,
  // Ao editar/prorrogar uma reserva que já teve check-in, a hospedagem dela mesma não pode
  // "bloquear" a própria edição — informe o id da reserva para ignorar a StayCheckin vinculada.
  excludeReservationId?: string
) {
  const stays = await tx.stayCheckin.findMany({
    where: {
      roomId,
      isClosed: false,
      checkInDate: { lt: checkOutDate },
      ...(excludeReservationId ? { reservationId: { not: excludeReservationId } } : {}),
    },
    select: { id: true, checkInDate: true, expectedCheckOut: true, dailiesCount: true },
  });
  return stays.find((s) => stayOccupiedUntil(s) > checkInDate) ?? null;
}

// Conjunto de ids de quartos (dentre os informados) ocupados no período — reserva ativa/futura
// (PRE_RESERVATION/CONFIRMED/CHECKED_IN) que se sobrepõe, ou hospedagem em aberto cuja ocupação
// efetiva (stayOccupiedUntil, cobre overstay) alcança o período. Mesma régua do Mapa de Reservas.
// Extraído de apps/web/src/lib/aiAgent/tools.ts (busyRoomIdsForPeriod) para ser reaproveitado pelo
// match da fila de espera (lib/waitlistMatch.ts) sem duplicar a lógica.
export async function busyRoomIdsForPeriod(
  tx: PrismaClientOrTx,
  roomIds: string[],
  checkIn: Date,
  checkOut: Date
): Promise<Set<string>> {
  if (roomIds.length === 0) return new Set();
  const [overlappingReservations, openStays] = await Promise.all([
    tx.reservation.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: ACTIVE_RESERVATION_STATUSES },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { roomId: true },
    }),
    // NUNCA filtrar por `expectedCheckOut > checkIn` — um hóspede em overstay continua ocupando o
    // quarto. Traz as candidatas e filtra pela ocupação efetiva (stayOccupiedUntil).
    tx.stayCheckin.findMany({
      where: { roomId: { in: roomIds }, isClosed: false, checkInDate: { lt: checkOut } },
      select: { roomId: true, checkInDate: true, expectedCheckOut: true, dailiesCount: true },
    }),
  ]);
  const busyByStay = openStays.filter((s) => stayOccupiedUntil(s) > checkIn).map((s) => s.roomId);
  return new Set<string>([...overlappingReservations.map((r) => r.roomId), ...busyByStay]);
}

// Serializa por quarto toda operação que cria/move uma reserva ou abre uma hospedagem: trava as
// linhas de `rooms` informadas pelo resto da transação (`SELECT ... FOR UPDATE`). Chame SEMPRE
// dentro da transação, ANTES de checar conflito e gravar.
//
// Por quê: o Postgres roda em READ COMMITTED. Sem esta trava, duas transações concorrentes para o
// mesmo quarto/período leem `findConflictingReservation` → nenhuma enxerga o `reservation.create`
// ainda não commitado da outra → as duas passam e as duas inserem = overbooking. Não é erro de
// serialização, então o `txWithRetry` não reexecuta. Com a trava, a segunda transação espera aqui
// até a primeira terminar (commit/rollback) e então revê o conflito já com a reserva da primeira
// visível. Mesmo padrão já usado em `stay/checkin` (linha do quarto travada no início da tx).
//
// Os ids são ordenados antes de travar: duas transações que precisem do mesmo conjunto de quartos
// adquirem as linhas na mesma ordem e nunca formam deadlock cruzado.
export async function lockRoomsForReservation(
  tx: PrismaClientOrTx,
  roomIds: (string | null | undefined)[]
): Promise<void> {
  const ids = [...new Set(roomIds.filter((x): x is string => !!x))].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT id FROM rooms WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`;
}

// Status de reserva que ocupam o quarto no período (bloqueiam nova reserva / walk-in). Constante
// ÚNICA para todos os módulos não divergirem: CANCELLED (cancelada), CHECKED_OUT (já saiu) e
// NO_SHOW (não compareceu — o quarto foi liberado pela rotina de no-show) NÃO bloqueiam.
export const ACTIVE_RESERVATION_STATUSES: ReservationStatus[] = ["PRE_RESERVATION", "CONFIRMED", "CHECKED_IN"];

// Verifica se existe alguma reserva ativa (ver ACTIVE_RESERVATION_STATUSES) sobrepondo o período
// informado para o quarto indicado. Usado tanto na criação individual quanto em lote, sempre
// dentro da própria transação Prisma, para que a checagem de conflito seja atômica e não apenas
// uma validação de UI — duas reservas do mesmo lote para o mesmo quarto também são pegas aqui,
// pois cada `create` anterior já fica visível para os `findFirst` seguintes dentro da mesma tx.
export async function findConflictingReservation(
  tx: PrismaClientOrTx,
  roomId: string,
  checkInDate: Date,
  checkOutDate: Date,
  excludeReservationId?: string
) {
  return tx.reservation.findFirst({
    where: {
      roomId,
      id: excludeReservationId ? { not: excludeReservationId } : undefined,
      status: { in: ACTIVE_RESERVATION_STATUSES },
      checkInDate: { lt: checkOutDate },
      checkOutDate: { gt: checkInDate },
    },
  });
}

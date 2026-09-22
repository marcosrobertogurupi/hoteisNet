import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { resolveOperator } from "@/lib/operator";
import {
  findBlockingOpenStay,
  findConflictingReservation,
  lockRoomsForReservation,
  stayOccupiedUntil,
} from "@/lib/reservationHelpers";

// Erro de regra de negócio (quarto de destino inválido, conflito de reserva...) — vira 409 com a
// mensagem para o operador, em vez do 500 genérico reservado para falha inesperada.
class TransferRoomError extends Error {}

// Mesma nota que o check-out grava no quarto que fica para trás (ver /api/stay/checkin): é o que a
// governança e o Mapa de Quartos exibem para um quarto aguardando higienização.
const ORIGIN_ROOM_NOTES = "Pendente troca de enxoval & higienização";

// POST /api/stay/transfer-room — move a hospedagem ATIVA de um quarto ocupado para um quarto livre
// e limpo, replicando a tela WIN_TransferenciaQuarto do sistema WinDev original (que troca
// Hpd_IDQuarto da hospedagem e marca o quarto de destino como ocupado).
//
// Diferença deliberada em relação ao legado: lá o quarto de origem voltava como "D" (disponível);
// aqui ele vai direto para VACANT_DIRTY (limpeza), pois o hóspede saiu dele com o quarto usado.
//
// Regras (todas revalidadas dentro da transação — a lista do front é só conveniência):
//   - hospedagem aberta, do tenant da sessão, num quarto OCUPADO;
//   - destino: do mesmo tenant, ativo, de hospedagem (LODGING), VACANT_CLEAN, sem hospedagem em
//     aberto e sem reserva ativa sobrepondo o restante da estadia (ChecarReserva do WinDev);
//   - a reserva vinculada à hospedagem acompanha o hóspede para o quarto novo (Mapa de Reservas).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const body = await req.json();
    const stayCheckinId = String(body?.stayCheckinId || "");
    const toRoomId = String(body?.toRoomId || "");
    if (!stayCheckinId || !toRoomId) {
      return NextResponse.json(
        { success: false, error: "Hospedagem e quarto de destino são obrigatórios." },
        { status: 400 }
      );
    }

    // Só o quarto de origem atual, para poder travar as linhas na ordem certa abaixo; tudo o mais é
    // relido dentro da transação, já com a trava.
    const stayRef = await prisma.stayCheckin.findFirst({
      where: { id: stayCheckinId, tenantId },
      select: { roomId: true },
    });
    if (!stayRef) {
      return NextResponse.json({ success: false, error: "Hospedagem não encontrada." }, { status: 404 });
    }
    if (stayRef.roomId === toRoomId) {
      return NextResponse.json(
        { success: false, error: "O quarto de destino deve ser diferente do quarto de origem." },
        { status: 400 }
      );
    }

    const { operatorId, operatorName } = resolveOperator(session);

    const result = await txWithRetry(async (tx) => {
      // Ordem de travas igual à do check-out (hospedagem primeiro, depois os quartos): um check-out
      // concorrente da mesma hospedagem espera aqui, e nunca forma deadlock cruzado com esta rota.
      await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stayCheckinId} FOR UPDATE`;
      await lockRoomsForReservation(tx, [stayRef.roomId, toRoomId]);

      const stay = await tx.stayCheckin.findFirst({
        where: { id: stayCheckinId, tenantId },
        select: {
          roomId: true,
          isClosed: true,
          checkInDate: true,
          expectedCheckOut: true,
          dailiesCount: true,
          reservationId: true,
          primaryGuest: { select: { fullName: true } },
        },
      });
      if (!stay) throw new TransferRoomError("Hospedagem não encontrada.");
      if (stay.isClosed) throw new TransferRoomError("Esta hospedagem já foi encerrada e não pode ser transferida.");
      if (stay.roomId !== stayRef.roomId) {
        throw new TransferRoomError("A hospedagem já foi transferida por outro terminal. Atualize o mapa e tente novamente.");
      }

      const [fromRoom, toRoom] = await Promise.all([
        tx.room.findFirst({ where: { id: stay.roomId, tenantId }, select: { id: true, number: true, status: true } }),
        tx.room.findFirst({
          where: { id: toRoomId, tenantId },
          select: {
            id: true,
            number: true,
            floor: true,
            status: true,
            active: true,
            category: { select: { name: true, kind: true } },
          },
        }),
      ]);
      if (!fromRoom) throw new TransferRoomError("Quarto de origem não encontrado.");
      if (!toRoom) throw new TransferRoomError("Quarto de destino não encontrado.");

      // Regra do usuário: a transferência só existe para quarto OCUPADO...
      if (fromRoom.status !== "OCCUPIED") {
        throw new TransferRoomError(`O quarto ${fromRoom.number} não está ocupado — só é possível transferir quartos ocupados.`);
      }
      // ...e só para quarto LIVRE e LIMPO.
      if (!toRoom.active) throw new TransferRoomError(`O quarto ${toRoom.number} está inativo.`);
      if (toRoom.category.kind !== "LODGING") {
        throw new TransferRoomError(`O quarto ${toRoom.number} não é uma acomodação de hospedagem.`);
      }
      if (toRoom.status !== "VACANT_CLEAN") {
        throw new TransferRoomError(
          `O quarto ${toRoom.number} não está livre e limpo (${toRoom.status === "OCCUPIED" ? "ocupado" : toRoom.status === "VACANT_DIRTY" ? "em limpeza" : "em manutenção"}). Escolha um quarto livre e limpo.`
        );
      }

      // Equivalente ao ChecarReserva do WinDev: destino sem hospedagem em aberto nem reserva ativa
      // sobrepondo o restante da estadia. Usa stayOccupiedUntil (cobre overstay) — a mesma régua
      // canônica dos mapas — e não `expectedCheckOut` cru.
      const now = new Date();
      const occupiedUntil = stayOccupiedUntil(stay);
      const [openStay, conflict] = await Promise.all([
        findBlockingOpenStay(tx, toRoom.id, now, occupiedUntil),
        findConflictingReservation(tx, toRoom.id, now, occupiedUntil, stay.reservationId || undefined),
      ]);
      if (openStay) {
        throw new TransferRoomError(`O quarto ${toRoom.number} possui uma hospedagem em aberto.`);
      }
      if (conflict) {
        throw new TransferRoomError(
          `Existe reserva feita para o período da estadia no quarto ${toRoom.number} (${conflict.guestName}, ${conflict.checkInDate.toLocaleDateString("pt-BR")} a ${conflict.checkOutDate.toLocaleDateString("pt-BR")}).`
        );
      }

      // Escritas com o filtro de tenant/estado direto no WHERE (nunca update por id puro): se algo
      // mudou entre a leitura e a escrita, count=0 aborta a transação inteira.
      const movedStay = await tx.stayCheckin.updateMany({
        where: { id: stayCheckinId, tenantId, roomId: fromRoom.id, isClosed: false },
        data: { roomId: toRoom.id },
      });
      if (movedStay.count !== 1) throw new TransferRoomError("Não foi possível transferir a hospedagem. Tente novamente.");

      const occupiedDest = await tx.room.updateMany({
        where: { id: toRoom.id, tenantId, status: "VACANT_CLEAN", active: true },
        data: { status: "OCCUPIED", notes: null },
      });
      if (occupiedDest.count !== 1) throw new TransferRoomError(`O quarto ${toRoom.number} deixou de estar disponível. Atualize o mapa.`);

      const releasedOrigin = await tx.room.updateMany({
        where: { id: fromRoom.id, tenantId, status: "OCCUPIED" },
        data: { status: "VACANT_DIRTY", notes: ORIGIN_ROOM_NOTES },
      });
      if (releasedOrigin.count !== 1) throw new TransferRoomError(`O quarto ${fromRoom.number} deixou de estar ocupado. Atualize o mapa.`);

      // A reserva que originou a hospedagem acompanha o hóspede: sem isso o Mapa de Reservas
      // continuaria desenhando a barra no quarto antigo.
      if (stay.reservationId) {
        await tx.reservation.updateMany({
          where: { id: stay.reservationId, tenantId },
          data: {
            roomId: toRoom.id,
            roomDescription: toRoom.number,
            roomCategory: toRoom.category.name,
            roomFloor: toRoom.floor,
          },
        });
      }

      return {
        fromRoomNumber: fromRoom.number,
        toRoomNumber: toRoom.number,
        guestName: stay.primaryGuest.fullName,
        checkInDate: stay.checkInDate,
        expectedCheckOut: stay.expectedCheckOut,
      };
    });

    // Equivalente ao AddHistoricoSenha do WinDev: quem transferiu, de qual quarto para qual.
    await logActivity({
      tenantId,
      userId: operatorId,
      userName: operatorName,
      action: "ROOM_TRANSFER",
      description: `${operatorName} transferiu a hospedagem de ${result.guestName} do quarto ${result.fromRoomNumber} para o quarto ${result.toRoomNumber}. Período: ${result.checkInDate.toLocaleDateString("pt-BR")} - ${result.expectedCheckOut.toLocaleDateString("pt-BR")}.`,
      entityType: "STAY_CHECKIN",
      entityId: stayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
      details: {
        stayCheckinId,
        fromRoomId: stayRef.roomId,
        toRoomId,
        fromRoomNumber: result.fromRoomNumber,
        toRoomNumber: result.toRoomNumber,
      },
    });

    return NextResponse.json({
      success: true,
      fromRoomNumber: result.fromRoomNumber,
      toRoomNumber: result.toRoomNumber,
      message: `Hospedagem transferida do quarto ${result.fromRoomNumber} para o quarto ${result.toRoomNumber}. O quarto ${result.fromRoomNumber} foi enviado para limpeza.`,
    });
  } catch (error: any) {
    if (error instanceof TransferRoomError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error("[POST /api/stay/transfer-room] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao transferir o hóspede de quarto. Tente novamente." }, { status: 500 });
  }
}

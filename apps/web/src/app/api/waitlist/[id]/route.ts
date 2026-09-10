import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import {
  waitlistCheckInAt,
  waitlistCheckOutAt,
  sanitizeParty,
  pastCheckInError,
  partyOverCapacityError,
} from "@/lib/waitlistMatch";

// PATCH /api/waitlist/:id — edita datas / nº de pessoas / observações de uma entrada ainda WAITING.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const { checkInDate, checkOutDate, adults, children, notes } = body;

    // A entrada atual dá os valores efetivos para validar edições parciais (mudar só a chegada
    // não pode gerar um período invertido com a saída que já estava salva, etc.).
    const current = await prisma.waitlistEntry.findFirst({
      where: { id, tenantId: session.tenantId, status: "WAITING" },
      select: { checkInDate: true, checkOutDate: true, adults: true, children: true },
    });
    if (!current) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada ou não está mais na fila." }, { status: 404 });
    }

    const data: Record<string, unknown> = {};

    const effectiveCheckIn = checkInDate ? waitlistCheckInAt(new Date(checkInDate)) : current.checkInDate;
    const effectiveCheckOut = checkOutDate ? waitlistCheckOutAt(new Date(checkOutDate)) : current.checkOutDate;
    if (isNaN(effectiveCheckIn.getTime()) || isNaN(effectiveCheckOut.getTime())) {
      return NextResponse.json({ success: false, error: "Datas inválidas." }, { status: 400 });
    }
    if (checkInDate || checkOutDate) {
      if (effectiveCheckOut <= effectiveCheckIn) {
        return NextResponse.json({ success: false, error: "A data de saída precisa ser depois da chegada." }, { status: 400 });
      }
      if (checkInDate) {
        const pastErr = pastCheckInError(effectiveCheckIn);
        if (pastErr) return NextResponse.json({ success: false, error: pastErr }, { status: 400 });
      }
      if (checkInDate) data.checkInDate = effectiveCheckIn;
      if (checkOutDate) data.checkOutDate = effectiveCheckOut;
    }

    if (adults !== undefined || children !== undefined) {
      const { adults: adultsN, children: childrenN } = sanitizeParty(
        adults !== undefined ? adults : current.adults,
        children !== undefined ? children : current.children,
      );
      const capacityErr = await partyOverCapacityError(prisma, session.tenantId, adultsN, childrenN);
      if (capacityErr) return NextResponse.json({ success: false, error: capacityErr }, { status: 400 });
      if (adults !== undefined) data.adults = adultsN;
      if (children !== undefined) data.children = childrenN;
    }

    if (notes !== undefined) data.notes = notes?.trim() || null;

    // Filtro de tenant DIRETO na escrita (CLAUDE.md, Segurança §3). Só entradas WAITING podem ser
    // editadas — uma entrada já avisada/convertida não muda de período.
    const updated = await prisma.waitlistEntry.updateMany({
      where: { id, tenantId: session.tenantId, status: "WAITING" },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada ou não está mais na fila." }, { status: 404 });
    }

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_UPDATE",
      description: `${session.name || "Usuário"} editou a entrada ${id} da fila de espera.`,
      entityType: "WAITLIST_ENTRY",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/waitlist/:id] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao editar a entrada." }, { status: 500 });
  }
}

// DELETE /api/waitlist/:id — sai da fila (soft: status = CANCELLED). Liberado para qualquer sessão
// autenticada do tenant — a entrada não tem efeito financeiro (diferente de cancelar uma reserva,
// que exige admin por causa do estorno de sinal).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const updated = await prisma.waitlistEntry.updateMany({
      where: { id, tenantId: session.tenantId, status: { in: ["WAITING", "NOTIFIED"] } },
      data: { status: "CANCELLED", closedReason: "CANCELLED_BY_STAFF", notifiedRoomId: null, notifyExpiresAt: null },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Entrada não encontrada ou já encerrada." }, { status: 404 });
    }

    // Fecha a escalação do sino se houver uma aberta para esta entrada.
    await prisma.humanEscalation.updateMany({
      where: { tenantId: session.tenantId, entityType: "WAITLIST_MATCH", entityId: id, resolved: false },
      data: { resolved: true, resolvedAt: new Date() },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_CANCEL",
      description: `${session.name || "Usuário"} removeu a entrada ${id} da fila de espera.`,
      entityType: "WAITLIST_ENTRY",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/waitlist/:id] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao remover da fila." }, { status: 500 });
  }
}

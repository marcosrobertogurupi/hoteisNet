import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { waitlistCheckInAt, waitlistCheckOutAt } from "@/lib/waitlistMatch";

// Campos que a tela de gestão da fila de espera desenha — select explícito, sem `include`, sem
// spread do registro na resposta (CLAUDE.md, Performance §1–§3).
const WAITLIST_SELECT = {
  id: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  guestCpf: true,
  guestId: true,
  roomCategoryId: true,
  roomCategoryName: true,
  checkInDate: true,
  checkOutDate: true,
  adults: true,
  children: true,
  notes: true,
  status: true,
  source: true,
  operatorName: true,
  notifiedAt: true,
  notifyExpiresAt: true,
  notifiedRoomId: true,
  convertedReservationId: true,
  closedReason: true,
  createdAt: true,
} as const;

// GET /api/waitlist?status=WAITING,NOTIFIED — lista a fila de espera do tenant da sessão.
// Sem `status`, traz só as entradas ativas (WAITING + NOTIFIED). A ordem da fila é createdAt asc.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const statuses = statusParam
      ? statusParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : ["WAITING", "NOTIFIED"];

    const entries = await prisma.waitlistEntry.findMany({
      where: { tenantId: session.tenantId, status: { in: statuses as any } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: WAITLIST_SELECT,
      take: 200,
    });

    return NextResponse.json({ success: true, entries });
  } catch (error: any) {
    console.error("[GET /api/waitlist] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar a fila." }, { status: 500 });
  }
}

// POST /api/waitlist — adiciona uma entrada manual à fila (recepção).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const {
      guestName,
      guestPhone,
      guestEmail,
      guestCpf,
      guestId,
      roomCategoryId,
      checkInDate,
      checkOutDate,
      adults = 1,
      children = 0,
      notes,
      operatorId,
      operatorName,
    } = body;

    if (!guestName?.trim() || !roomCategoryId || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, error: "Campos obrigatórios faltando: hóspede, categoria, chegada ou saída." },
        { status: 400 },
      );
    }

    // Categoria SEMPRE revalidada contra o tenant da sessão — o nome gravado vem do cadastro, nunca
    // do body (CLAUDE.md, Segurança §2/§4).
    const category = await prisma.roomCategory.findFirst({
      where: { id: roomCategoryId, tenantId: session.tenantId, active: true },
      select: { id: true, name: true, kind: true },
    });
    if (!category) {
      return NextResponse.json({ success: false, error: "Categoria de apartamento não encontrada." }, { status: 400 });
    }
    if (category.kind === "EVENT_SPACE") {
      return NextResponse.json({ success: false, error: "Espaços de eventos não entram na fila de espera." }, { status: 400 });
    }

    // guestId, se informado, precisa pertencer ao mesmo tenant (padrão createReservationForAgent).
    let realGuestId: string | null = null;
    if (guestId) {
      const guest = await prisma.guest.findFirst({
        where: { id: guestId, tenantId: session.tenantId },
        select: { id: true },
      });
      realGuestId = guest?.id || null;
    }

    // Datas ancoradas no horário padrão do hotel em Brasília — igual ao fluxo de reserva, para o
    // match de período (lib/waitlistMatch.ts) nunca divergir por causa de meia-noite UTC.
    const checkIn = waitlistCheckInAt(new Date(checkInDate));
    const checkOut = waitlistCheckOutAt(new Date(checkOutDate));
    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      return NextResponse.json({ success: false, error: "Datas inválidas." }, { status: 400 });
    }

    const entry = await prisma.waitlistEntry.create({
      data: {
        tenantId: session.tenantId,
        guestName: guestName.trim(),
        guestPhone: guestPhone?.trim() || null,
        guestEmail: guestEmail?.trim().toLowerCase() || null,
        guestCpf: guestCpf?.replace(/\D/g, "") || null,
        guestId: realGuestId,
        roomCategoryId: category.id,
        roomCategoryName: category.name,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        adults: Number(adults) || 1,
        children: Number(children) || 0,
        notes: notes?.trim() || null,
        source: "MANUAL",
        operatorId: operatorId || session.userId || null,
        operatorName: operatorName || session.name || null,
      },
      select: { id: true },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_CREATE",
      description: `${session.name || "Usuário"} adicionou ${guestName} à fila de espera (${category.name}).`,
      entityType: "WAITLIST_ENTRY",
      entityId: entry.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, id: entry.id });
  } catch (error: any) {
    console.error("[POST /api/waitlist] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao adicionar à fila." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { parseBrasiliaDateTime } from "@/lib/brasiliaDate";
import { OPEN_MAINTENANCE_STAGES, MaintenanceError, openMaintenanceTicket } from "@/lib/maintenance";

// Campos da listagem de OS — só o que o painel/mapa desenha (CLAUDE.md, ⚡ Performance §1–§4).
const TICKET_LIST_SELECT = {
  id: true,
  number: true,
  stage: true,
  description: true,
  openedAt: true,
  openedByName: true,
  expectedReleaseAt: true,
  resolvedAt: true,
  downtimeMinutes: true,
  cancelledAt: true,
  room: { select: { id: true, number: true } },
  problemType: { select: { name: true } },
  assignedEmployee: { select: { id: true, name: true } },
  waitReason: { select: { name: true } },
  _count: { select: { photos: true } },
} as const;

const MAX_LIST = 300;

// GET /api/manutencao/os — OS do hotel.
//   ?situacao=abertas (padrão) → só as abertas (Entrada/Avaliando/Aguardando)
//   ?situacao=todas&de=AAAA-MM-DD&ate=AAAA-MM-DD → todas abertas no período (padrão: últimos 30 dias)
//   ?situacao=resolvidas&dias=N → resolvidas nos últimos N dias (pela data de retorno do quarto)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const sp = req.nextUrl.searchParams;
    const situacaoParam = sp.get("situacao");
    const situacao = situacaoParam === "todas" || situacaoParam === "resolvidas" ? situacaoParam : "abertas";

    let where: Prisma.MaintenanceTicketWhereInput = { tenantId: session.tenantId, stage: { in: OPEN_MAINTENANCE_STAGES } };
    if (situacao === "resolvidas") {
      // Coluna "Resolvidas" do funil: pela data de RETORNO do quarto (padrão: últimos 7 dias).
      const dias = Math.min(90, Math.max(1, Number(sp.get("dias")) || 7));
      where = {
        tenantId: session.tenantId,
        stage: "RESOLVED",
        resolvedAt: { gte: new Date(Date.now() - dias * 24 * 60 * 60 * 1000) },
      };
    } else if (situacao === "todas") {
      const ate = sp.get("ate") ? parseBrasiliaDateTime(sp.get("ate"), "23:59") : new Date();
      const de = sp.get("de")
        ? parseBrasiliaDateTime(sp.get("de"), "00:00")
        : new Date(ate.getTime() - 30 * 24 * 60 * 60 * 1000);
      if (isNaN(de.getTime()) || isNaN(ate.getTime())) {
        return NextResponse.json({ success: false, error: "Período inválido." }, { status: 400 });
      }
      where = { tenantId: session.tenantId, openedAt: { gte: de, lte: new Date(ate.getTime() + 59_999) } };
    }

    const tickets = await prisma.maintenanceTicket.findMany({
      where,
      orderBy: { openedAt: "desc" },
      take: MAX_LIST,
      select: TICKET_LIST_SELECT,
    });

    return NextResponse.json({
      success: true,
      tickets: tickets.map((t) => ({
        id: t.id,
        number: t.number,
        stage: t.stage,
        description: t.description,
        openedAt: t.openedAt,
        openedByName: t.openedByName,
        expectedReleaseAt: t.expectedReleaseAt,
        resolvedAt: t.resolvedAt,
        downtimeMinutes: t.downtimeMinutes,
        cancelledAt: t.cancelledAt,
        roomId: t.room.id,
        roomNumber: t.room.number,
        problemType: t.problemType.name,
        employeeId: t.assignedEmployee.id,
        employeeName: t.assignedEmployee.name,
        waitReason: t.waitReason?.name ?? null,
        photoCount: t._count.photos,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/manutencao/os] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar as ordens de serviço." }, { status: 500 });
  }
}

// POST /api/manutencao/os — recepção abre uma OS: o quarto entra em manutenção e o colaborador é
// avisado por WhatsApp pelo worker. Qualquer usuário do hotel pode abrir.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { roomId, problemTypeId, description, assignedEmployeeId, expectedReleaseAt } = body || {};
    if (!roomId || !problemTypeId || !assignedEmployeeId) {
      return NextResponse.json(
        { success: false, error: "Informe o quarto, o tipo de problema e o colaborador de manutenção." },
        { status: 400 },
      );
    }

    let forecast: Date | null = null;
    if (expectedReleaseAt) {
      forecast = parseBrasiliaDateTime(expectedReleaseAt, "12:00");
      if (isNaN(forecast.getTime())) {
        return NextResponse.json({ success: false, error: "Previsão de liberação inválida." }, { status: 400 });
      }
    }

    const ticket = await openMaintenanceTicket({
      tenantId: session.tenantId,
      roomId: String(roomId),
      problemTypeId: String(problemTypeId),
      description: String(description || ""),
      assignedEmployeeId: String(assignedEmployeeId),
      expectedReleaseAt: forecast,
      actor: { userId: session.userId, name: session.name },
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "MAINTENANCE_OPEN",
      description: `${session.name} abriu a OS nº ${ticket.number} do quarto ${ticket.roomNumber} (${ticket.problemTypeName}) para ${ticket.employeeName}.`,
      entityType: "MAINTENANCE_TICKET",
      entityId: ticket.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, ticket: { id: ticket.id, number: ticket.number } }, { status: 201 });
  } catch (error: any) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[POST /api/manutencao/os] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao abrir a ordem de serviço." }, { status: 500 });
  }
}

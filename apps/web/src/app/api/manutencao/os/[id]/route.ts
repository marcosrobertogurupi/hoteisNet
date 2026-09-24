import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireTenantAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { signedMaintenancePhotoUrls } from "@/lib/maintenancePhotoStorage";
import {
  MaintenanceError,
  cancelMaintenanceTicket,
  reassignMaintenanceTicket,
  resendMaintenanceNotice,
} from "@/lib/maintenance";

// GET /api/manutencao/os/[id] — OS completa com a linha do tempo (tela "Ver OS").
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;

    const t = await prisma.maintenanceTicket.findFirst({
      where: { id, tenantId: session.tenantId },
      select: {
        id: true,
        number: true,
        stage: true,
        description: true,
        openedAt: true,
        openedByName: true,
        expectedReleaseAt: true,
        resolvedAt: true,
        resolutionNotes: true,
        downtimeMinutes: true,
        cancelledAt: true,
        cancelledByName: true,
        cancelReason: true,
        notifyStatus: true,
        notifiedAt: true,
        room: { select: { id: true, number: true } },
        problemType: { select: { name: true } },
        assignedEmployee: { select: { id: true, name: true } },
        waitReason: { select: { name: true } },
        events: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            type: true,
            fromStage: true,
            toStage: true,
            note: true,
            actorType: true,
            actorName: true,
            createdAt: true,
            waitReason: { select: { name: true } },
          },
        },
        photos: { orderBy: { createdAt: "asc" }, select: { id: true, storagePath: true, createdAt: true, actorName: true } },
      },
    });
    if (!t) return NextResponse.json({ success: false, error: "OS não encontrada." }, { status: 404 });

    // Fotos no bucket privado: URL assinada de curta duração, gerada só na abertura do "Ver OS".
    const photoUrls = await signedMaintenancePhotoUrls(t.photos.map((p) => p.storagePath));

    return NextResponse.json({
      success: true,
      ticket: {
        id: t.id,
        number: t.number,
        stage: t.stage,
        description: t.description,
        openedAt: t.openedAt,
        openedByName: t.openedByName,
        expectedReleaseAt: t.expectedReleaseAt,
        resolvedAt: t.resolvedAt,
        resolutionNotes: t.resolutionNotes,
        downtimeMinutes: t.downtimeMinutes,
        cancelledAt: t.cancelledAt,
        cancelledByName: t.cancelledByName,
        cancelReason: t.cancelReason,
        notifyStatus: t.notifyStatus,
        notifiedAt: t.notifiedAt,
        roomId: t.room.id,
        roomNumber: t.room.number,
        problemType: t.problemType.name,
        employeeId: t.assignedEmployee.id,
        employeeName: t.assignedEmployee.name,
        waitReason: t.waitReason?.name ?? null,
        events: t.events.map((e) => ({
          id: e.id,
          type: e.type,
          fromStage: e.fromStage,
          toStage: e.toStage,
          note: e.note,
          actorType: e.actorType,
          actorName: e.actorName,
          createdAt: e.createdAt,
          waitReason: e.waitReason?.name ?? null,
        })),
        photos: t.photos.map((p, i) => ({ id: p.id, url: photoUrls[i], createdAt: p.createdAt, actorName: p.actorName })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/manutencao/os/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar a OS." }, { status: 500 });
  }
}

// PATCH /api/manutencao/os/[id] — ações da recepção/admin numa OS aberta:
//   { acao: "reenviar-aviso" }          → qualquer usuário: tenta de novo o WhatsApp que falhou
//   { acao: "reatribuir", employeeId }  → admin: passa a OS para outro colaborador (novo aviso)
//   { acao: "cancelar", motivo }        → admin: OS aberta por engano; o quarto volta à situação anterior
// Avançar etapa NÃO passa por aqui: é exclusivo do colaborador atribuído, pelo app /manutencao.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;
    const { id } = await params;
    const actor = { userId: session.userId, name: session.name };

    const body = await req.json().catch(() => ({}));
    const acao = body?.acao;

    if (acao === "reenviar-aviso") {
      await resendMaintenanceNotice({ tenantId, ticketId: id });
      await logActivity({
        tenantId,
        userId: actor.userId,
        userName: actor.name,
        action: "MAINTENANCE_NOTICE_RESEND",
        description: `${actor.name} pediu o reenvio do aviso de WhatsApp de uma OS de manutenção.`,
        entityType: "MAINTENANCE_TICKET",
        entityId: id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
      return NextResponse.json({ success: true });
    }

    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    if (acao === "reatribuir") {
      if (!body.employeeId) {
        return NextResponse.json({ success: false, error: "Escolha o novo colaborador." }, { status: 400 });
      }
      const r = await reassignMaintenanceTicket({ tenantId, ticketId: id, employeeId: String(body.employeeId), actor });
      await logActivity({
        tenantId,
        userId: actor.userId,
        userName: actor.name,
        action: "MAINTENANCE_REASSIGN",
        description: `${actor.name} passou a OS nº ${r.number} (quarto ${r.roomNumber}) de ${r.from} para ${r.to}.`,
        entityType: "MAINTENANCE_TICKET",
        entityId: id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
      return NextResponse.json({ success: true });
    }

    if (acao === "cancelar") {
      const r = await cancelMaintenanceTicket({ tenantId, ticketId: id, reason: String(body.motivo || ""), actor });
      await logActivity({
        tenantId,
        userId: actor.userId,
        userName: actor.name,
        action: "MAINTENANCE_CANCEL",
        description: `${actor.name} cancelou a OS nº ${r.number} (quarto ${r.roomNumber}).`,
        entityType: "MAINTENANCE_TICKET",
        entityId: id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
        details: { motivo: String(body.motivo || "").trim() },
      });
      return NextResponse.json({ success: true, roomStatus: r.roomStatus });
    }

    return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
  } catch (error: any) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[PATCH /api/manutencao/os/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao atualizar a OS." }, { status: 500 });
  }
}

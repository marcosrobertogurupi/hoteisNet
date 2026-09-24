import { NextRequest, NextResponse } from "next/server";
import type { MaintenanceStage } from "@prisma/client";
import { getMaintenanceUser } from "@/lib/maintenanceSession";
import { parseBrasiliaDateTime } from "@/lib/brasiliaDate";
import { logActivity } from "@/lib/audit";
import { getClientIp } from "@/lib/auth";
import { MaintenanceError, advanceMaintenanceTicket, MAINTENANCE_STAGE_LABEL } from "@/lib/maintenance";

const STAGES = new Set<MaintenanceStage>(["EVALUATING", "WAITING", "RESOLVED"]);

// POST /api/manutencao-app/os/[id]/etapa — o colaborador atribuído avança a OS:
//   { etapa: "EVALUATING" | "WAITING" | "RESOLVED", motivoId?, previsao?, observacao?, oQueFoiFeito? }
// Toda a regra (quem pode, para onde, campos obrigatórios) fica em lib/maintenance.ts.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const etapa = String(body?.etapa || "") as MaintenanceStage;
    if (!STAGES.has(etapa)) return NextResponse.json({ success: false, error: "Etapa inválida." }, { status: 400 });

    let forecast: Date | null = null;
    if (body?.previsao) {
      forecast = parseBrasiliaDateTime(body.previsao, "12:00");
      if (isNaN(forecast.getTime())) {
        return NextResponse.json({ success: false, error: "Previsão de liberação inválida." }, { status: 400 });
      }
    }

    const r = await advanceMaintenanceTicket({
      tenantId: user.tenantId,
      ticketId: id,
      employeeId: user.employeeId,
      employeeName: user.name,
      toStage: etapa,
      waitReasonId: body?.motivoId ? String(body.motivoId) : null,
      expectedReleaseAt: forecast,
      note: typeof body?.observacao === "string" ? body.observacao : null,
      resolutionNotes: typeof body?.oQueFoiFeito === "string" ? body.oQueFoiFeito : null,
    });

    await logActivity({
      tenantId: user.tenantId,
      userId: null,
      userName: user.name,
      action: "MAINTENANCE_STAGE",
      description: `${user.name} levou a OS nº ${r.number} (quarto ${r.roomNumber}) para "${MAINTENANCE_STAGE_LABEL[r.stage]}".`,
      entityType: "MAINTENANCE_TICKET",
      entityId: id,
      ipAddress: getClientIp(req),
      details: { employeeId: user.employeeId },
    });

    return NextResponse.json({ success: true, stage: r.stage });
  } catch (error: any) {
    if (error instanceof MaintenanceError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("[POST /api/manutencao-app/os/[id]/etapa] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao atualizar a OS." }, { status: 500 });
  }
}

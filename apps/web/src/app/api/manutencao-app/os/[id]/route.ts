import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaintenanceUser } from "@/lib/maintenanceSession";
import { allowedNextStages } from "@/lib/maintenance";
import { signedMaintenancePhotoUrls } from "@/lib/maintenancePhotoStorage";

// GET /api/manutencao-app/os/[id] — OS completa para o colaborador atribuído: problema, etapas
// possíveis a partir da atual, linha do tempo e fotos (URLs assinadas de curta duração).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    const { id } = await params;

    const t = await prisma.maintenanceTicket.findFirst({
      where: { id, tenantId: user.tenantId, assignedEmployeeId: user.employeeId },
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
        room: { select: { number: true, floor: true } },
        problemType: { select: { name: true } },
        waitReason: { select: { id: true, name: true } },
        events: {
          orderBy: { createdAt: "asc" },
          select: { id: true, type: true, toStage: true, note: true, actorName: true, createdAt: true, waitReason: { select: { name: true } } },
        },
        photos: { orderBy: { createdAt: "asc" }, select: { id: true, storagePath: true, createdAt: true, actorName: true } },
      },
    });
    if (!t) return NextResponse.json({ success: false, error: "OS não encontrada entre as suas." }, { status: 404 });

    const urls = await signedMaintenancePhotoUrls(t.photos.map((p) => p.storagePath));

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
        roomNumber: t.room.number,
        floor: t.room.floor || "",
        problemType: t.problemType.name,
        waitReasonId: t.waitReason?.id ?? null,
        waitReason: t.waitReason?.name ?? null,
        nextStages: allowedNextStages(t.stage),
        events: t.events.map((e) => ({
          id: e.id,
          type: e.type,
          toStage: e.toStage,
          note: e.note,
          actorName: e.actorName,
          createdAt: e.createdAt,
          waitReason: e.waitReason?.name ?? null,
        })),
        photos: t.photos.map((p, i) => ({ id: p.id, url: urls[i], createdAt: p.createdAt, actorName: p.actorName })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/manutencao-app/os/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar a OS." }, { status: 500 });
  }
}

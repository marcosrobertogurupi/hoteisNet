import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaintenanceUser } from "@/lib/maintenanceSession";
import { ensureMaintenanceDefaults } from "@/lib/maintenance";

// GET /api/manutencao-app/opcoes — motivos de espera ativos do hotel (etapa "Aguardando").
export async function GET(req: NextRequest) {
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });

    await ensureMaintenanceDefaults(user.tenantId);
    const waitReasons = await prisma.maintenanceWaitReason.findMany({
      where: { tenantId: user.tenantId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    return NextResponse.json({ success: true, waitReasons });
  } catch (error: any) {
    console.error("[GET /api/manutencao-app/opcoes] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar as opções." }, { status: 500 });
  }
}

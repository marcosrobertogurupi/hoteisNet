import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ensureMaintenanceDefaults } from "@/lib/maintenance";

// GET /api/manutencao/opcoes — listas ativas para abrir/reatribuir uma OS (tipos de problema e
// colaboradores de manutenção), numa chamada só e com o mínimo de campos. Colaborador sem WhatsApp
// não entra: é por ele que chega o aviso da OS.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    await ensureMaintenanceDefaults(tenantId);
    const [problemTypes, employees] = await Promise.all([
      prisma.maintenanceProblemType.findMany({
        where: { tenantId, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.employee.findMany({
        where: { tenantId, active: true, maintenanceTech: true, phone: { not: null }, passwordHash: { not: null } },
        orderBy: { name: "asc" },
        select: { id: true, name: true, phone: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      problemTypes,
      employees: employees.filter((e) => e.phone?.trim()).map((e) => ({ id: e.id, name: e.name })),
    });
  } catch (error: any) {
    console.error("[GET /api/manutencao/opcoes] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar as opções." }, { status: 500 });
  }
}

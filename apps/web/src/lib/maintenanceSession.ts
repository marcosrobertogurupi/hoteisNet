import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaintenanceSession, type MaintenanceSessionPayload } from "@/lib/maintenanceAuth";

// Lê a sessão do app de manutenção (cookie JWT) e revalida contra o banco que o colaborador ainda
// está ativo, marcado como manutenção e com senha — desativar, desmarcar ou tirar a senha derruba
// a sessão na hora. Toda rota /api/manutencao-app/** (exceto login/logout) usa isto.
export async function getMaintenanceUser(req: NextRequest): Promise<MaintenanceSessionPayload | null> {
  const session = await getMaintenanceSession(req);
  if (!session) return null;

  const employee = await prisma.employee.findFirst({
    where: {
      id: session.employeeId,
      tenantId: session.tenantId,
      active: true,
      maintenanceTech: true,
      passwordHash: { not: null },
    },
    select: { id: true, name: true },
  });
  if (!employee) return null;

  return { ...session, name: employee.name };
}

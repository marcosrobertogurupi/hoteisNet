import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMaintenanceUser } from "@/lib/maintenanceSession";

// GET /api/manutencao-app/me — colaborador logado no app de manutenção (revalidado no banco) e o
// tema do hotel.
export async function GET(req: NextRequest) {
  try {
    const user = await getMaintenanceUser(req);
    if (!user) return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });

    const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId }, select: { theme: true, name: true } });
    return NextResponse.json({
      success: true,
      employee: { id: user.employeeId, name: user.name },
      hotelName: tenant?.name || "",
      theme: tenant?.theme || "dark",
    });
  } catch (error: any) {
    console.error("[GET /api/manutencao-app/me] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro." }, { status: 500 });
  }
}

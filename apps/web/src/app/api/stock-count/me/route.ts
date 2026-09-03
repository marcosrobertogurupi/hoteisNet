import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountSession } from "@/lib/stockCountAuth";

// GET /api/stock-count/me — devolve o colaborador logado no app de contagem, revalidando contra o
// banco que ele continua ativo e com senha (rebaixar/desativar derruba a sessão na hora).
export async function GET(req: NextRequest) {
  try {
    const session = await getStockCountSession(req);
    if (!session?.employeeId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const employee = await prisma.employee.findFirst({
      where: { id: session.employeeId, tenantId: session.tenantId, active: true, passwordHash: { not: null } },
      select: { id: true, name: true, phone: true },
    });
    if (!employee) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    return NextResponse.json({ success: true, employee });
  } catch (error: any) {
    console.error("[GET /api/stock-count/me] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// PATCH /api/admin/tenants/[id]
// Ajusta a cota mensal de consultas de CPF (Hub do Desenvolvedor) de um assinante
// específico. Restrito a SUPER_ADMIN — o próprio assinante não configura sua cota.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return NextResponse.json({ success: false, error: "Ação restrita ao SuperAdmin." }, { status: 403 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const { cpfQueryQuotaMonthly } = body;

    if (
      cpfQueryQuotaMonthly === undefined ||
      typeof cpfQueryQuotaMonthly !== "number" ||
      cpfQueryQuotaMonthly < 0 ||
      !Number.isInteger(cpfQueryQuotaMonthly)
    ) {
      return NextResponse.json(
        { success: false, error: "cpfQueryQuotaMonthly deve ser um número inteiro maior ou igual a zero." },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.update({
      where: { id },
      data: { cpfQueryQuotaMonthly },
      select: { id: true, cpfQueryQuotaMonthly: true, cpfQueryUsed: true },
    });

    return NextResponse.json({ success: true, tenant });
  } catch (error: any) {
    console.error("[PATCH /api/admin/tenants/:id] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Assinante não encontrado" }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: "Erro ao atualizar assinante" }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/plano-contas — Lista todo o Plano de Contas cadastrado no banco
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const accounts = await prisma.accountPlan.findMany({
      where: {
        tenantId: { in: tenantIdsToSearch },
      },
      orderBy: {
        code: "asc",
      },
    });

    if (!accounts || accounts.length === 0) {
      const allAccounts = await prisma.accountPlan.findMany({
        orderBy: { code: "asc" },
      });
      return NextResponse.json({ success: true, accounts: allAccounts });
    }

    return NextResponse.json({ success: true, accounts });
  } catch (error: any) {
    console.error("[GET /api/cadastros/plano-contas] Erro ao buscar plano de contas:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

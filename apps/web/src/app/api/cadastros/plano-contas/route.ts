import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// POST /api/cadastros/plano-contas — cria uma nova conta no plano de contas
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, code, description, level, creditoDebito } = body;

    if (!code || !String(code).trim()) {
      return NextResponse.json({ success: false, error: "O código do plano de contas é obrigatório." }, { status: 400 });
    }
    if (!description || !String(description).trim()) {
      return NextResponse.json({ success: false, error: "A descrição da conta é obrigatória." }, { status: 400 });
    }
    if (level !== "Sintética" && level !== "Analítica") {
      return NextResponse.json({ success: false, error: "Informe se a conta é Sintética ou Analítica." }, { status: 400 });
    }
    if (creditoDebito !== "CREDITO" && creditoDebito !== "DEBITO") {
      return NextResponse.json({ success: false, error: "Informe se a conta é de Crédito ou Débito." }, { status: 400 });
    }

    const trimmedCode = String(code).trim();
    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const type = trimmedCode.startsWith("02") ? "RECEITA" : "DESPESA";

    const existing = await prisma.accountPlan.findFirst({
      where: { tenantId: effectiveTenantId, code: trimmedCode },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Já existe uma conta cadastrada com este código." }, { status: 409 });
    }

    const account = await prisma.accountPlan.create({
      data: {
        tenantId: effectiveTenantId,
        code: trimmedCode,
        description: String(description).trim(),
        type,
        level,
        creditoDebito,
      },
    });

    return NextResponse.json({ success: true, account }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/plano-contas] Erro ao criar conta:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/plano-contas — atualiza uma conta existente do plano de contas
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, code, description, level, creditoDebito, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da conta é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};

    if (code !== undefined) {
      if (!String(code).trim()) {
        return NextResponse.json({ success: false, error: "O código do plano de contas é obrigatório." }, { status: 400 });
      }
      const trimmedCode = String(code).trim();
      data.code = trimmedCode;
      data.type = trimmedCode.startsWith("02") ? "RECEITA" : "DESPESA";
    }
    if (description !== undefined) {
      if (!String(description).trim()) {
        return NextResponse.json({ success: false, error: "A descrição da conta é obrigatória." }, { status: 400 });
      }
      data.description = String(description).trim();
    }
    if (level !== undefined) {
      if (level !== "Sintética" && level !== "Analítica") {
        return NextResponse.json({ success: false, error: "Informe se a conta é Sintética ou Analítica." }, { status: 400 });
      }
      data.level = level;
    }
    if (creditoDebito !== undefined) {
      if (creditoDebito !== "CREDITO" && creditoDebito !== "DEBITO") {
        return NextResponse.json({ success: false, error: "Informe se a conta é de Crédito ou Débito." }, { status: 400 });
      }
      data.creditoDebito = creditoDebito;
    }
    if (active !== undefined) data.active = active;

    const account = await prisma.accountPlan.update({ where: { id }, data });

    return NextResponse.json({ success: true, account });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/plano-contas] Erro ao atualizar conta:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/plano-contas?id=... — exclui uma conta do plano de contas
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da conta é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.accountPlan.deleteMany({ where: { id } });

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Conta não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Conta excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/plano-contas] Erro ao excluir conta:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

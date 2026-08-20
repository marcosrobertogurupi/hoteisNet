import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/contas-pagar?status=aberto|pago — lista os títulos de contas a pagar
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");
    const status = searchParams.get("status");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const where: Record<string, unknown> = { tenantId: { in: tenantIdsToSearch } };
    if (status === "aberto") where.isPaid = false;
    if (status === "pago") where.isPaid = true;

    const payables = await prisma.accountsPayable.findMany({
      where,
      orderBy: { dueDate: "asc" },
      include: { settlements: { orderBy: { paidAt: "desc" } } },
    });

    return NextResponse.json({ success: true, payables });
  } catch (error: any) {
    console.error("[GET /api/cadastros/contas-pagar] Erro ao buscar contas a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/contas-pagar — lançamento manual de um título a pagar, vinculado a um
// fornecedor e a uma conta do Plano de Contas (equivalente ao BTN_IncCPagar do Win_ContasPagar)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, supplierId, supplierName, documentNumber, originDocument, accountPlanId, issueDate, dueDate, amount, notes } = body;

    if (!supplierName || !String(supplierName).trim()) {
      return NextResponse.json({ success: false, error: "O fornecedor é obrigatório." }, { status: 400 });
    }
    if (!documentNumber || !String(documentNumber).trim()) {
      return NextResponse.json({ success: false, error: "O número do documento é obrigatório." }, { status: 400 });
    }
    if (!accountPlanId) {
      return NextResponse.json({ success: false, error: "O plano de contas (código de despesa) é obrigatório." }, { status: 400 });
    }
    if (!dueDate) {
      return NextResponse.json({ success: false, error: "A data de vencimento é obrigatória." }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return NextResponse.json({ success: false, error: "Informe um valor maior que zero." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

    const accountPlan = await prisma.accountPlan.findUnique({ where: { id: accountPlanId } });
    if (!accountPlan) {
      return NextResponse.json({ success: false, error: "Plano de contas não encontrado." }, { status: 404 });
    }

    const payable = await prisma.accountsPayable.create({
      data: {
        tenantId: effectiveTenantId,
        supplierId: supplierId || null,
        supplierName: String(supplierName).trim(),
        documentNumber: String(documentNumber).trim(),
        originDocument: originDocument || null,
        accountPlanId,
        accountPlanCode: accountPlan.code,
        issueDate: issueDate ? new Date(issueDate) : new Date(),
        dueDate: new Date(dueDate),
        amount: amountNum,
        notes: notes || null,
      },
    });

    return NextResponse.json({ success: true, payable }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/contas-pagar] Erro ao criar conta a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/contas-pagar — atualiza campos de um título (vencimento, observações)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, dueDate, notes, supplierName } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do título é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (notes !== undefined) data.notes = notes || null;
    if (supplierName !== undefined) {
      if (!String(supplierName).trim()) {
        return NextResponse.json({ success: false, error: "O fornecedor é obrigatório." }, { status: 400 });
      }
      data.supplierName = String(supplierName).trim();
    }

    const payable = await prisma.accountsPayable.update({ where: { id }, data });

    return NextResponse.json({ success: true, payable });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/contas-pagar] Erro ao atualizar conta a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/contas-pagar?id=... — exclui um título (apenas se ainda não tiver baixas)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do título é obrigatório." }, { status: 400 });
    }

    const settlementsCount = await prisma.payableSettlement.count({ where: { accountsPayableId: id } });
    if (settlementsCount > 0) {
      return NextResponse.json(
        { success: false, error: "Não é possível excluir: este título já possui baixas registradas." },
        { status: 409 }
      );
    }

    const deleted = await prisma.accountsPayable.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Título não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Título excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/contas-pagar] Erro ao excluir conta a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

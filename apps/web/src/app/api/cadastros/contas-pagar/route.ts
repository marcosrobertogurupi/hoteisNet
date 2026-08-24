import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/cadastros/contas-pagar?status=aberto|pago — lista os títulos de contas a pagar
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where: Record<string, unknown> = { tenantId: session.tenantId };
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
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { supplierId, supplierName, documentNumber, originDocument, accountPlanId, issueDate, dueDate, amount, notes } = body;

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

    const accountPlan = await prisma.accountPlan.findFirst({ where: { id: accountPlanId, tenantId: session.tenantId } });
    if (!accountPlan) {
      return NextResponse.json({ success: false, error: "Plano de contas não encontrado." }, { status: 404 });
    }

    let realSupplierId: string | null = null;
    if (supplierId) {
      const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, tenantId: session.tenantId }, select: { id: true } });
      realSupplierId = supplier?.id || null;
    }

    const payable = await prisma.accountsPayable.create({
      data: {
        tenantId: session.tenantId,
        supplierId: realSupplierId,
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
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

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

    const updated = await prisma.accountsPayable.updateMany({ where: { id, tenantId: session.tenantId }, data });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Título não encontrado." }, { status: 404 });
    }
    const payable = await prisma.accountsPayable.findUnique({ where: { id } });

    return NextResponse.json({ success: true, payable });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/contas-pagar] Erro ao atualizar conta a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/contas-pagar?id=... — exclui um título (apenas se ainda não tiver baixas). Só admin.
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do título é obrigatório." }, { status: 400 });
    }

    const existing = await prisma.accountsPayable.findFirst({ where: { id, tenantId: session!.tenantId! } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Título não encontrado." }, { status: 404 });
    }

    const settlementsCount = await prisma.payableSettlement.count({ where: { accountsPayableId: id } });
    if (settlementsCount > 0) {
      return NextResponse.json(
        { success: false, error: "Não é possível excluir: este título já possui baixas registradas." },
        { status: 409 }
      );
    }

    const deleted = await prisma.accountsPayable.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Título não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Título excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/contas-pagar] Erro ao excluir conta a pagar:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

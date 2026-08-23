import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/contas-receber?status=aberto|pago — lista os títulos de contas a receber
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

    const receivables = await prisma.accountsReceivable.findMany({
      where,
      orderBy: { dueDate: "asc" },
      include: {
        settlements: { orderBy: { paidAt: "desc" } },
        guest: { select: { id: true, fullName: true } },
        company: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, receivables });
  } catch (error: any) {
    console.error("[GET /api/cadastros/contas-receber] Erro ao buscar contas a receber:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/contas-receber — lançamento manual de um título a receber (fora do fluxo
// automático de pagamento parcelado)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, stayCheckinId, companyId, guestId, billedToName, dueDate, amount, notes } = body;

    if (!billedToName || !String(billedToName).trim()) {
      return NextResponse.json({ success: false, error: "O nome de quem será faturado é obrigatório." }, { status: 400 });
    }
    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "A hospedagem de origem é obrigatória." }, { status: 400 });
    }
    const amountNum = Number(amount);
    if (!amountNum || amountNum <= 0) {
      return NextResponse.json({ success: false, error: "Informe um valor maior que zero." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const issueDate = new Date();
    const effectiveDueDate = dueDate ? new Date(dueDate) : new Date(issueDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const receivable = await prisma.accountsReceivable.create({
      data: {
        tenantId: effectiveTenantId,
        stayCheckinId,
        companyId: companyId || null,
        guestId: guestId || null,
        billedToName: String(billedToName).trim(),
        documentNumber: `${stayCheckinId}.MANUAL.${Date.now()}`,
        issueDate,
        dueDate: effectiveDueDate,
        amount: amountNum,
        paymentMethodDescription: "MANUAL",
        notes: notes || null,
      },
    });

    return NextResponse.json({ success: true, receivable }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/contas-receber] Erro ao criar conta a receber:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/contas-receber — atualiza campos de um título (vencimento, observações)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, dueDate, notes, billedToName } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do título é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (dueDate !== undefined) data.dueDate = new Date(dueDate);
    if (notes !== undefined) data.notes = notes || null;
    if (billedToName !== undefined) {
      if (!String(billedToName).trim()) {
        return NextResponse.json({ success: false, error: "O nome de quem será faturado é obrigatório." }, { status: 400 });
      }
      data.billedToName = String(billedToName).trim();
    }

    const receivable = await prisma.accountsReceivable.update({ where: { id }, data });

    return NextResponse.json({ success: true, receivable });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/contas-receber] Erro ao atualizar conta a receber:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/contas-receber?id=... — exclui um título (apenas se ainda não tiver baixas)
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do título é obrigatório." }, { status: 400 });
    }

    const settlementsCount = await prisma.receivableSettlement.count({ where: { accountsReceivableId: id } });
    if (settlementsCount > 0) {
      return NextResponse.json(
        { success: false, error: "Não é possível excluir: este título já possui baixas registradas." },
        { status: 409 }
      );
    }

    const deleted = await prisma.accountsReceivable.deleteMany({ where: { id } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Título não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Título excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/contas-receber] Erro ao excluir conta a receber:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/cadastros/formas-pagamento — lista as formas de pagamento cadastradas pelo assinante
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const paymentMethods = await prisma.paymentMethod.findMany({
      where: { tenantId: { in: tenantIdsToSearch } },
      orderBy: { description: "asc" },
    });

    return NextResponse.json({ success: true, paymentMethods });
  } catch (error: any) {
    console.error("[GET /api/cadastros/formas-pagamento] Erro ao buscar formas de pagamento:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/cadastros/formas-pagamento — cria uma nova forma de pagamento
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, description, installment, debitGuestBalance, transferDebit, sumsToCashRegister } = body;

    if (!description || !String(description).trim()) {
      return NextResponse.json({ success: false, error: "A descrição da forma de pagamento é obrigatória." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;

    const existing = await prisma.paymentMethod.findFirst({
      where: { tenantId: effectiveTenantId, description: { equals: String(description).trim(), mode: "insensitive" } },
    });
    if (existing) {
      return NextResponse.json({ success: false, error: "Esta forma de pagamento já está cadastrada." }, { status: 409 });
    }

    const paymentMethod = await prisma.paymentMethod.create({
      data: {
        tenantId: effectiveTenantId,
        description: String(description).trim(),
        installment: !!installment,
        debitGuestBalance: !!debitGuestBalance,
        transferDebit: !!transferDebit,
        sumsToCashRegister: sumsToCashRegister === undefined ? true : !!sumsToCashRegister,
      },
    });

    return NextResponse.json({ success: true, paymentMethod }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/formas-pagamento] Erro ao criar forma de pagamento:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/cadastros/formas-pagamento — atualiza uma forma de pagamento existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, description, installment, debitGuestBalance, transferDebit, sumsToCashRegister, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da forma de pagamento é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    if (description !== undefined) {
      if (!String(description).trim()) {
        return NextResponse.json({ success: false, error: "A descrição da forma de pagamento é obrigatória." }, { status: 400 });
      }
      data.description = String(description).trim();
    }
    if (installment !== undefined) data.installment = !!installment;
    if (debitGuestBalance !== undefined) data.debitGuestBalance = !!debitGuestBalance;
    if (transferDebit !== undefined) data.transferDebit = !!transferDebit;
    if (sumsToCashRegister !== undefined) data.sumsToCashRegister = !!sumsToCashRegister;
    if (active !== undefined) data.active = !!active;

    const paymentMethod = await prisma.paymentMethod.update({ where: { id }, data });

    return NextResponse.json({ success: true, paymentMethod });
  } catch (error: any) {
    console.error("[PATCH /api/cadastros/formas-pagamento] Erro ao atualizar forma de pagamento:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/cadastros/formas-pagamento?id=... — exclui uma forma de pagamento
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da forma de pagamento é obrigatório." }, { status: 400 });
    }

    let deleted;
    try {
      deleted = await prisma.paymentMethod.deleteMany({ where: { id } });
    } catch (dbErr: any) {
      if (dbErr?.code === "P2003") {
        return NextResponse.json(
          { success: false, error: "Não é possível excluir: existem lançamentos vinculados a esta forma de pagamento." },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Forma de pagamento não encontrada." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Forma de pagamento excluída com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/formas-pagamento] Erro ao excluir forma de pagamento:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

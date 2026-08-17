import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/caixa/sessao?operatorId=... — retorna o caixa aberto do operador ativo (ou o último
// fechado, se nenhum estiver aberto) com todas as movimentações, para exibir dados reais na tela
// de Gestão de Caixa em vez de valores mockados.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const operatorId = searchParams.get("operatorId");
    const tenantId = searchParams.get("tenantId");

    if (!operatorId) {
      return NextResponse.json({ success: false, error: "operatorId é obrigatório." }, { status: 400 });
    }

    const tenantIdsToSearch = [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[];

    const caixa = await prisma.cashRegister.findFirst({
      where: { operatorId, isOpen: true, tenantId: { in: tenantIdsToSearch } },
      orderBy: { openedAt: "desc" },
      include: { transactions: { orderBy: { createdAt: "asc" } } },
    });

    if (!caixa) {
      return NextResponse.json({ success: true, isOpen: false, caixa: null });
    }

    // Numeração sequencial do caixa (No.Caixa) para o relatório de impressão, seguindo a ordem
    // cronológica de aberturas do tenant — equivalente ao Cai_Numero do sistema WinDev original.
    const caixaNumero = await prisma.cashRegister.count({
      where: { tenantId: caixa.tenantId, openedAt: { lte: caixa.openedAt } },
    });

    const totalDinheiro = caixa.transactions
      .filter((t) => t.type !== "SANGRIA" && t.paymentMethod === "DINHEIRO")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalPix = caixa.transactions
      .filter((t) => t.type === "ENTRADA" && t.paymentMethod === "PIX")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalCartao = caixa.transactions
      .filter((t) => t.type === "ENTRADA" && ["CARTAO", "CARTAO_CREDITO", "CARTAO_DEBITO"].includes(t.paymentMethod))
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalSangrias = caixa.transactions
      .filter((t) => t.type === "SANGRIA")
      .reduce((s, t) => s + Number(t.amount), 0);
    const totalEntradas = caixa.transactions
      .filter((t) => t.type === "ENTRADA" || t.type === "SUPRIMENTO")
      .reduce((s, t) => s + Number(t.amount), 0);

    const saldoTotal = totalEntradas - totalSangrias;

    return NextResponse.json({
      success: true,
      isOpen: true,
      caixa: {
        id: caixa.id,
        caixaNumero,
        operatorId: caixa.operatorId,
        operatorName: caixa.operatorName,
        openingBalance: Number(caixa.openingBalance),
        openedAt: caixa.openedAt,
        closedAt: caixa.closedAt,
        totalDinheiro,
        totalPix,
        totalCartao,
        totalSangrias,
        saldoTotal,
        transactions: caixa.transactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount),
          description: t.description,
          paymentMethod: t.paymentMethod,
          guestName: t.guestName,
          roomNumber: t.roomNumber,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/caixa/sessao] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar sessão de caixa." }, { status: 500 });
  }
}

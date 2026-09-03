import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { getTenantHeaderInfo } from "@/lib/tenantHeader";

// Converte um intervalo de datas "YYYY-MM-DD" (inclusivo nas duas pontas) escolhido pelo usuário
// para instantes UTC, tratando as datas no fuso de Brasília (UTC-3 fixo), independente do fuso do
// processo Node — mesma lógica de src/lib/brasiliaDate.ts.
function brasiliaRange(fromStr: string, toStr: string) {
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const start = new Date(Date.UTC(fy, fm - 1, fd, 3, 0, 0));
  const end = new Date(Date.UTC(ty, tm - 1, td + 1, 3, 0, 0)); // dia final + 1, exclusivo
  return { start, end };
}

type Linha = {
  id: string;
  dataHora: Date;
  origem: string;
  caixa: string;
  operador: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
};

// GET /api/relatorios/vendas-item-por-pdv
// Vendas de um item (prato ou produto) num período, agrupadas por PDV, com data, hora e o operador
// que lançou cada linha. Cobre as duas origens de venda de item do sistema:
//   1. Consumo lançado no quarto (StayConsumption) — só produtos;
//   2. PDV do restaurante / comanda (ComandaItem via ComandaSession) — pratos e produtos.
// O consumo gerado no fechamento de uma comanda (StayConsumption.comandaSessionId != null) é
// ignorado aqui para não contar a mesma venda duas vezes — a comanda já entra pelos ComandaItem.
// Filtros: período de data de venda + item do catálogo.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const tipo = searchParams.get("tipo"); // "PRATO" | "PRODUTO"
    const itemId = searchParams.get("itemId");

    if (!from || !to) {
      return NextResponse.json({ success: false, error: "Período (from/to) é obrigatório." }, { status: 400 });
    }
    if (!itemId || (tipo !== "PRATO" && tipo !== "PRODUTO")) {
      return NextResponse.json({ success: false, error: "Selecione um item do catálogo." }, { status: 400 });
    }

    const { start, end } = brasiliaRange(from, to);

    // O item é validado contra o tenant: só resolve se o prato/produto pertence ao hotel logado.
    const catalogItem =
      tipo === "PRATO"
        ? await prisma.dish.findFirst({
            where: { id: itemId, tenantId: session.tenantId },
            select: { id: true, name: true },
          })
        : await prisma.product.findFirst({
            where: { id: itemId, tenantId: session.tenantId },
            select: { id: true, name: true },
          });

    if (!catalogItem) {
      return NextResponse.json({ success: false, error: "Item não encontrado neste hotel." }, { status: 404 });
    }

    // Grupos por PDV (POSLocation). Lançamentos sem PDV vinculado caem num grupo "Sem PDV".
    const grupos = new Map<
      string,
      { pdvId: string | null; pdv: string; linhas: Linha[]; quantidade: number; valor: number }
    >();

    const push = (pdvId: string | null, pdvNome: string | null, linha: Linha) => {
      const pdv = pdvNome ?? "Sem PDV";
      const key = pdvId ?? "__none__";
      if (!grupos.has(key)) grupos.set(key, { pdvId, pdv, linhas: [], quantidade: 0, valor: 0 });
      const g = grupos.get(key)!;
      g.linhas.push(linha);
      g.quantidade += linha.quantidade;
      g.valor += linha.total;
    };

    // 1. Consumo lançado no quarto — só faz sentido para produtos.
    if (tipo === "PRODUTO") {
      const consumos = await prisma.stayConsumption.findMany({
        where: {
          productId: itemId,
          comandaSessionId: null,
          createdAt: { gte: start, lt: end },
          stayCheckin: { tenantId: session.tenantId },
        },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          totalPrice: true,
          createdAt: true,
          operatorName: true,
          posLocation: { select: { id: true, name: true } },
          stayCheckin: { select: { room: { select: { number: true } } } },
        },
      });

      for (const c of consumos) {
        push(c.posLocation?.id ?? null, c.posLocation?.name ?? null, {
          id: `sc-${c.id}`,
          dataHora: c.createdAt,
          origem: c.stayCheckin.room?.number ? `Quarto ${c.stayCheckin.room.number}` : "Consumo no quarto",
          caixa: "-",
          operador: c.operatorName ?? "-",
          quantidade: Number(c.quantity),
          precoUnitario: Number(c.unitPrice),
          total: Number(c.totalPrice),
        });
      }
    }

    // 2. PDV do restaurante / comanda.
    const comandaItens = await prisma.comandaItem.findMany({
      where: {
        canceled: false,
        createdAt: { gte: start, lt: end },
        ...(tipo === "PRATO" ? { dishId: itemId } : { productId: itemId }),
        comandaSession: { tenantId: session.tenantId },
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        quantity: true,
        unitPrice: true,
        total: true,
        createdAt: true,
        operatorName: true,
        comandaSession: {
          select: {
            comanda: { select: { number: true } },
            terminal: { select: { name: true } },
            posLocation: { select: { id: true, name: true } },
          },
        },
      },
    });

    for (const it of comandaItens) {
      push(it.comandaSession.posLocation?.id ?? null, it.comandaSession.posLocation?.name ?? null, {
        id: `ci-${it.id}`,
        dataHora: it.createdAt,
        origem: it.comandaSession.comanda?.number ? `Comanda ${it.comandaSession.comanda.number}` : "Comanda",
        caixa: it.comandaSession.terminal?.name ?? "-",
        operador: it.operatorName ?? "-",
        quantidade: Number(it.quantity),
        precoUnitario: Number(it.unitPrice),
        total: Number(it.total),
      });
    }

    const gruposArr = Array.from(grupos.values())
      .map((g) => ({
        ...g,
        linhas: g.linhas.sort((a, b) => a.dataHora.getTime() - b.dataHora.getTime()),
      }))
      .sort((a, b) => a.pdv.localeCompare(b.pdv, "pt-BR"));

    const hotel = await getTenantHeaderInfo(session.tenantId);

    return NextResponse.json({
      success: true,
      hotel,
      periodo: { from, to },
      item: { tipo, id: catalogItem.id, nome: catalogItem.name },
      grupos: gruposArr,
      totais: {
        quantidade: gruposArr.reduce((s, g) => s + g.quantidade, 0),
        valor: gruposArr.reduce((s, g) => s + g.valor, 0),
        lancamentos: gruposArr.reduce((s, g) => s + g.linhas.length, 0),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/relatorios/vendas-item-por-pdv] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

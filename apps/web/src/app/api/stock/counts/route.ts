import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/stock/counts — lista as contagens de estoque do tenant para o painel do assinante
// (tela de confronto). Ordena: aguardando confronto (DONE) primeiro, depois em contagem (OPEN),
// depois as já resolvidas. `select` enxuto — regras de egress no CLAUDE.md.
const SELECT = {
  id: true,
  posLocationId: true,
  status: true,
  startedByName: true,
  note: true,
  createdAt: true,
  finishedAt: true,
  reconciledAt: true,
  reconciledByName: true,
  posLocation: { select: { name: true } },
  _count: { select: { items: true } },
} as const;

type Raw = {
  id: string;
  posLocationId: string | null;
  status: string;
  startedByName: string;
  note: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  reconciledAt: Date | null;
  reconciledByName: string | null;
  posLocation: { name: string } | null;
  _count: { items: number };
};

function serialize(c: Raw) {
  return {
    id: c.id,
    alvo: c.posLocation?.name ?? "Estoque geral / almoxarifado",
    isGeneral: c.posLocationId === null,
    status: c.status,
    conferente: c.startedByName,
    observacao: c.note,
    criadaEm: c.createdAt,
    finalizadaEm: c.finishedAt,
    confrontadaEm: c.reconciledAt,
    confrontadaPor: c.reconciledByName,
    totalItens: c._count.items,
  };
}

const STATUS_ORDER: Record<string, number> = { DONE: 0, OPEN: 1, RECONCILED: 2, CANCELLED: 3 };

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const [pending, recent] = await Promise.all([
      prisma.stockCount.findMany({
        where: { tenantId: session.tenantId, status: { in: ["OPEN", "DONE"] } },
        orderBy: { createdAt: "desc" },
        select: SELECT,
      }),
      prisma.stockCount.findMany({
        where: { tenantId: session.tenantId, status: { in: ["RECONCILED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: SELECT,
      }),
    ]);

    const list = [...pending, ...recent]
      .map(serialize)
      .sort((a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9));

    return NextResponse.json({ success: true, counts: list });
  } catch (error: any) {
    console.error("[GET /api/stock/counts] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}

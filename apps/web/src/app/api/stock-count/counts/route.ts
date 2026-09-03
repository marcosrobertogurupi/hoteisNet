import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountUser } from "@/lib/stockCountSession";

const COUNT_SELECT = {
  id: true,
  posLocationId: true,
  status: true,
  startedByName: true,
  note: true,
  createdAt: true,
  finishedAt: true,
  reconciledAt: true,
  posLocation: { select: { name: true } },
  _count: { select: { items: true } },
} as const;

type RawCount = {
  id: string;
  posLocationId: string | null;
  status: string;
  startedByName: string;
  note: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  reconciledAt: Date | null;
  posLocation: { name: string } | null;
  _count: { items: number };
};

function serialize(c: RawCount) {
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
    totalItens: c._count.items,
  };
}

// GET /api/stock-count/counts — contagens do hotel para o app do colaborador: as em andamento
// (OPEN), as finalizadas ainda sem confronto (DONE) e as últimas já confrontadas (histórico curto).
export async function GET(req: NextRequest) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const [active, recent] = await Promise.all([
      prisma.stockCount.findMany({
        where: { tenantId, status: { in: ["OPEN", "DONE"] } },
        orderBy: { createdAt: "desc" },
        select: COUNT_SELECT,
      }),
      prisma.stockCount.findMany({
        where: { tenantId, status: { in: ["RECONCILED", "CANCELLED"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: COUNT_SELECT,
      }),
    ]);

    return NextResponse.json({
      success: true,
      active: active.map(serialize),
      recent: recent.map(serialize),
    });
  } catch (error: any) {
    console.error("[GET /api/stock-count/counts] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro." }, { status: 500 });
  }
}

// POST /api/stock-count/counts — abre (ou retoma) uma contagem para um alvo.
// Body: { posLocationId: string | null, note?: string }. posLocationId null = estoque geral.
export async function POST(req: NextRequest) {
  try {
    const session = await getStockCountUser(req);
    if (!session) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const body = await req.json().catch(() => ({}));
    const rawPos = body.posLocationId;
    const posLocationId: string | null = rawPos ? String(rawPos) : null;
    const note = body.note ? String(body.note).trim().slice(0, 500) : null;

    if (posLocationId) {
      const pos = await prisma.pOSLocation.findFirst({
        where: { id: posLocationId, tenantId, active: true },
        select: { id: true },
      });
      if (!pos) {
        return NextResponse.json({ success: false, error: "PDV não encontrado." }, { status: 404 });
      }
    }

    // Um alvo só pode ter uma contagem não-finalizada por vez.
    const existing = await prisma.stockCount.findFirst({
      where: { tenantId, posLocationId, status: { in: ["OPEN", "DONE"] } },
      select: { id: true, status: true },
    });
    if (existing) {
      if (existing.status === "OPEN") {
        return NextResponse.json({ success: true, countId: existing.id, resumed: true });
      }
      return NextResponse.json(
        {
          success: false,
          error: "Já existe uma contagem finalizada deste alvo aguardando o confronto do assinante.",
        },
        { status: 409 }
      );
    }

    const created = await prisma.stockCount.create({
      data: {
        tenantId,
        posLocationId,
        status: "OPEN",
        startedByEmployeeId: session.employeeId,
        startedByName: session.name,
        note,
      },
      select: { id: true },
    });

    return NextResponse.json({ success: true, countId: created.id, resumed: false }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/stock-count/counts] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao abrir a contagem." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { SESSION_SELECT, serializeSession } from "@/lib/pdvSession";

// Atendimentos do PDV (ComandaSession). GET: abertos + os do dia. POST: abre um atendimento
// numa comanda numerada. Janela operacional apenas — nunca baixa histórico.

const OPEN_STATUSES = ["ABERTA", "AGUARDANDO_FISCAL", "FISCAL_REJEITADA"] as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const sessions = await prisma.comandaSession.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [{ status: { in: [...OPEN_STATUSES] } }, { openedAt: { gte: startOfDay } }],
      },
      orderBy: { openedAt: "desc" },
      select: SESSION_SELECT,
    });

    return NextResponse.json({ success: true, atendimentos: sessions.map(serializeSession) });
  } catch (error: any) {
    console.error("[GET /api/pdv/atendimentos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { comandaId, terminalId, tipoCliente, stayCheckinId, tableId, posLocationId, nomeCliente, telefoneCliente, cpfNota } = body;
    const customerType = tipoCliente === "HOSPEDE" ? "HOSPEDE" : "PASSANTE";

    if (!comandaId || !terminalId) {
      return NextResponse.json({ success: false, error: "Selecione a comanda e o caixa." }, { status: 400 });
    }

    // Todos os IDs vindos do cliente são revalidados contra o tenant.
    const [comanda, terminal] = await Promise.all([
      prisma.comanda.findFirst({ where: { id: comandaId, tenantId: session.tenantId, active: true }, select: { id: true, number: true } }),
      prisma.pdvTerminal.findFirst({ where: { id: terminalId, tenantId: session.tenantId, active: true }, select: { id: true } }),
    ]);
    if (!comanda) return NextResponse.json({ success: false, error: "Comanda inválida ou inativa." }, { status: 400 });
    if (!terminal) return NextResponse.json({ success: false, error: "Caixa inválido ou inativo." }, { status: 400 });

    const alreadyOpen = await prisma.comandaSession.findFirst({
      where: { comandaId: comanda.id, status: { in: [...OPEN_STATUSES] } },
      select: { id: true },
    });
    if (alreadyOpen) {
      return NextResponse.json({ success: false, error: `A comanda ${comanda.number} já está em uso.` }, { status: 409 });
    }

    let resolvedStayId: string | null = null;
    if (customerType === "HOSPEDE") {
      if (!stayCheckinId) {
        return NextResponse.json({ success: false, error: "Selecione a hospedagem do hóspede." }, { status: 400 });
      }
      const stay = await prisma.stayCheckin.findFirst({
        where: { id: stayCheckinId, tenantId: session.tenantId, isClosed: false, isCanceled: false },
        select: { id: true },
      });
      if (!stay) return NextResponse.json({ success: false, error: "Hospedagem não encontrada ou já encerrada." }, { status: 400 });
      resolvedStayId = stay.id;
    }

    let resolvedTableId: string | null = null;
    if (tableId) {
      const table = await prisma.hotelTable.findFirst({ where: { id: tableId, tenantId: session.tenantId }, select: { id: true } });
      resolvedTableId = table?.id ?? null;
    }

    // O PDV (POSLocation) é obrigatório — é dele que o estoque é baixado na venda de produtos.
    if (!posLocationId) {
      return NextResponse.json({ success: false, error: "Selecione o PDV (Restaurante, Bar da Piscina...)." }, { status: 400 });
    }
    const pos = await prisma.pOSLocation.findFirst({
      where: { id: posLocationId, tenantId: session.tenantId },
      select: { id: true },
    });
    if (!pos) return NextResponse.json({ success: false, error: "PDV inválido." }, { status: 400 });

    const created = await prisma.comandaSession.create({
      data: {
        tenantId: session.tenantId,
        comandaId: comanda.id,
        terminalId: terminal.id,
        clientRef: randomUUID(),
        origin: "ONLINE",
        customerType,
        stayCheckinId: resolvedStayId,
        tableId: resolvedTableId,
        posLocationId: pos.id,
        customerName: nomeCliente ? String(nomeCliente).trim() : null,
        customerPhone: telefoneCliente ? String(telefoneCliente).trim().slice(0, 30) : null,
        cpfNota: cpfNota ? String(cpfNota).replace(/\D/g, "") : null,
        operatorId: session.userId,
        operatorName: session.name,
      },
      select: SESSION_SELECT,
    });

    return NextResponse.json({ success: true, atendimento: serializeSession(created) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

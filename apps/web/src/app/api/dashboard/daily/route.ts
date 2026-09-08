import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/dashboard/daily?date=YYYY-MM-DD — bloco de indicadores do "dia selecionado" do
// Painel Diário (Fase A). Sensível à data escolhida no seletor Ontem/Hoje/Amanhã; os gráficos
// de tendência (15d/30d) continuam vindo de /api/dashboard/metrics.
//
// Tudo aqui é count/aggregate/groupBy + um findMany minúsculo com select explícito — egress
// desprezível, sem polling (só recarrega ao trocar a data). Ver seção ⚡ Performance do CLAUDE.md.
//
// Regras de tenant: session.tenantId é a ÚNICA origem do tenant; o parâmetro `date` só define
// janela temporal, nunca entra em nenhum filtro de propriedade.

const RESERVATION_ACTIVE_FUTURE = ["PRE_RESERVATION", "CONFIRMED", "CHECKED_IN"] as const;

// 00:00 de Brasília (UTC-3, sem horário de verão) para a data informada, independente do fuso
// do processo — mesma âncora usada em lib/brasiliaDate.ts.
function brDayStart(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

function brTodayKey(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function num(v: unknown): number {
  return v == null ? 0 : Number(v);
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const todayKey = brTodayKey();
    const dateParam = req.nextUrl.searchParams.get("date") || todayKey;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ success: false, error: "Data inválida." }, { status: 400 });
    }
    const [y, m, d] = dateParam.split("-").map(Number);
    const start = brDayStart(y, m, d);
    const end = new Date(start.getTime() + 86400000);
    const prevStart = new Date(start.getTime() - 86400000);

    const isToday = dateParam === todayKey;
    const isFuture = dateParam > todayKey;

    const [
      totalRooms,
      checkinsDia,
      checkinsPrev,
      checkoutsDia,
      checkoutsPrev,
      diariasDia,
      diariasPrev,
      receitasDia,
      despesasDia,
      novasReservas,
      noShow,
      canceladas,
      fnrhPendentes,
    ] = await Promise.all([
      prisma.room.count({ where: { tenantId, active: true } }),

      prisma.stayCheckin.count({ where: { tenantId, checkInDate: { gte: start, lt: end } } }),
      prisma.stayCheckin.count({ where: { tenantId, checkInDate: { gte: prevStart, lt: start } } }),

      prisma.stayCheckin.count({ where: { tenantId, actualCheckOut: { gte: start, lt: end } } }),
      prisma.stayCheckin.count({ where: { tenantId, actualCheckOut: { gte: prevStart, lt: start } } }),

      // Diárias vendidas no dia (uma StayCharge DAILY = uma diária-quarto).
      prisma.stayCharge.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { chargeType: "DAILY", referenceDate: { gte: start, lt: end }, stayCheckin: { tenantId } },
      }),
      prisma.stayCharge.aggregate({
        _sum: { amount: true },
        _count: true,
        where: { chargeType: "DAILY", referenceDate: { gte: prevStart, lt: start }, stayCheckin: { tenantId } },
      }),

      // Receitas do dia — entradas de caixa (CashTransaction não tem tenantId: filtra pela relação).
      prisma.cashTransaction.aggregate({
        _sum: { amount: true },
        where: { type: "ENTRADA", createdAt: { gte: start, lt: end }, cashRegister: { tenantId } },
      }),

      // Despesas do dia — baixas de contas a pagar (capta pagamentos parciais).
      prisma.payableSettlement.aggregate({
        _sum: { amount: true },
        where: { paidAt: { gte: start, lt: end }, accountsPayable: { tenantId } },
      }),

      prisma.reservation.count({ where: { tenantId, createdAt: { gte: start, lt: end } } }),

      // "do dia" = data de entrada prevista da reserva cai no dia selecionado.
      prisma.reservation.count({ where: { tenantId, status: "NO_SHOW", checkInDate: { gte: start, lt: end } } }),
      prisma.reservation.count({ where: { tenantId, status: "CANCELLED", checkInDate: { gte: start, lt: end } } }),

      // Fichas (FNRH) pendentes entre as hospedagens presentes no dia.
      prisma.stayCheckin.count({
        where: isToday
          ? { tenantId, isClosed: false, fnrhRecords: { none: {} } }
          : {
              tenantId,
              checkInDate: { lt: end },
              OR: [{ actualCheckOut: null }, { actualCheckOut: { gt: start } }],
              fnrhRecords: { none: {} },
            },
      }),
    ]);

    // ---- Ocupação (as-of D) ----
    let ocupados = 0;
    let manutencao = 0;
    if (isToday) {
      const grouped = await prisma.room.groupBy({
        by: ["status"],
        where: { tenantId, active: true },
        _count: true,
      });
      for (const g of grouped) {
        if (g.status === "OCCUPIED") ocupados += g._count;
        else if (g.status === "MAINTENANCE") manutencao += g._count;
      }
    } else {
      const stays = await prisma.stayCheckin.findMany({
        where: {
          tenantId,
          checkInDate: { lt: end },
          OR: [{ actualCheckOut: null }, { actualCheckOut: { gt: start } }],
        },
        select: { roomId: true },
      });
      const ids = new Set(stays.map((s) => s.roomId));
      if (isFuture) {
        // Datas futuras: hospedagens em curso que se estendem até D não bastam — soma as reservas
        // ativas que cobrem o dia. (Reconstrução de "manutenção" não é possível fora de hoje.)
        const resv = await prisma.reservation.findMany({
          where: {
            tenantId,
            checkInDate: { lt: end },
            checkOutDate: { gt: start },
            status: { in: [...RESERVATION_ACTIVE_FUTURE] },
          },
          select: { roomId: true },
        });
        for (const r of resv) ids.add(r.roomId);
      }
      ocupados = ids.size;
    }
    const livres = Math.max(0, totalRooms - ocupados - manutencao);
    const taxaOcupacao = totalRooms > 0 ? Number(((ocupados / totalRooms) * 100).toFixed(1)) : 0;

    // ---- Hóspedes na casa (as-of D) ----
    const staysNaCasa = await prisma.stayCheckin.findMany({
      where: isToday
        ? { tenantId, isClosed: false, actualCheckOut: null }
        : {
            tenantId,
            checkInDate: { lt: end },
            OR: [{ actualCheckOut: null }, { actualCheckOut: { gt: start } }],
          },
      select: { adults: true, children: true },
    });
    const hospedesNaCasa = staysNaCasa.reduce((acc, s) => acc + s.adults + s.children, 0);

    // ---- ADR / RevPAR ----
    const diariasCountDia = diariasDia._count;
    const diariasSomaDia = num(diariasDia._sum.amount);
    const adr = diariasCountDia > 0 ? Number((diariasSomaDia / diariasCountDia).toFixed(2)) : 0;
    const adrPrev =
      diariasPrev._count > 0 ? Number((num(diariasPrev._sum.amount) / diariasPrev._count).toFixed(2)) : 0;
    const revpar = totalRooms > 0 ? Number((diariasSomaDia / totalRooms).toFixed(2)) : 0;

    return NextResponse.json({
      success: true,
      date: dateParam,
      isToday,
      isFuture,
      ocupacao: { ocupados, livres, manutencao: isToday ? manutencao : null, total: totalRooms, taxa: taxaOcupacao },
      checkins: { valor: checkinsDia, anterior: checkinsPrev },
      checkouts: { valor: checkoutsDia, anterior: checkoutsPrev },
      adr: { valor: adr, anterior: adrPrev },
      revpar,
      receitas: num(receitasDia._sum.amount),
      despesas: num(despesasDia._sum.amount),
      novasReservas,
      noShow,
      canceladas,
      hospedesNaCasa,
      fnrhPendentes,
    });
  } catch (error: any) {
    console.error("[GET /api/dashboard/daily] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

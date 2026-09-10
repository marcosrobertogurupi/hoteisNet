import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { adjustGuestStayDebit } from "@/lib/guestStayDebit";
import { verifyAdminStepUp } from "@/lib/adminAuth";

// PATCH /api/stay/tariff — grava no banco a tarifa escolhida pelo usuário no modal "Alterar Tarifa
// da Hospedagem" (aplicar em toda hospedagem / hoje em diante / apenas nos selecionados). O front
// já resolveu localmente QUAIS diárias mudam para qual modo — aqui só recebemos o resultado final
// (uma linha por diária, com a referenceDate original de cada StayCharge) e sincronizamos 1:1 com
// o banco, sem reinterpretar o modo no servidor.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { stayCheckinId, dailyRates } = body as {
      stayCheckinId?: string;
      dailyRates?: { referenceDate: string; tariffName: string; tariffId?: string | null; rateValue: number }[];
    };

    if (!stayCheckinId || !Array.isArray(dailyRates) || dailyRates.length === 0) {
      return NextResponse.json(
        { success: false, error: "stayCheckinId e dailyRates são obrigatórios." },
        { status: 400 }
      );
    }

    for (const item of dailyRates) {
      if (!item.referenceDate || !item.tariffName || !Number.isFinite(Number(item.rateValue)) || Number(item.rateValue) < 0) {
        return NextResponse.json(
          { success: false, error: "Cada diária precisa de referenceDate, tariffName e rateValue válidos." },
          { status: 400 }
        );
      }
    }

    // tariffId (quando o modal já manda) precisa ser uma tarifa ATIVA do próprio tenant — nunca um
    // id/nome livre. Resolve o nome canônico e o preço de referência (para o controle de desconto).
    const tariffIds = [...new Set(dailyRates.map((d) => d.tariffId).filter((x): x is string => !!x))];
    const tariffsById = new Map<string, { name: string; price: number }>();
    if (tariffIds.length > 0) {
      const found = await prisma.tariff.findMany({
        where: { id: { in: tariffIds }, tenantId: session.tenantId, active: true },
        select: { id: true, name: true, price: true },
      });
      for (const t of found) tariffsById.set(t.id, { name: t.name, price: Number(t.price) });
      const missing = tariffIds.filter((id) => !tariffsById.has(id));
      if (missing.length > 0) {
        return NextResponse.json(
          { success: false, error: "Tarifa selecionada não encontrada no cadastro do estabelecimento." },
          { status: 400 }
        );
      }
    }
    // Nome canônico da tarifa cadastrada substitui a string livre do body.
    const resolvedRates = dailyRates.map((d) => {
      const t = d.tariffId ? tariffsById.get(d.tariffId) : undefined;
      return { ...d, tariffName: t ? t.name : d.tariffName, referencePrice: t ? t.price : null as number | null };
    });

    // ── Controle de desconto (autoritativo no servidor) ────────────────────────────────────
    // Baixar a tarifa de uma diária já lançada é um desconto implícito: sem esta trava, um
    // operador zerava todas as diárias (R$ 0,01) e escapava do Tenant.maxDiscountPercent, que só
    // era checado no campo `discount` do check-in / pagamento-lote. Compara a soma das diárias
    // afetadas ANTES × DEPOIS; se a redução passar do limite do tenant, exige autorização de
    // administrador (mesmo verifyAdminStepUp de /api/stay/checkin e /api/caixa/pagamento-lote).
    {
      const staySc = await prisma.stayCheckin.findFirst({
        where: { id: stayCheckinId, tenantId: session.tenantId },
        select: { id: true },
      });
      if (!staySc) {
        return NextResponse.json({ success: false, error: `Hospedagem ${stayCheckinId} não encontrada.` }, { status: 404 });
      }
      const refs = resolvedRates.map((d) => new Date(d.referenceDate));
      const currentCharges = await prisma.stayCharge.findMany({
        where: { stayCheckinId, referenceDate: { in: refs } },
        select: { referenceDate: true, amount: true },
      });
      const byRef = new Map(currentCharges.map((c) => [c.referenceDate.getTime(), Number(c.amount)]));
      // Toda referenceDate enviada precisa casar 1:1 com uma diária existente — senão o
      // stayCharge.update dentro da transação aborta tudo com um 500 cru (P2025).
      const semDiaria = resolvedRates.filter((d) => !byRef.has(new Date(d.referenceDate).getTime()));
      if (semDiaria.length > 0) {
        return NextResponse.json(
          { success: false, error: "Uma ou mais diárias informadas não foram encontradas nesta hospedagem. Recarregue a tela e tente novamente." },
          { status: 409 }
        );
      }
      let somaAntes = 0;
      let somaDepois = 0;
      for (const d of resolvedRates) {
        // Base do desconto: o preço da tarifa CADASTRADA quando o modal manda tariffId (referência
        // correta); senão a diária que estava lançada (fallback para o modal ainda em lista mock).
        const base = d.referencePrice ?? byRef.get(new Date(d.referenceDate).getTime());
        if (base === undefined || base === null) continue;
        somaAntes += base;
        somaDepois += Number(d.rateValue);
      }
      const reducaoPercent = somaAntes > 0 ? ((somaAntes - somaDepois) / somaAntes) * 100 : 0;
      if (reducaoPercent > 0.001) {
        const tenantForDiscount = await prisma.tenant.findUnique({
          where: { id: session.tenantId },
          select: { maxDiscountPercent: true },
        });
        const limite = Number(tenantForDiscount?.maxDiscountPercent ?? 20);
        if (reducaoPercent > limite + 0.001) {
          const auth = await verifyAdminStepUp(body.adminEmail, body.adminPassword, session.tenantId);
          if (!auth.ok) {
            return NextResponse.json(
              { success: false, error: auth.error, precisaAutorizacao: true, limitePercent: limite },
              { status: auth.status }
            );
          }
        }
      }
    }

    const result = await txWithRetry(async (tx) => {
      const stay = await tx.stayCheckin.findFirst({ where: { id: stayCheckinId, tenantId: session.tenantId! } });
      if (!stay) {
        throw new Error(`Hospedagem ${stayCheckinId} não encontrada.`);
      }
      if (stay.isClosed) {
        throw new Error("Esta hospedagem já foi encerrada e não pode mais ter a tarifa alterada.");
      }

      let totalDelta = 0;
      for (const item of resolvedRates) {
        const ref = new Date(item.referenceDate);
        const before = await tx.stayCharge.findUnique({
          where: { stayCheckinId_referenceDate: { stayCheckinId, referenceDate: ref } },
          select: { amount: true },
        });
        if (before) totalDelta += Number(item.rateValue) - Number(before.amount);
        await tx.stayCharge.update({
          where: { stayCheckinId_referenceDate: { stayCheckinId, referenceDate: ref } },
          data: {
            description: item.tariffName,
            amount: Number(item.rateValue),
          },
        });
      }

      // totalDaily = acumulado de diárias + cobrança de chegada de madrugada/antecipada
      // (EARLY_ARRIVAL) — não pode cair para "só diárias" quando o operador troca a tarifa.
      const chargesAgg = await tx.stayCharge.aggregate({
        where: { stayCheckinId, chargeType: { in: ["DAILY", "EARLY_ARRIVAL"] } },
        _sum: { amount: true },
        _count: true,
      });

      const totalDaily = Number(chargesAgg._sum.amount || 0);

      const updatedStay = await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: { totalDaily },
        include: { charges: { where: { chargeType: "DAILY" }, orderBy: { referenceDate: "asc" } } },
      });

      // A troca de tarifa mudou o valor devido pela hospedagem — o saldo do hóspede acompanha o
      // delta (positivo = passou a dever mais → DEBITO; negativo → CREDITO).
      if (totalDelta !== 0) {
        await adjustGuestStayDebit(tx, {
          tenantId: stay.tenantId,
          guestId: stay.primaryGuestId,
          stayCheckinId,
          delta: totalDelta,
          description: `Ajuste por troca de tarifa (${dailyRates.length} diária(s)) — hospedagem ${stayCheckinId}`,
        });
      }

      return updatedStay;
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "TARIFF_CHANGE",
      description: `${session?.name || "Usuário"} alterou a tarifa de ${dailyRates.length} diária(s) da hospedagem ${stayCheckinId}.`,
      entityType: "STAY_CHECKIN",
      entityId: stayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      stayCheckinId: result.id,
      totalDaily: Number(result.totalDaily),
      dailyCharges: result.charges.map((c) => ({
        referenceDate: c.referenceDate,
        amount: Number(c.amount),
        description: c.description,
      })),
    });
  } catch (error: any) {
    console.error("[PATCH /api/stay/tariff] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao alterar tarifa da hospedagem." },
      { status: 500 }
    );
  }
}

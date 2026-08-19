import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { sendUazapiText } from "@/lib/uazapi";
import { renderWhatsappTemplate } from "@/lib/whatsappMessages";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

function formatCPF(v: string) {
  const c = v.replace(/\D/g, "");
  if (c.length !== 11) return v;
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`;
}

// GET /api/stay/checkin?roomNumber=102 — devolve a hospedagem ativa completa do quarto
// (hóspede, datas, diária e itens de consumo), usada para montar Extrato/Resumo com dados reais.
// GET /api/stay/checkin?stayId=... — devolve uma hospedagem específica (ativa OU já encerrada),
// usada pelo Histórico de Hospedagens da ficha do hóspede para montar Extrato/Resumo de estadias antigas.
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");
    const stayId = searchParams.get("stayId");
    const roomTarget = searchParams.get("roomNumber") || searchParams.get("roomId") || "";

    if (!stayId && !roomTarget) {
      return NextResponse.json({ success: false, error: "roomNumber ou stayId é obrigatório." }, { status: 400 });
    }

    let stay;

    if (stayId) {
      stay = await prisma.stayCheckin.findUnique({
        where: { id: stayId },
        include: {
          room: true,
          primaryGuest: true,
          consumptions: { orderBy: { createdAt: "asc" }, include: { posLocation: true } },
          charges: { where: { chargeType: "DAILY" }, orderBy: { referenceDate: "asc" } },
          secondaryGuests: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!stay) {
        return NextResponse.json({ success: false, error: `Hospedagem ${stayId} não encontrada.` }, { status: 404 });
      }
    } else {
      const room = await prisma.room.findFirst({
        where: {
          OR: [{ id: roomTarget }, { number: roomTarget }],
          tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] },
        },
      });

      if (!room) {
        return NextResponse.json({ success: false, error: `Quarto ${roomTarget} não encontrado.` }, { status: 404 });
      }

      stay = await prisma.stayCheckin.findFirst({
        where: { roomId: room.id, isClosed: false },
        orderBy: { checkInDate: "desc" },
        include: {
          room: true,
          primaryGuest: true,
          consumptions: { orderBy: { createdAt: "asc" }, include: { posLocation: true } },
          charges: { where: { chargeType: "DAILY" }, orderBy: { referenceDate: "asc" } },
          secondaryGuests: { orderBy: { createdAt: "asc" } },
        },
      });

      if (!stay) {
        return NextResponse.json({ success: false, error: `Quarto ${room.number} não possui hospedagem ativa.` }, { status: 404 });
      }
    }

    // Detalhamento de "Outros Débitos": de qual(is) hospedagem(ns) — quarto/hóspede/operador/data —
    // veio cada valor somado em stay.otherDebits, para o botão "olho" ao lado do campo no modal de
    // pagamento poder mostrar a origem em vez de só o total.
    const debitTransfersIn = await prisma.stayDebitTransfer.findMany({
      where: { toStayCheckinId: stay.id },
      orderBy: { createdAt: "desc" },
      include: { fromStay: { include: { room: true, primaryGuest: true } } },
    });

    return NextResponse.json({
      success: true,
      stay: {
        id: stay.id,
        roomId: stay.roomId,
        roomNumber: stay.room.number,
        isClosed: stay.isClosed,
        checkInDate: stay.checkInDate,
        expectedCheckOut: stay.expectedCheckOut,
        actualCheckOut: stay.actualCheckOut,
        totalDaily: Number(stay.totalDaily),
        totalConsumption: Number(stay.totalConsumption),
        discount: Number(stay.discount),
        dailiesCount: stay.dailiesCount,
        extraDailiesCount: stay.extraDailiesCount,
        totalAdvance: Number(stay.totalAdvance),
        balanceDue: Number(stay.balanceDue),
        otherDebits: Number(stay.otherDebits),
        otherDebitsDetail: debitTransfersIn.map((t) => ({
          id: t.id,
          amount: Number(t.amount),
          createdAt: t.createdAt,
          fromRoomNumber: t.fromStay.room.number,
          fromGuestName: t.fromStay.primaryGuest.fullName,
          operatorName: t.operatorName,
        })),
        dailyCharges: stay.charges.map((c) => ({
          referenceDate: c.referenceDate,
          amount: Number(c.amount),
          description: c.description,
        })),
        guest: {
          id: stay.primaryGuest.id,
          fullName: stay.primaryGuest.fullName,
          cpf: stay.primaryGuest.cpf,
          phone: stay.primaryGuest.phone,
          whatsappPhone: stay.primaryGuest.whatsappPhone,
          city: stay.primaryGuest.city,
          state: stay.primaryGuest.state,
          street: stay.primaryGuest.street,
          neighborhood: stay.primaryGuest.neighborhood,
          zipCode: stay.primaryGuest.zipCode,
        },
        secondaryGuests: stay.secondaryGuests.map((g) => ({
          id: g.id,
          name: g.name,
          document: g.document,
        })),
        consumptions: stay.consumptions.map((c) => ({
          id: c.id,
          productId: c.productId,
          productName: c.productName,
          quantity: Number(c.quantity),
          unitPrice: Number(c.unitPrice),
          totalPrice: Number(c.totalPrice),
          posLocationId: c.posLocationId,
          posLocationName: c.posLocation?.name || null,
          operatorName: c.operatorName,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error: any) {
    console.error("[GET /api/stay/checkin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar hospedagem ativa." }, { status: 500 });
  }
}

// Status de reserva que já representam uma hospedagem em curso ou encerrada — nunca reaproveitar.
// (valores restritos ao enum ReservationStatus do schema)
const RESERVATION_STATUSES_NOT_MATCHABLE = ["CANCELLED", "CHECKED_IN", "CHECKED_OUT"] as const;

// POST /api/stay/checkin — persiste a hospedagem ativa (StayCheckin) e sincroniza a Reservation
// de origem (status CHECKED_IN) na MESMA transação, para que o Mapa Operacional e a Grid de
// Reservas nunca fiquem dessincronizados por uma falha parcial entre as duas escritas.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      roomId,
      roomNumber,
      guestName,
      documentType,
      documentNumber,
      phone,
      checkInDate,
      checkOutDate,
      dailyRate,
      reservationId,
      totalAmount,
      tariffId,
      tariffName,
      operatorId,
      operatorName,
      initialPayments,
      discount,
      secondaryGuests,
      adults,
      children,
    } = body;

    const roomTarget = String(roomId || roomNumber || "");
    if (!roomTarget || !guestName || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, error: "Quarto, hóspede e período da hospedagem são obrigatórios." },
        { status: 400 }
      );
    }

    const session = await getSessionUser(req);

    const result = await prisma.$transaction(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          OR: [{ id: roomTarget }, { number: roomTarget }],
          tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] },
        },
      });

      if (!room) {
        throw new Error(`Quarto ${roomTarget} não encontrado.`);
      }

      const cpfDigits = (documentNumber || "").replace(/\D/g, "");
      const cpf = documentType === "CPF" && cpfDigits.length === 11 ? formatCPF(cpfDigits) : null;

      let guest = cpf
        ? await tx.guest.findFirst({ where: { tenantId: room.tenantId, cpf } })
        : null;

      if (!guest) {
        guest = await tx.guest.create({
          data: {
            tenantId: room.tenantId,
            fullName: String(guestName).toUpperCase(),
            cpf,
            phone: phone || null,
            whatsappPhone: phone || null,
            hasWhatsapp: !!phone,
          },
        });
      }

      // Encerra qualquer hospedagem aberta remanescente neste quarto antes de abrir uma nova
      await tx.stayCheckin.updateMany({
        where: { roomId: room.id, isClosed: false },
        data: { isClosed: true, actualCheckOut: new Date() },
      });

      const checkInAt = new Date(checkInDate);
      const checkOutAt = new Date(checkOutDate);

      // Resolve a Reservation de origem ANTES de criar a StayCheckin, para já gravar o vínculo
      // real (reservationId) entre as duas — é essa FK que garante que o Mapa Operacional e a
      // Grid de Reservas nunca mais se percam um do outro por uma heurística de roomId.
      let targetReservationId: string | null = reservationId || null;

      if (!targetReservationId) {
        const match = await tx.reservation.findFirst({
          where: {
            roomId: room.id,
            status: { notIn: RESERVATION_STATUSES_NOT_MATCHABLE as any },
          },
          orderBy: { checkInDate: "asc" },
        });
        targetReservationId = match?.id || null;
      }

      if (targetReservationId) {
        await tx.reservation.update({
          where: { id: targetReservationId },
          data: {
            status: "CHECKED_IN",
            guestName: String(guestName).toUpperCase(),
            guestCpf: cpf || undefined,
            guestPhone: phone || undefined,
            checkInDate: checkInAt,
            checkOutDate: checkOutAt,
            dailyRate: dailyRate || undefined,
            totalAmount: totalAmount || undefined,
          },
        });
      } else {
        targetReservationId = (
          await tx.reservation.create({
            data: {
              // Reservas sempre vivem sob o tenant "TNT-01" nesta base, independente do tenant
              // do quarto (convenção histórica dos demais endpoints de /api/reservations).
              tenantId: "TNT-01",
              roomId: room.id,
              guestName: String(guestName).toUpperCase(),
              guestCpf: cpf,
              guestPhone: phone || null,
              checkInDate: checkInAt,
              checkOutDate: checkOutAt,
              dailyRate: dailyRate || 0,
              totalDiarias: totalAmount || dailyRate || 0,
              totalAmount: totalAmount || dailyRate || 0,
              tariffId: tariffId || "TAR-001",
              tariffName: tariffName || "APTO ESPECIAL DUPLO",
              status: "CHECKED_IN",
              reservationNumber: "RES-" + String(Math.floor(500 + Math.random() * 9000)),
            },
          })
        ).id;
      }

      const stay = await tx.stayCheckin.create({
        data: {
          tenantId: room.tenantId,
          roomId: room.id,
          primaryGuestId: guest.id,
          reservationId: targetReservationId,
          checkInDate: checkInAt,
          expectedCheckOut: checkOutAt,
          billingType: "DIRECT",
          totalDaily: dailyRate || 0,
          totalConsumption: 0,
          discount: discount || 0,
          adults: adults || 1,
          children: children || 0,
          dailiesCount: 1,
          lastRolloverDate: checkInAt,
          isClosed: false,
          checkedInByUserId: session?.userId || null,
          checkedInByUserName: session?.name || null,
        },
      });

      const validSecondaryGuests = (Array.isArray(secondaryGuests) ? secondaryGuests : []).filter(
        (g: any) => g?.name && String(g.name).trim().length > 0
      );

      if (validSecondaryGuests.length > 0) {
        await tx.stayGuest.createMany({
          data: validSecondaryGuests.map((g: any) => ({
            stayCheckinId: stay.id,
            name: String(g.name).trim().toUpperCase(),
            document: g.doc || null,
          })),
        });
      }

      // Lança a 1ª diária (a do próprio dia do check-in) na conta do hóspede.
      await tx.stayCharge.create({
        data: {
          stayCheckinId: stay.id,
          referenceDate: checkInAt,
          description: tariffName || "Diária",
          chargeType: "DAILY",
          amount: dailyRate || 0,
        },
      });

      await tx.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } });

      // Efetiva os pagamentos/adiantamentos lançados na grade local do modal de check-in — até
      // aqui eles existiam SOMENTE na tela (nada era salvo no banco enquanto o check-in não fosse
      // confirmado). Agora que a StayCheckin real existe, seguem seu fluxo completo: crédito na
      // conta do quarto (stayCheckinId) e lançamento no caixa do operador, na MESMA transação —
      // se qualquer parte do check-in falhar, nenhum pagamento fica gravado.
      const validPayments = (Array.isArray(initialPayments) ? initialPayments : []).filter(
        (p: any) => Number(p?.valor) > 0
      );

      if (validPayments.length > 0) {
        const opId = operatorId || "USR-001";
        const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();

        let caixa = await tx.cashRegister.findFirst({
          where: { operatorId: opId, isOpen: true, tenantId: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
        });

        if (!caixa) {
          caixa = await tx.cashRegister.create({
            data: {
              tenantId: room.tenantId,
              operatorId: opId,
              operatorName: opName,
              openingBalance: 0,
              isOpen: true,
            },
          });
        }

        let totalPagoCheckin = 0;
        for (const p of validPayments) {
          const valorNum = Number(p.valor);
          const fpg = (p.formaPagamento || "DINHEIRO").toUpperCase();
          const desc = p.descricao || `Pagamento de diárias — Quarto ${room.number}`;

          await tx.cashTransaction.create({
            data: {
              cashRegisterId: caixa.id,
              type: "ENTRADA",
              amount: valorNum,
              description: `${desc} (Hóspede: ${String(guestName).toUpperCase()})`,
              paymentMethod: fpg,
              stayCheckinId: stay.id,
              roomNumber: room.number,
              guestName: String(guestName).toUpperCase(),
            },
          });
          totalPagoCheckin += valorNum;
        }

        // Sem isto, o snapshot financeiro da hospedagem (totalAdvance/balanceDue) nasce zerado
        // mesmo com adiantamento já pago no check-in — só seria corrigido no próximo pagamento
        // avulso ou no checkout, deixando qualquer leitura nesse meio-tempo (ex.: Transferência de
        // Débitos) com o saldo devedor desatualizado.
        const saldoAposCheckin = Math.max(0, Number(dailyRate || 0) - totalPagoCheckin - Number(discount || 0));
        await tx.stayCheckin.update({
          where: { id: stay.id },
          data: { totalAdvance: totalPagoCheckin, balanceDue: saldoAposCheckin },
        });
      }

      return {
        stayCheckinId: stay.id,
        guestId: guest.id,
        reservationId: targetReservationId,
        roomNumber: room.number,
        tenantId: room.tenantId,
        guestPhone: phone || null,
      };
    });

    await logActivity({
      tenantId: session?.tenantId || DEFAULT_TENANT_ID,
      userId: session?.userId,
      userName: session?.name,
      action: "CHECKIN",
      description: `${session?.name || "Usuário"} fez check-in de ${guestName} no quarto ${roomTarget}.`,
      entityType: "STAY_CHECKIN",
      entityId: result.stayCheckinId,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    // Mensagem de boas-vindas via WhatsApp — dispara em segundo plano, sem bloquear a resposta
    // do check-in nem falhar a operação caso o envio dê erro.
    if (result.guestPhone) {
      (async () => {
        try {
          const [waSettings, tenant] = await Promise.all([
            prisma.whatsappMessageSetting.findUnique({ where: { tenantId: result.tenantId } }),
            prisma.tenant.findUnique({ where: { id: result.tenantId }, select: { name: true } }),
          ]);
          const enabled = waSettings ? waSettings.checkinWelcomeEnabled : true;
          if (!enabled) return;
          const template =
            waSettings?.checkinWelcomeMessage ||
            "*Bem-vindo(a) ao {HOTEL}!*\n\nDesejamos a você uma excelente estadia.";
          const message = renderWhatsappTemplate(template, {
            hospede: String(guestName).toUpperCase(),
            hotel: tenant?.name || "",
            quarto: result.roomNumber,
          });
          await sendUazapiText(result.guestPhone!, message, result.tenantId);
        } catch (err) {
          console.error("[POST /api/stay/checkin] Falha ao enviar boas-vindas por WhatsApp:", err);
        }
      })();
    }

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[POST /api/stay/checkin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar hospedagem." }, { status: 500 });
  }
}

// PATCH /api/stay/checkin — encerra (checkout) a hospedagem ativa: marca isClosed e libera o quarto.
// Usado quando o saldo devedor é totalmente quitado e o usuário confirma o check-out.
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { stayCheckinId } = body;

    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const session = await getSessionUser(req);

    const stay = await prisma.$transaction(async (tx) => {
      // Garante, dentro da própria transação, que o saldo devedor está quitado antes de permitir
      // o encerramento — mesma fórmula usada em /api/caixa/pagamento-lote. Se houver débito
      // pendente (ex.: chamada direta à API, sem passar pela tela de pagamento), a transação
      // inteira é abortada e NADA é alterado: quarto continua ocupado, hospedagem continua aberta.
      const stayBeforeClose = await tx.stayCheckin.findUnique({ where: { id: stayCheckinId } });
      if (!stayBeforeClose) {
        throw new Error(`Hospedagem ${stayCheckinId} não encontrada.`);
      }
      if (stayBeforeClose.isClosed) {
        throw new Error("Esta hospedagem já foi encerrada anteriormente.");
      }

      const [chargesAgg, paymentsAgg] = await Promise.all([
        tx.stayCharge.aggregate({ where: { stayCheckinId }, _sum: { amount: true } }),
        tx.cashTransaction.aggregate({ where: { stayCheckinId, type: "ENTRADA" }, _sum: { amount: true } }),
      ]);
      const totalDiarias = Number(chargesAgg._sum.amount || 0);
      const totalConsumo = Number(stayBeforeClose.totalConsumption);
      const totalPago = Number(paymentsAgg._sum.amount || 0);
      const totalDesconto = Number(stayBeforeClose.discount);
      const totalOutrosDebitos = Number(stayBeforeClose.otherDebits);
      const saldoDevedor = totalDiarias + totalConsumo + totalOutrosDebitos - totalPago - totalDesconto;

      if (saldoDevedor > 0.01) {
        throw new Error(
          `Checkout não permitido: saldo devedor de R$ ${saldoDevedor.toFixed(2)} ainda pendente. Quite o saldo antes de encerrar a hospedagem.`
        );
      }

      // Operador de caixa que efetuou o último pagamento da hospedagem = quem "fechou" a conta
      // financeiramente (equivalente a hpd_operadorfechou), que pode ser diferente do usuário
      // logado que está clicando em "Check-out" agora (hpd_idusucheckout).
      const lastPayment = await tx.cashTransaction.findFirst({
        where: { stayCheckinId, type: "ENTRADA" },
        orderBy: { createdAt: "desc" },
        include: { cashRegister: true },
      });

      const closedStay = await tx.stayCheckin.update({
        where: { id: stayCheckinId },
        data: {
          isClosed: true,
          actualCheckOut: new Date(),
          checkedOutByUserId: session?.userId || null,
          checkedOutByUserName: session?.name || null,
          closingOperatorId: lastPayment?.cashRegister?.operatorId || null,
          closingOperatorName: lastPayment?.cashRegister?.operatorName || null,
          totalAdvance: totalPago,
          balanceDue: Math.max(0, saldoDevedor),
        },
      });

      await tx.room.update({
        where: { id: closedStay.roomId },
        data: { status: "VACANT_DIRTY", notes: "Pendente troca de enxoval & higienização" },
      });

      // Sincroniza a Reservation correspondente na MESMA transação: sem isso, ela fica presa
      // em CHECKED_IN para sempre e a Grid de Reservas continua exibindo "EM VIGÊNCIA" após o checkout.
      // Prioriza o vínculo real por FK (reservationId); cai para a heurística por roomId só em
      // hospedagens antigas, criadas antes desse vínculo existir.
      if (closedStay.reservationId) {
        await tx.reservation.updateMany({
          where: { id: closedStay.reservationId, status: "CHECKED_IN" },
          data: { status: "CHECKED_OUT" },
        });
      } else {
        await tx.reservation.updateMany({
          where: { roomId: closedStay.roomId, status: "CHECKED_IN" },
          data: { status: "CHECKED_OUT" },
        });
      }

      return closedStay;
    });

    const room = await prisma.room.findUnique({ where: { id: stay.roomId }, select: { number: true, tenantId: true } });
    await logActivity({
      tenantId: session?.tenantId || room?.tenantId || DEFAULT_TENANT_ID,
      userId: session?.userId,
      userName: session?.name,
      action: "CHECKOUT",
      description: `${session?.name || "Usuário"} fez check-out do quarto ${room?.number || stay.roomId}.`,
      entityType: "STAY_CHECKIN",
      entityId: stay.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    // Mensagem de checkout via WhatsApp — dispara em segundo plano, sem bloquear a resposta
    // do checkout nem falhar a operação caso o envio dê erro.
    const tenantIdForWa = room?.tenantId || DEFAULT_TENANT_ID;
    (async () => {
      try {
        const [waSettings, tenant, guest] = await Promise.all([
          prisma.whatsappMessageSetting.findUnique({ where: { tenantId: tenantIdForWa } }),
          prisma.tenant.findUnique({ where: { id: tenantIdForWa }, select: { name: true } }),
          prisma.guest.findUnique({ where: { id: stay.primaryGuestId }, select: { fullName: true, phone: true, whatsappPhone: true } }),
        ]);
        const enabled = waSettings ? waSettings.checkoutEnabled : false;
        const phone = guest?.whatsappPhone || guest?.phone;
        if (!enabled || !phone) return;
        const template = waSettings?.checkoutMessage || "Checkout feito com sucesso. Esperamos que seja breve o seu retorno.";
        const message = renderWhatsappTemplate(template, {
          hospede: guest?.fullName || "",
          hotel: tenant?.name || "",
          quarto: room?.number || "",
        });
        await sendUazapiText(phone, message, tenantIdForWa);
      } catch (err) {
        console.error("[PATCH /api/stay/checkin] Falha ao enviar mensagem de checkout por WhatsApp:", err);
      }
    })();

    return NextResponse.json({ success: true, stayCheckinId: stay.id });
  } catch (error: any) {
    console.error("[PATCH /api/stay/checkin] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao encerrar hospedagem." }, { status: 500 });
  }
}

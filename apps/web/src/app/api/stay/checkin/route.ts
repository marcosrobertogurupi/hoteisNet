import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { sendUazapiText } from "@/lib/uazapi";
import { renderWhatsappTemplate } from "@/lib/whatsappMessages";
import { processPaymentLine } from "@/lib/paymentProcessing";
import { validateCPF, validateCNPJ, cpfMatchVariants } from "@/lib/documentValidation";
import { dateOnlyBrasilia } from "@/lib/brasiliaDate";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// Corte de madrugada — igual ao MADRUGADA_CUTOFF_TIME do CheckinHospedagemModal. Chegada antes
// disso = o hóspede dormiu a noite anterior no quarto (cobrança da "noite anterior").
const OVERNIGHT_CUTOFF_MINUTES = 6 * 60; // 06:00

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = String(hhmm || "0:0").split(":").map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// Classifica a chegada a partir da string de check-in (wall-clock que o operador informou,
// ex: "2026-08-28T09:56:00") — sem conversão de fuso, comparando data com "hoje em Brasília".
// Retorna "OVERNIGHT" (madrugada), "EARLY" (antes do horário padrão − tolerância) ou null.
function classifyArrival(
  checkInIso: string,
  standardCheckInTime: string,
  toleranceMinutes: number
): "OVERNIGHT" | "EARLY" | null {
  const [datePart, timePart] = String(checkInIso || "").split("T");
  if (!datePart) return null;
  const todayBr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  if (datePart !== todayBr) return null; // chegada não é de hoje — regra não se aplica
  const arrivalMin = hhmmToMinutes((timePart || "00:00").slice(0, 5));
  if (arrivalMin < OVERNIGHT_CUTOFF_MINUTES) return "OVERNIGHT";
  const cutoff = hhmmToMinutes(standardCheckInTime) - (Number(toleranceMinutes) || 0);
  if (arrivalMin < cutoff) return "EARLY";
  return null;
}

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
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const stayId = searchParams.get("stayId");
    const roomTarget = searchParams.get("roomNumber") || searchParams.get("roomId") || "";

    if (!stayId && !roomTarget) {
      return NextResponse.json({ success: false, error: "roomNumber ou stayId é obrigatório." }, { status: 400 });
    }

    let stay;

    if (stayId) {
      stay = await prisma.stayCheckin.findFirst({
        where: { id: stayId, tenantId: session.tenantId },
        include: {
          room: true,
          primaryGuest: { include: { company: true } },
          consumptions: { orderBy: { createdAt: "asc" }, include: { posLocation: true } },
          charges: { where: { chargeType: { in: ["DAILY", "EARLY_ARRIVAL"] } }, orderBy: { referenceDate: "asc" } },
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
          tenantId: session.tenantId,
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
          primaryGuest: { include: { company: true } },
          consumptions: { orderBy: { createdAt: "asc" }, include: { posLocation: true } },
          charges: { where: { chargeType: { in: ["DAILY", "EARLY_ARRIVAL"] } }, orderBy: { referenceDate: "asc" } },
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
        dailyCharges: stay.charges
          .filter((c) => c.chargeType === "DAILY")
          .map((c) => ({
            referenceDate: c.referenceDate,
            amount: Number(c.amount),
            description: c.description,
          })),
        // Cobrança de chegada de madrugada/antecipada (0..N lançamentos EARLY_ARRIVAL) — itemizada
        // à parte das diárias para o Extrato/Resumo mostrarem a linha e o total bater.
        earlyArrivalCharges: stay.charges
          .filter((c) => c.chargeType === "EARLY_ARRIVAL")
          .map((c) => ({
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
          company: stay.primaryGuest.company
            ? {
                cnpj: stay.primaryGuest.company.cnpj,
                name: stay.primaryGuest.company.name,
                ie: stay.primaryGuest.company.ie,
                address: stay.primaryGuest.company.address,
                neighborhood: stay.primaryGuest.company.neighborhood,
                city: stay.primaryGuest.company.city,
                state: stay.primaryGuest.company.state,
              }
            : null,
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
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const {
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
      birthDate,
      gender,
      motherName,
      fatherName,
      fullAddress,
      email,
      earlyArrival,
    } = body;

    const roomTarget = String(roomId || roomNumber || "");
    if (!roomTarget || !guestName || !checkInDate || !checkOutDate) {
      return NextResponse.json(
        { success: false, error: "Quarto, hóspede e período da hospedagem são obrigatórios." },
        { status: 400 }
      );
    }

    // Validações que antes só existiam no modal de check-in — replicadas aqui porque este
    // endpoint também pode ser chamado diretamente (ex: futura integração, agente operacional).
    const documentDigits = (documentNumber || "").replace(/\D/g, "");
    if (documentType === "CPF" && documentDigits && !validateCPF(documentDigits)) {
      return NextResponse.json({ success: false, error: "CPF com dígitos verificadores inválidos." }, { status: 400 });
    }
    if (documentType === "CNPJ" && documentDigits && !validateCNPJ(documentDigits)) {
      return NextResponse.json({ success: false, error: "CNPJ com dígitos verificadores inválidos." }, { status: 400 });
    }
    if (adults !== undefined && (!Number.isFinite(Number(adults)) || Number(adults) < 1)) {
      return NextResponse.json({ success: false, error: "O número de adultos deve ser pelo menos 1." }, { status: 400 });
    }
    if (dailyRate !== undefined && Number(dailyRate) <= 0 && Number(totalAmount || 0) <= 0) {
      return NextResponse.json({ success: false, error: "O valor da diária/hospedagem deve ser maior que zero." }, { status: 400 });
    }

    const result = await txWithRetry(async (tx) => {
      const room = await tx.room.findFirst({
        where: {
          OR: [{ id: roomTarget }, { number: roomTarget }],
          tenantId: session.tenantId!,
        },
      });

      if (!room) {
        throw new Error(`Quarto ${roomTarget} não encontrado.`);
      }

      const tenantSettings = await tx.tenant.findUnique({
        where: { id: room.tenantId },
        select: {
          fnrhMandatoryBeforeCheckin: true,
          standardCheckInTime: true,
          earlyCheckinToleranceMinutes: true,
        },
      });

      // Trava a linha do quarto pelo resto da transação: impede que dois check-ins quase
      // simultâneos no mesmo quarto leiam "sem hospedagem aberta" ao mesmo tempo e ambos
      // avancem — o segundo espera aqui até o primeiro terminar (commit ou rollback).
      await tx.$queryRaw`SELECT id FROM rooms WHERE id = ${room.id} FOR UPDATE`;

      const openStay = await tx.stayCheckin.findFirst({ where: { roomId: room.id, isClosed: false } });
      if (openStay) {
        throw new Error(
          `O Quarto ${room.number} já possui uma hospedagem em aberto (iniciada em ${openStay.checkInDate.toLocaleString("pt-BR")}). ` +
          `Efetue o check-out dessa hospedagem antes de abrir uma nova.`
        );
      }

      if (tariffId) {
        const tariff = await tx.tariff.findFirst({ where: { id: tariffId, tenantId: room.tenantId } });
        const totalOccupants = Number(adults || 1) + Number(children || 0);
        if (tariff && totalOccupants > tariff.adults) {
          throw new Error(
            `A tarifa '${tariff.name}' suporta no máximo ${tariff.adults} hóspede(s). ` +
            `Selecione uma tarifa com maior capacidade para acomodar ${totalOccupants} hóspede(s).`
          );
        }
      }

      const cpfDigits = (documentNumber || "").replace(/\D/g, "");
      const cpf = documentType === "CPF" && cpfDigits.length === 11 ? formatCPF(cpfDigits) : null;

      let guest = cpf
        ? await tx.guest.findFirst({ where: { tenantId: room.tenantId, cpf: { in: cpfMatchVariants(cpf) } } })
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
            birthDate: birthDate ? new Date(birthDate) : null,
            gender: gender || null,
            email: email || null,
            motherName: motherName || null,
            fatherName: fatherName || null,
            fullAddress: fullAddress || null,
          },
        });
      } else {
        // Só preenche o que estava vazio — nunca sobrescreve um dado já cadastrado/corrigido
        // manualmente com o que veio da consulta ao Hub deste check-in.
        await tx.guest.update({
          where: { id: guest.id },
          data: {
            birthDate: guest.birthDate ?? (birthDate ? new Date(birthDate) : undefined),
            gender: guest.gender ?? (gender || undefined),
            email: guest.email ?? (email || undefined),
            motherName: guest.motherName ?? (motherName || undefined),
            fatherName: guest.fatherName ?? (fatherName || undefined),
            fullAddress: guest.fullAddress ?? (fullAddress || undefined),
          },
        });
      }

      const checkInAt = new Date(checkInDate);
      const checkOutAt = new Date(checkOutDate);

      // ── Chegada de madrugada / antecipada ──────────────────────────────────────────────
      // Reclassifica a chegada NO SERVIDOR a partir do horário informado (o cliente nunca
      // define o horário-limite — senão bastaria mandar "00:00" para escapar da penalidade) e
      // recalcula o valor a partir da escolha + diária, ignorando qualquer valor final do body.
      const dailyRateNum = Number(dailyRate) || 0;
      const serverArrivalKind = classifyArrival(
        String(checkInDate),
        tenantSettings?.standardCheckInTime || "14:00",
        tenantSettings?.earlyCheckinToleranceMinutes ?? 60
      );
      const eaChoice: string | null = earlyArrival?.choice || null;
      const eaAuthorizedBy: string | null =
        typeof earlyArrival?.authorizedBy === "string" && earlyArrival.authorizedBy.trim()
          ? earlyArrival.authorizedBy.trim()
          : null;

      if (serverArrivalKind && !eaChoice) {
        throw new Error(
          serverArrivalKind === "OVERNIGHT"
            ? "Chegada de madrugada exige a decisão de como tratar a noite anterior (diária extra, meia diária, taxa fixa ou cortesia) antes do check-in."
            : "Chegada antes do horário padrão de check-in exige a decisão de cobrança de chegada antecipada (diária extra, meia diária, taxa fixa ou cortesia) antes do check-in."
        );
      }

      let earlyArrivalChargeAmount = 0;
      let earlyArrivalDescription = "";
      if (serverArrivalKind && eaChoice) {
        const ctx = serverArrivalKind === "OVERNIGHT" ? "chegada de madrugada" : "chegada antecipada";
        if (eaChoice === "EXTRA_NIGHT") {
          earlyArrivalChargeAmount = dailyRateNum;
          earlyArrivalDescription = `Diária extra (${ctx})`;
        } else if (eaChoice === "HALF_NIGHT") {
          earlyArrivalChargeAmount = dailyRateNum / 2;
          earlyArrivalDescription = `Meia diária (${ctx})`;
        } else if (eaChoice === "FIXED_FEE") {
          const fee = Number(earlyArrival?.fixedFeeAmount);
          if (!Number.isFinite(fee) || fee < 0) {
            throw new Error("Valor da taxa de chegada antecipada inválido.");
          }
          // Taxa abaixo da meia diária = desconto informal — exige autorização de admin (igual à cortesia).
          if (fee < dailyRateNum / 2 && !eaAuthorizedBy) {
            throw new Error("Taxa de chegada antecipada abaixo da meia diária exige autorização de administrador.");
          }
          earlyArrivalChargeAmount = fee;
          earlyArrivalDescription = `Taxa de ${ctx}${fee < dailyRateNum / 2 ? ` (autorizado por ${eaAuthorizedBy})` : ""}`;
        } else if (eaChoice === "COURTESY") {
          if (!eaAuthorizedBy) {
            throw new Error("Cortesia de chegada antecipada exige autorização de administrador.");
          }
          earlyArrivalChargeAmount = 0;
          earlyArrivalDescription = `Cortesia — ${ctx} (autorizado por ${eaAuthorizedBy})`;
        } else {
          throw new Error("Opção de chegada antecipada inválida.");
        }
      }

      // Valor total da hospedagem para o débito automático no saldo do hóspede. Nunca fica abaixo
      // de (diárias do período + chegada antecipada) — protege contra um body que mande a escolha
      // de chegada antecipada mas um totalAmount sem ela.
      const nightsBackend = Math.max(
        1,
        Math.round(
          (dateOnlyBrasilia(checkOutAt).getTime() - dateOnlyBrasilia(checkInAt).getTime()) / 86_400_000
        )
      );
      const guestDebitTotal = Math.max(
        Number(totalAmount || dailyRate || 0),
        nightsBackend * dailyRateNum + earlyArrivalChargeAmount
      );

      // Resolve a Reservation de origem ANTES de criar a StayCheckin, para já gravar o vínculo
      // real (reservationId) entre as duas — é essa FK que garante que o Mapa Operacional e a
      // Grid de Reservas nunca mais se percam um do outro por uma heurística de roomId.
      let targetReservationId: string | null = reservationId || null;

      if (!targetReservationId) {
        // Check-in avulso (sem reserva selecionada explicitamente): só pode "adotar" uma reserva
        // já existente no quarto se ela for de HOJE — nunca uma reserva futura de outro hóspede,
        // que seria destruída/sobrescrita pelos dados deste check-in avulso.
        const todayStart = dateOnlyBrasilia(new Date());
        const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
        const match = await tx.reservation.findFirst({
          where: {
            roomId: room.id,
            status: { notIn: RESERVATION_STATUSES_NOT_MATCHABLE as any },
            checkInDate: { gte: todayStart, lt: todayEnd },
          },
          orderBy: { checkInDate: "asc" },
        });
        targetReservationId = match?.id || null;
      }

      // FNRH obrigatória (Tenant.fnrhMandatoryBeforeCheckin, ver Configurações): valida aqui —
      // dentro da própria transação, não só na UI — que o hóspede já preencheu e assinou a ficha
      // antes de permitir a hospedagem, igual ao bloqueio de saldo devedor no checkout.
      if (tenantSettings?.fnrhMandatoryBeforeCheckin) {
        const fnrhRecord = targetReservationId
          ? await tx.fNRHRecord.findFirst({ where: { reservationId: targetReservationId } })
          : null;
        if (!fnrhRecord) {
          throw new Error(
            "A ficha FNRH deve ser preenchida e assinada pelo hóspede antes de efetivar o check-in. Utilize o botão \"Enviar FNRH\" e aguarde a confirmação."
          );
        }
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
          // totalDaily é o acumulado de diárias já lançadas (rollover incrementa a cada virada) —
          // inclui de saída a cobrança de chegada de madrugada/antecipada, para que o saldo devedor
          // exibido no check-out já bata com o que a validação atômica do PATCH vai cobrar.
          totalDaily: (Number(dailyRate) || 0) + earlyArrivalChargeAmount,
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

      // Débito automático no saldo do hóspede equivalente ao valor total da hospedagem ao
      // salvá-la (Win_Hospedagem.wdw do sistema legado) — é o contrapeso necessário para que os
      // créditos gerados pelos pagamentos/adiantamentos (ver processPaymentLine) reflitam saldo
      // credor de verdade, e não uma soma que só cresce.
      await tx.guestBalanceEntry.create({
        data: {
          tenantId: room.tenantId,
          guestId: guest.id,
          stayCheckinId: stay.id,
          type: "DEBITO",
          amount: guestDebitTotal,
          description: `Débito automático — valor total da hospedagem (Quarto ${room.number})`,
        },
      });
      await tx.guest.update({
        where: { id: guest.id },
        data: { balance: { decrement: guestDebitTotal } },
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

      // Cobrança de chegada de madrugada / antecipada como StayCharge própria — assim ela entra no
      // saldo devedor do check-out (que soma StayCharges), não só no débito de saldo do hóspede.
      // referenceDate = véspera do check-in ("noite anterior"), fora do slot da 1ª diária e das
      // viradas seguintes (respeita o unique [stayCheckinId, referenceDate]).
      if (earlyArrivalChargeAmount > 0) {
        await tx.stayCharge.create({
          data: {
            stayCheckinId: stay.id,
            referenceDate: new Date(checkInAt.getTime() - 86_400_000),
            description: earlyArrivalDescription || "Chegada antecipada",
            chargeType: "EARLY_ARRIVAL",
            amount: earlyArrivalChargeAmount,
          },
        });
      }

      await tx.room.update({ where: { id: room.id }, data: { status: "OCCUPIED" } });

      // Vincula a(s) FNRH já preenchida(s) desta reserva à hospedagem física que acabou de nascer —
      // stayCheckinId só passa a existir a partir do check-in de fato (ver comentário no schema).
      if (targetReservationId) {
        await tx.fNRHRecord.updateMany({
          where: { reservationId: targetReservationId, stayCheckinId: null },
          data: { stayCheckinId: stay.id },
        });
      }

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
          where: { operatorId: opId, isOpen: true, tenantId: room.tenantId },
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
          const fpg = p.formaPagamento || "DINHEIRO";
          const desc = p.descricao || `Pagamento de diárias — Quarto ${room.number}`;

          await processPaymentLine(tx, {
            tenantId: room.tenantId,
            cashRegisterId: caixa.id,
            stayCheckinId: stay.id,
            guestId: guest.id,
            roomNumber: room.number,
            guestName: String(guestName).toUpperCase(),
            amount: valorNum,
            paymentMethodDescription: fpg,
            description: `${desc} (Hóspede: ${String(guestName).toUpperCase()})`,
            operatorId: opId,
            operatorName: opName,
          });
          totalPagoCheckin += valorNum;
        }

        // Sem isto, o snapshot financeiro da hospedagem (totalAdvance/balanceDue) nasce zerado
        // mesmo com adiantamento já pago no check-in — só seria corrigido no próximo pagamento
        // avulso ou no checkout, deixando qualquer leitura nesse meio-tempo (ex.: Transferência de
        // Débitos) com o saldo devedor desatualizado. Usa o valor TOTAL da hospedagem (todas as
        // diárias), não só uma diária — senão o saldo nasce subavaliado em estadias de N > 1 noites.
        const saldoAposCheckin = Math.max(0, guestDebitTotal - totalPagoCheckin - Number(discount || 0));
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
        earlyArrivalNote: serverArrivalKind
          ? ` ${earlyArrivalDescription || (serverArrivalKind === "OVERNIGHT" ? "chegada de madrugada" : "chegada antecipada")}${earlyArrivalChargeAmount > 0 ? ` (R$ ${earlyArrivalChargeAmount.toFixed(2)})` : ""}`
          : "",
      };
    });

    await logActivity({
      tenantId: session?.tenantId || DEFAULT_TENANT_ID,
      userId: session?.userId,
      userName: session?.name,
      action: "CHECKIN",
      description: `${session?.name || "Usuário"} fez check-in de ${guestName} no quarto ${roomTarget}.${result.earlyArrivalNote}`,
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
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await req.json();
    const { stayCheckinId } = body;
    // Operador ativo no terminal (OperatorContext) — usado só para saber em qual caixa registrar
    // o lançamento de controle do check-out com valor zerado (ver abaixo). Nunca define tenant.
    const opId: string = body.operatorId || "USR-001";
    const opName: string = String(body.operatorName || "OPERADOR RECEPÇÃO").toUpperCase();

    if (!stayCheckinId) {
      return NextResponse.json({ success: false, error: "stayCheckinId é obrigatório." }, { status: 400 });
    }

    const stay = await txWithRetry(async (tx) => {
      // Trava a linha da hospedagem ANTES de ler/agregar o saldo devedor (Postgres Read Committed
      // não trava nada em um SELECT comum — só a partir do primeiro UPDATE nesta linha um lock de
      // escrita seria adquirido). Sem isso, um consumo lançado por outro terminal (POST
      // /api/stay/consumo) no exato instante do checkout pode ser commitado sem ser bloqueado, e o
      // checkout fecha usando saldo desatualizado. Qualquer outra transação que tente escrever
      // nesta mesma StayCheckin (incluindo lançamento de novo consumo, que também trava a mesma
      // linha — ver /api/stay/consumo) espera até esta transação terminar.
      await tx.$queryRaw`SELECT id FROM stay_checkins WHERE id = ${stayCheckinId} FOR UPDATE`;

      // Garante, dentro da própria transação, que o saldo devedor está quitado antes de permitir
      // o encerramento — mesma fórmula usada em /api/caixa/pagamento-lote. Se houver débito
      // pendente (ex.: chamada direta à API, sem passar pela tela de pagamento), a transação
      // inteira é abortada e NADA é alterado: quarto continua ocupado, hospedagem continua aberta.
      const stayBeforeClose = await tx.stayCheckin.findUnique({ where: { id: stayCheckinId } });
      if (!stayBeforeClose || stayBeforeClose.tenantId !== session.tenantId) {
        throw new Error(`Hospedagem ${stayCheckinId} não encontrada.`);
      }
      if (stayBeforeClose.isClosed) {
        throw new Error("Esta hospedagem já foi encerrada anteriormente.");
      }

      const [chargesAgg, paymentsAgg, paymentsCount] = await Promise.all([
        tx.stayCharge.aggregate({ where: { stayCheckinId }, _sum: { amount: true } }),
        tx.cashTransaction.aggregate({ where: { stayCheckinId, type: "ENTRADA" }, _sum: { amount: true } }),
        tx.cashTransaction.count({ where: { stayCheckinId, type: "ENTRADA" } }),
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
          closingOperatorId: lastPayment?.cashRegister?.operatorId || (paymentsCount === 0 ? opId : null),
          closingOperatorName: lastPayment?.cashRegister?.operatorName || (paymentsCount === 0 ? opName : null),
          totalAdvance: totalPago,
          balanceDue: Math.max(0, saldoDevedor),
        },
      });

      await tx.room.update({
        where: { id: closedStay.roomId },
        data: { status: "VACANT_DIRTY", notes: "Pendente troca de enxoval & higienização" },
      });

      // Check-out com valor zerado (cortesia, hospedagem sem diária, desconto total): nenhum
      // pagamento foi lançado no caixa. Ainda assim registramos um lançamento de CONTROLE com
      // valor 0 no caixa do operador — não soma nos totais (countsInCashTotal=false), mas garante
      // que toda saída de quarto apareça na movimentação do turno / relatório de caixa.
      if (paymentsCount === 0) {
        let caixa = await tx.cashRegister.findFirst({
          where: { operatorId: opId, isOpen: true, tenantId: session.tenantId! },
        });
        if (!caixa) {
          caixa = await tx.cashRegister.create({
            data: {
              tenantId: session.tenantId!,
              operatorId: opId,
              operatorName: opName,
              openingBalance: 0,
              isOpen: true,
            },
          });
        }
        const [roomForLog, guestForLog] = await Promise.all([
          tx.room.findUnique({ where: { id: closedStay.roomId }, select: { number: true } }),
          tx.guest.findUnique({ where: { id: closedStay.primaryGuestId }, select: { fullName: true } }),
        ]);
        await tx.cashTransaction.create({
          data: {
            cashRegisterId: caixa.id,
            type: "ENTRADA",
            amount: 0,
            description: `Check-out sem saldo a pagar — controle de saída do Quarto ${roomForLog?.number || closedStay.roomId} (Hóspede: ${guestForLog?.fullName || "—"})`,
            paymentMethod: "SEM MOVIMENTO",
            countsInCashTotal: false,
            stayCheckinId,
            roomNumber: roomForLog?.number || null,
            guestName: guestForLog?.fullName || null,
          },
        });
      }

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

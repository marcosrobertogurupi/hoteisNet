/**
 * Script de teste de consistência de dados.
 * - Cria hospedagens (StayCheckin) abertas usando hóspedes REAIS já existentes no banco,
 *   até o hotel atingir ~80% de ocupação.
 * - Cria diárias já lançadas (StayCharge) desde o check-in até hoje.
 * - Em parte das hospedagens, lança adiantamento no caixa (CashTransaction) e consumo
 *   de produtos reais do estoque (StayConsumption + baixa em POSProductStock).
 * - Cria reservas fictícias para o mês corrente, com datas aleatórias.
 *
 * Uso: node scripts/seed-test-data.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const TENANT_ID = 'tenant-hoteisnet-demo';
// A página de Reservas do frontend busca/cria reservas sempre com este tenantId fixo
// (ver apps/web/src/app/app/reservations/page.tsx e ReservationGridMap.tsx), mesmo hospedando
// quartos do tenant "tenant-hoteisnet-demo" — é a convenção existente no app, não um bug deste script.
const RESERVATION_TENANT_ID = 'TNT-01';
const OCCUPANCY_TARGET = 0.8;

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[rand(0, arr.length - 1)];
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
function dateOnly(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

const PAYMENT_METHODS = ['DINHEIRO', 'PIX', 'CARTAO_CREDITO', 'CARTAO_DEBITO'];

const FIRST_NAMES = [
  'JOAO', 'MARIA', 'PEDRO', 'ANA', 'CARLOS', 'JULIANA', 'RICARDO', 'FERNANDA',
  'PAULO', 'PATRICIA', 'MARCOS', 'ALINE', 'LUCAS', 'CAMILA', 'RAFAEL', 'BEATRIZ',
  'GUSTAVO', 'LARISSA', 'BRUNO', 'VANESSA', 'DIEGO', 'TATIANE', 'FELIPE', 'RENATA',
  'ANDRE', 'SIMONE', 'THIAGO', 'DEBORA', 'LEONARDO', 'PRISCILA',
];
const LAST_NAMES = [
  'SILVA', 'SOUZA', 'OLIVEIRA', 'SANTOS', 'PEREIRA', 'FERREIRA', 'ALVES', 'RIBEIRO',
  'GOMES', 'MARTINS', 'ROCHA', 'CARVALHO', 'ALMEIDA', 'LOPES', 'SOARES', 'FONSECA',
  'BARBOSA', 'CARDOSO', 'NASCIMENTO', 'MOREIRA',
];

function fakeGuestName() {
  return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)} ${pick(LAST_NAMES)}`;
}
function fakeCpf() {
  return `${rand(100, 999)}.${rand(100, 999)}.${rand(100, 999)}-${rand(10, 99)}`;
}
function fakePhone() {
  return `(${rand(11, 99)}) 9${rand(1000, 9999)}-${rand(1000, 9999)}`;
}

async function main() {
  console.log('== Seed de teste de consistência de dados ==');

  const rooms = await prisma.room.findMany({
    where: { tenantId: TENANT_ID },
    include: { category: true },
  });
  console.log(`Quartos no tenant: ${rooms.length}`);

  const openStays = await prisma.stayCheckin.findMany({
    where: { tenantId: TENANT_ID, isClosed: false },
    select: { roomId: true },
  });
  const occupiedRoomIds = new Set(openStays.map((s) => s.roomId));

  const targetOccupied = Math.round(rooms.length * OCCUPANCY_TARGET);
  const needed = Math.max(0, targetOccupied - occupiedRoomIds.size);
  console.log(`Ocupação atual: ${occupiedRoomIds.size}/${rooms.length}. Meta 80%: ${targetOccupied}. Novas hospedagens a criar: ${needed}`);

  const availableRooms = shuffle(
    rooms.filter((r) => !occupiedRoomIds.has(r.id) && r.status !== 'MAINTENANCE')
  ).slice(0, needed);

  const guestCount = await prisma.guest.count({ where: { tenantId: TENANT_ID } });
  const skip = rand(0, Math.max(0, guestCount - availableRooms.length * 2 - 1));
  const guestPool = await prisma.guest.findMany({
    where: { tenantId: TENANT_ID },
    skip,
    take: availableRooms.length * 2,
    select: { id: true, fullName: true, cpf: true, phone: true },
  });
  const guests = shuffle(guestPool);

  const cashRegisters = await prisma.cashRegister.findMany({
    where: { tenantId: TENANT_ID, isOpen: true },
  });

  const products = await prisma.product.findMany({
    where: { tenantId: TENANT_ID },
    select: { id: true, name: true, salePrice: true },
  });

  const posLocations = await prisma.pOSLocation.findMany({
    where: { tenantId: TENANT_ID },
  });
  const frigobar = posLocations.find((l) => l.name.includes('FRIGOBAR')) || posLocations[0];

  const today = new Date();
  let createdStays = 0;
  let withAdiantamento = 0;
  let withConsumo = 0;
  const newConsumptionsForStock = [];

  for (let i = 0; i < availableRooms.length; i++) {
    const room = availableRooms[i];
    const guest = guests[i % guests.length];
    if (!guest) continue;

    const checkInDaysAgo = rand(0, 8);
    const checkInDate = addDays(today, -checkInDaysAgo);
    checkInDate.setHours(rand(13, 20), rand(0, 59), 0, 0);
    const expectedCheckOut = addDays(today, rand(1, 6));
    expectedCheckOut.setHours(12, 0, 0, 0);

    const dailyPrice = Number(room.category.dailyPrice) || 180;

    const charges = [];
    for (let d = 0; d <= checkInDaysAgo; d++) {
      charges.push({
        referenceDate: dateOnly(addDays(checkInDate, d)),
        description: `TARIFA ${room.category.name}`,
        chargeType: 'DAILY',
        amount: dailyPrice,
      });
    }
    const totalDaily = charges.reduce((sum, c) => sum + c.amount, 0);

    const consumptionsData = [];
    if (products.length && Math.random() < 0.4) {
      const nItems = rand(1, 3);
      for (let k = 0; k < nItems; k++) {
        const product = pick(products);
        const quantity = rand(1, 3);
        const unitPrice = Number(product.salePrice);
        consumptionsData.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice,
          totalPrice: quantity * unitPrice,
          posLocationId: frigobar ? frigobar.id : null,
          operatorName: 'SEED TESTE',
        });
      }
    }
    const totalConsumption = consumptionsData.reduce((s, c) => s + c.totalPrice, 0);

    const paymentsData = [];
    if (cashRegisters.length && Math.random() < 0.35) {
      const reg = pick(cashRegisters);
      const valor = pick([50, 100, 150, 200, 300, 400, 500]);
      paymentsData.push({
        cashRegisterId: reg.id,
        type: 'ENTRADA',
        amount: valor,
        description: 'Adiantamento de hospedagem',
        paymentMethod: pick(PAYMENT_METHODS),
        roomNumber: room.number,
        guestName: guest.fullName,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.stayCheckin.create({
        data: {
          tenantId: TENANT_ID,
          roomId: room.id,
          primaryGuestId: guest.id,
          checkInDate,
          expectedCheckOut,
          totalDaily,
          totalConsumption,
          isClosed: false,
          dailiesCount: charges.length,
          lastRolloverDate: charges.length ? charges[charges.length - 1].referenceDate : checkInDate,
          charges: { create: charges },
          consumptions: consumptionsData.length ? { create: consumptionsData } : undefined,
          payments: paymentsData.length ? { create: paymentsData } : undefined,
        },
      });
      await tx.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } });
    });

    createdStays++;
    if (paymentsData.length) withAdiantamento++;
    if (consumptionsData.length) {
      withConsumo++;
      for (const c of consumptionsData) {
        if (c.posLocationId) newConsumptionsForStock.push(c);
      }
    }
  }

  console.log(`Hospedagens criadas: ${createdStays} (com adiantamento: ${withAdiantamento}, com consumo: ${withConsumo})`);

  // Decrementa estoque do PDV apenas para os itens de consumo criados NESTA execução
  // (evita baixar o estoque de novo se o script for reexecutado).
  const grouped = new Map();
  for (const c of newConsumptionsForStock) {
    const key = `${c.productId}::${c.posLocationId}`;
    grouped.set(key, (grouped.get(key) || 0) + Number(c.quantity));
  }
  for (const [key, qty] of grouped) {
    const [productId, posLocationId] = key.split('::');
    const existing = await prisma.pOSProductStock.findUnique({
      where: { productId_posLocationId: { productId, posLocationId } },
    });
    if (existing) {
      await prisma.pOSProductStock.update({
        where: { id: existing.id },
        data: { currentStock: { decrement: Math.round(qty) } },
      });
    }
  }

  // ---------- Reservas fictícias do mês corrente ----------
  // Reservas com status ativo (CONFIRMED/PRE_RESERVATION) não podem sobrepor, no mesmo quarto,
  // uma hospedagem já aberta nem outra reserva ativa (regra/política de reservas do hotel).
  // CANCELLED/NO_SHOW podem sobrepor livremente: é o cenário real de "reservou, não ocupou, o
  // quarto foi ocupado por outro hóspede depois".
  function overlaps(aStart, aEnd, bStart, bEnd) {
    return aStart < bEnd && bStart < aEnd;
  }
  const ACTIVE_STATUSES = new Set(['CONFIRMED', 'PRE_RESERVATION']);
  const stayRangesByRoom = new Map();
  const currentOpenStays = await prisma.stayCheckin.findMany({
    where: { tenantId: TENANT_ID, isClosed: false },
    select: { roomId: true, checkInDate: true, expectedCheckOut: true },
  });
  for (const s of currentOpenStays) stayRangesByRoom.set(s.roomId, s);
  const activeReservationRanges = (
    await prisma.reservation.findMany({
      where: { tenantId: RESERVATION_TENANT_ID, status: { in: ['CONFIRMED', 'PRE_RESERVATION'] } },
      select: { roomId: true, checkInDate: true, checkOutDate: true },
    })
  ).map((r) => ({ roomId: r.roomId, checkInDate: r.checkInDate, checkOutDate: r.checkOutDate }));

  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const tariffs = await prisma.tariff.findMany({ where: { tenantId: TENANT_ID, active: true } });
  const allRoomsWithCategory = rooms;

  const RESERVATION_COUNT = 40;
  const statuses = ['PRE_RESERVATION', 'PRE_RESERVATION', 'CONFIRMED', 'CONFIRMED', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'];

  let createdReservations = 0;
  for (let i = 0; i < RESERVATION_COUNT; i++) {
    const tariff = pick(tariffs);
    const checkInDay = rand(1, monthEnd.getDate());
    const checkInDate = new Date(today.getFullYear(), today.getMonth(), checkInDay, 14, 0, 0);
    const nights = rand(1, 5);
    const checkOutDate = addDays(checkInDate, nights);
    checkOutDate.setHours(12, 0, 0, 0);

    const status = pick(statuses);

    let room;
    if (ACTIVE_STATUSES.has(status)) {
      const freeRooms = allRoomsWithCategory.filter((rm) => {
        if (rm.status === 'MAINTENANCE') return false;
        const stay = stayRangesByRoom.get(rm.id);
        if (stay && overlaps(checkInDate, checkOutDate, new Date(stay.checkInDate), new Date(stay.expectedCheckOut))) return false;
        const clash = activeReservationRanges.some(
          (ar) => ar.roomId === rm.id && overlaps(checkInDate, checkOutDate, new Date(ar.checkInDate), new Date(ar.checkOutDate))
        );
        return !clash;
      });
      room = freeRooms.length ? pick(freeRooms) : pick(allRoomsWithCategory);
      if (freeRooms.length) {
        activeReservationRanges.push({ roomId: room.id, checkInDate, checkOutDate });
      }
    } else {
      room = pick(allRoomsWithCategory);
    }

    const dailyRate = Number(tariff.price);
    const totalAmount = dailyRate * nights;
    const depositPaid = Math.random() < 0.3 ? pick([50, 100, 150, 200]) : 0;

    await prisma.reservation.create({
      data: {
        tenantId: RESERVATION_TENANT_ID,
        roomId: room.id,
        guestName: fakeGuestName(),
        guestCpf: fakeCpf(),
        guestPhone: fakePhone(),
        checkInDate,
        checkOutDate,
        totalAmount,
        depositPaid,
        status,
        tariffId: tariff.id,
        tariffName: tariff.name,
        dailyRate,
        totalDiarias: nights,
        adults: rand(1, tariff.adults || 2),
        children: Math.random() < 0.2 ? rand(1, 2) : 0,
        operatorName: 'SEED TESTE',
        roomDescription: room.number,
        roomCategory: room.categoryId,
      },
    });
    createdReservations++;
  }

  console.log(`Reservas fictícias criadas para o mês corrente: ${createdReservations}`);

  const finalOccupied = await prisma.stayCheckin.count({ where: { tenantId: TENANT_ID, isClosed: false } });
  console.log(`Ocupação final: ${finalOccupied}/${rooms.length} (${((finalOccupied / rooms.length) * 100).toFixed(1)}%)`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});

// Tools do agente de atendimento via WhatsApp — tenant-scoped por construção: cada tool é criada
// dentro de um closure que já recebe o tenantId real resolvido no servidor (nunca aceito como
// argumento do modelo). Mesmo princípio já aplicado em toda a Fase FNRH: o hóspede nunca pode,
// via prompt injection na própria mensagem do WhatsApp, fazer o agente vazar dado de outro tenant.
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { brazilPhoneVariants } from "@/lib/uazapiInstance";
import { consultCpfHub } from "@/lib/hubCpfLookup";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

async function checkAvailability(tenantId: string, checkIn: Date, checkOut: Date) {
  const rooms = await prisma.room.findMany({
    where: { tenantId, active: true },
    include: { category: true },
  });
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length === 0) return [];

  const [overlappingReservations, openStays] = await Promise.all([
    prisma.reservation.findMany({
      where: {
        roomId: { in: roomIds },
        status: { in: ["PRE_RESERVATION", "CONFIRMED", "CHECKED_IN"] },
        checkInDate: { lt: checkOut },
        checkOutDate: { gt: checkIn },
      },
      select: { roomId: true },
    }),
    prisma.stayCheckin.findMany({
      where: { roomId: { in: roomIds }, isClosed: false, checkInDate: { lt: checkOut }, expectedCheckOut: { gt: checkIn } },
      select: { roomId: true },
    }),
  ]);

  const busyRoomIds = new Set<string>([
    ...overlappingReservations.map((r) => r.roomId),
    ...openStays.map((s) => s.roomId),
  ]);

  const byCategory = new Map<string, { categoria: string; capacidade: number; precoDiariaReferencia: number; quartosDisponiveis: number }>();
  for (const room of rooms) {
    if (busyRoomIds.has(room.id)) continue;
    const key = room.categoryId;
    const entry = byCategory.get(key) ?? {
      categoria: room.category.name,
      capacidade: room.category.capacity,
      precoDiariaReferencia: Number(room.category.dailyPrice),
      quartosDisponiveis: 0,
    };
    entry.quartosDisponiveis += 1;
    byCategory.set(key, entry);
  }
  return Array.from(byCategory.values());
}

async function findReservationsByPhone(tenantId: string, phone: string) {
  const variants = brazilPhoneVariants(phone.replace(/\D/g, ""));
  if (variants.length === 0) return [];

  const rooms = await prisma.room.findMany({ where: { tenantId }, select: { id: true } });
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length === 0) return [];

  const reservations = await prisma.reservation.findMany({
    where: {
      roomId: { in: roomIds },
      status: { notIn: ["CANCELLED", "NO_SHOW"] },
      checkOutDate: { gte: startOfToday() },
    },
    include: { room: { include: { category: true } } },
    orderBy: { checkInDate: "asc" },
  });

  return reservations
    .filter((r) => brazilPhoneVariants(r.guestPhone || "").some((v) => variants.includes(v)))
    .map((r) => ({
      numeroReserva: r.reservationNumber,
      hospede: r.guestName,
      status: r.status,
      quarto: r.room.number,
      categoria: r.room.category.name,
      checkIn: r.checkInDate.toISOString().slice(0, 10),
      checkOut: r.checkOutDate.toISOString().slice(0, 10),
      valorTotal: Number(r.totalAmount),
    }));
}

async function listRoomCategories(tenantId: string) {
  const categories = await prisma.roomCategory.findMany({
    where: { tenantId, active: true },
    select: { name: true, capacity: true, dailyPrice: true, description: true },
  });
  return categories.map((c) => ({
    categoria: c.name,
    capacidade: c.capacity,
    precoDiariaReferencia: Number(c.dailyPrice),
    descricao: c.description,
  }));
}

async function findGuestByCpf(tenantId: string, cpf: string) {
  const cleanCpf = cpf.replace(/\D/g, "");
  if (cleanCpf.length !== 11) {
    return { encontrado: false, origem: null, motivo: "CPF inválido. Peça ao hóspede para confirmar os 11 dígitos." };
  }

  const guest = await prisma.guest.findFirst({
    where: { tenantId, cpf: cleanCpf },
    select: { fullName: true, phone: true, whatsappPhone: true, email: true, city: true, state: true },
  });
  if (guest) {
    return {
      encontrado: true,
      origem: "cadastro_hotel",
      nome: guest.fullName,
      telefone: guest.whatsappPhone || guest.phone,
      email: guest.email,
      cidade: guest.city,
      estado: guest.state,
    };
  }

  const hubResult = await consultCpfHub(tenantId, cleanCpf);
  if (hubResult.ok) {
    return {
      encontrado: true,
      origem: "hub_desenvolvedor",
      nome: hubResult.data.nome,
      dataNascimento: hubResult.data.dataNascimentoISO || null,
      telefone: hubResult.data.telefones[0] || null,
      email: hubResult.data.emails[0] || null,
      endereco: hubResult.data.enderecoCompleto || null,
      cidade: hubResult.data.cidade || null,
      estado: hubResult.data.uf || null,
    };
  }

  return { encontrado: false, origem: null, motivo: hubResult.message };
}

async function getHotelInfo(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, tradeName: true, phone: true, address: true, city: true, state: true },
  });
  return {
    nome: tenant?.tradeName || tenant?.name,
    telefone: tenant?.phone,
    endereco: tenant?.address,
    cidade: tenant?.city,
    estado: tenant?.state,
  };
}

// Constrói o conjunto de tools do agente já vinculado a um tenant específico. `tenantId` vem
// sempre do webhook (resolvido a partir da URL /api/uazapi/webhook/[tenantId]), nunca do modelo.
export function buildGuestSupportTools(tenantId: string) {
  return {
    check_availability: tool({
      description:
        "Verifica quartos disponíveis por período. Use sempre que o hóspede perguntar sobre disponibilidade, preço de diária ou quiser reservar.",
      inputSchema: z.object({
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
      }),
      execute: async ({ checkIn, checkOut }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        const disponibilidade = await checkAvailability(tenantId, inDate, outDate);
        return { disponibilidade };
      },
    }),

    get_reservation_by_phone: tool({
      description: "Busca reservas ativas ou futuras do hóspede que está conversando, pelo telefone dele.",
      inputSchema: z.object({
        phone: z.string().describe("Telefone do hóspede (com ou sem DDI/DDD, dígitos)"),
      }),
      execute: async ({ phone }) => {
        const reservas = await findReservationsByPhone(tenantId, phone);
        return { reservas };
      },
    }),

    get_guest_by_cpf: tool({
      description:
        "Identifica o hóspede pelo CPF: busca primeiro no cadastro do hotel e, se não encontrar, consulta a base pública (Hub do Desenvolvedor) para trazer nome e dados básicos. Use quando o hóspede informar o CPF (ex: para confirmar identidade antes de fechar uma reserva).",
      inputSchema: z.object({
        cpf: z.string().describe("CPF do hóspede, só dígitos ou formatado"),
      }),
      execute: async ({ cpf }) => await findGuestByCpf(tenantId, cpf),
    }),

    list_room_categories: tool({
      description: "Lista as categorias de apartamento do hotel, com capacidade e preço de referência.",
      inputSchema: z.object({}),
      execute: async () => ({ categorias: await listRoomCategories(tenantId) }),
    }),

    get_hotel_info: tool({
      description: "Retorna informações institucionais do hotel (nome, telefone, endereço).",
      inputSchema: z.object({}),
      execute: async () => await getHotelInfo(tenantId),
    }),
  };
}

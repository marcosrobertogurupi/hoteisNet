// Tools do agente de atendimento via WhatsApp — tenant-scoped por construção: cada tool é criada
// dentro de um closure que já recebe o tenantId real resolvido no servidor (nunca aceito como
// argumento do modelo). Mesmo princípio já aplicado em toda a Fase FNRH: o hóspede nunca pode,
// via prompt injection na própria mensagem do WhatsApp, fazer o agente vazar dado de outro tenant.
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { brazilPhoneVariants } from "@/lib/uazapiInstance";
import { consultCpfHub } from "@/lib/hubCpfLookup";
import { findConflictingReservation } from "@/lib/reservationHelpers";
import { sendUazapiImage } from "@/lib/uazapi";

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// O modelo já recebe a data de hoje no prompt (ver agent.ts), mas confirmado com um caso real que
// ele ainda pode errar o ano ao montar a chamada da tool (ex: "23/08" virou "2025-08-23" mesmo com
// o prompt dizendo que hoje é 22/08/2026) — validação de defesa aqui, independente do que o modelo
// calculou, nunca aceitar reserva com check-in anterior a hoje. Compara só a data (AAAA-MM-DD) em
// Brasília, não o timestamp exato, para não rejeitar um check-in marcado para o próprio dia.
function isPastDateStr(checkInIso: string): boolean {
  const todayStr = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return checkInIso.slice(0, 10) < todayStr;
}

// Tarifa é por número de adultos, independente da categoria do apartamento (Tariff não tem
// categoryId — mesma regra do sistema legado WinDev). Usada tanto na cotação (checkAvailability)
// quanto na criação real (createReservationForAgent) para as duas nunca divergirem — confirmado
// com um caso real em que a cotação usava RoomCategory.dailyPrice (preço de referência) e a
// reserva criada cobrava um valor diferente, vindo da Tariff.
async function resolveTariff(client: { tariff: typeof prisma.tariff }, tenantId: string, adults: number) {
  return (
    (await client.tariff.findFirst({ where: { tenantId, active: true, adults: { gte: adults } }, orderBy: { adults: "asc" } })) ||
    (await client.tariff.findFirst({ where: { tenantId, active: true }, orderBy: { price: "asc" } }))
  );
}

async function checkAvailability(tenantId: string, checkIn: Date, checkOut: Date, adults: number) {
  const rooms = await prisma.room.findMany({
    where: { tenantId, active: true },
    include: { category: true },
  });
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length === 0) return [];

  const [overlappingReservations, openStays, tariff] = await Promise.all([
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
    resolveTariff(prisma, tenantId, adults),
  ]);

  const busyRoomIds = new Set<string>([
    ...overlappingReservations.map((r) => r.roomId),
    ...openStays.map((s) => s.roomId),
  ]);

  const byCategory = new Map<string, { categoria: string; capacidade: number; precoDiaria: number; quartosDisponiveis: number }>();
  for (const room of rooms) {
    if (busyRoomIds.has(room.id)) continue;
    const key = room.categoryId;
    const entry = byCategory.get(key) ?? {
      categoria: room.category.name,
      capacidade: room.category.capacity,
      precoDiaria: tariff ? Number(tariff.price) : Number(room.category.dailyPrice),
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

// RAG leve: sem embeddings/vetores, busca por palavras-chave do título/pergunta/categoria já
// verificados. Suficiente para o volume esperado de conhecimento por hotel; se a base crescer
// muito, migrar para busca vetorial no Supabase (pgvector) é o próximo passo natural.
async function searchKnowledgeBase(tenantId: string, query: string) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 6);
  if (keywords.length === 0) return [];

  const entries = await prisma.supportKnowledgeBase.findMany({
    where: {
      tenantId,
      agentType: "SUPPORT",
      verified: true,
      OR: keywords.flatMap((kw) => [
        { question: { contains: kw, mode: "insensitive" as const } },
        { title: { contains: kw, mode: "insensitive" as const } },
        { category: { contains: kw, mode: "insensitive" as const } },
      ]),
    },
    select: { title: true, category: true, question: true, resolution: true },
    take: 5,
  });
  return entries.map((e) => ({ titulo: e.title, categoria: e.category, pergunta: e.question, resposta: e.resolution }));
}

// Cria a reserva de verdade, dentro de uma transação (mesmo princípio de atomic-checkout-balance-guard
// já aplicado no resto do sistema: a checagem de conflito acontece dentro da própria transação, não
// só antes dela). O status (CONFIRMED vs PRE_RESERVATION) nunca é decidido pelo modelo — vem de
// AIAgentSetting.autoConfirmReservations, configurado pelo assinante. tenantId da Reservation em si
// é sempre "TNT-01" por convenção histórica do projeto (ver room.tenantId para o tenant real).
async function createReservationForAgent(
  tenantId: string,
  guestPhone: string,
  params: { checkIn: Date; checkOut: Date; categoryName: string; guestName: string; guestCpf?: string; adults: number }
) {
  const [agentSetting, category] = await Promise.all([
    prisma.aIAgentSetting.findUnique({ where: { tenantId }, select: { autoConfirmReservations: true } }),
    prisma.roomCategory.findFirst({ where: { tenantId, active: true, name: { equals: params.categoryName, mode: "insensitive" } } }),
  ]);
  if (!category) return { sucesso: false, erro: "Categoria de apartamento não encontrada." };

  return prisma.$transaction(async (tx) => {
    const rooms = await tx.room.findMany({ where: { tenantId, categoryId: category.id, active: true } });
    let freeRoom: (typeof rooms)[number] | null = null;
    for (const room of rooms) {
      const [conflict, openStay] = await Promise.all([
        findConflictingReservation(tx, room.id, params.checkIn, params.checkOut),
        tx.stayCheckin.findFirst({
          where: { roomId: room.id, isClosed: false, checkInDate: { lt: params.checkOut }, expectedCheckOut: { gt: params.checkIn } },
        }),
      ]);
      if (!conflict && !openStay) {
        freeRoom = room;
        break;
      }
    }
    if (!freeRoom) return { sucesso: false, erro: "Não há mais quartos livres nessa categoria para o período pedido." };

    const tariff = await resolveTariff(tx, tenantId, params.adults);
    if (!tariff) {
      return { sucesso: false, erro: "Hotel ainda não tem tarifa cadastrada — encaminhe para a recepção fechar a reserva manualmente." };
    }

    const nights = Math.max(1, Math.round((params.checkOut.getTime() - params.checkIn.getTime()) / (24 * 60 * 60 * 1000)));
    const totalAmount = Number(tariff.price) * nights;
    const status = agentSetting?.autoConfirmReservations ? "CONFIRMED" : "PRE_RESERVATION";
    const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));

    await tx.reservation.create({
      data: {
        tenantId: "TNT-01",
        roomId: freeRoom.id,
        guestName: params.guestName,
        guestPhone,
        guestCpf: params.guestCpf || null,
        checkInDate: params.checkIn,
        checkOutDate: params.checkOut,
        tariffId: tariff.id,
        tariffName: tariff.name,
        dailyRate: tariff.price,
        totalDiarias: totalAmount,
        totalAmount,
        adults: params.adults,
        children: 0,
        hasWhatsapp: true,
        reservationNumber,
        roomDescription: freeRoom.number,
        roomCategory: category.name,
        status,
        preCheckinSent: false,
        operatorName: "Agente de IA",
      },
    });

    return {
      sucesso: true,
      numeroReserva: reservationNumber,
      status,
      quarto: freeRoom.number,
      categoria: category.name,
      diarias: nights,
      valorTotal: totalAmount,
      confirmadaAutomaticamente: status === "CONFIRMED",
    };
  });
}

// Envia até 3 fotos de um quarto da categoria pedida. Fotos ficam em Room.photos (não em
// RoomCategory), então pega o primeiro quarto ativo da categoria que já tenha alguma foto
// cadastrada — mostrar fotos de um quarto real da categoria é suficiente para o hóspede ter uma
// ideia, não precisa ser exatamente o quarto que ele vai ocupar.
async function sendRoomPhotos(tenantId: string, guestPhone: string, categoryName: string) {
  const category = await prisma.roomCategory.findFirst({
    where: { tenantId, active: true, name: { equals: categoryName, mode: "insensitive" } },
  });
  if (!category) return { sucesso: false, erro: "Categoria de apartamento não encontrada." };

  const room = await prisma.room.findFirst({
    where: { tenantId, categoryId: category.id, active: true, photos: { isEmpty: false } },
  });
  if (!room || room.photos.length === 0) {
    return { sucesso: false, erro: `Não há fotos cadastradas para a categoria ${category.name}.` };
  }

  const photosToSend = room.photos.slice(0, 3);
  let enviadas = 0;
  for (const photo of photosToSend) {
    const sent = await sendUazapiImage(guestPhone, photo, `${category.name}`, tenantId);
    if (sent) enviadas++;
  }

  return enviadas > 0
    ? { sucesso: true, fotosEnviadas: enviadas }
    : { sucesso: false, erro: "Falha ao enviar as fotos pelo WhatsApp." };
}

async function getHotelInfo(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, tradeName: true, phone: true, address: true, city: true, state: true, breakfastHours: true },
  });
  return {
    nome: tenant?.tradeName || tenant?.name,
    telefone: tenant?.phone,
    endereco: tenant?.address,
    cidade: tenant?.city,
    estado: tenant?.state,
    horarioCafeDaManha: tenant?.breakfastHours || null,
  };
}

async function listServices(tenantId: string) {
  const services = await prisma.hotelService.findMany({
    where: { tenantId, active: true },
    select: { description: true, category: true, price: true },
  });
  return services.map((s) => ({ servico: s.description, categoria: s.category, preco: Number(s.price) }));
}

// Constrói o conjunto de tools do agente já vinculado a um tenant e a uma conversa específicos.
// `tenantId` e `guestPhone` vêm sempre do webhook (nunca do modelo — mesmo princípio de defesa
// contra prompt injection já aplicado em toda a Fase FNRH). `onEscalate` é chamado quando o agente
// decide que precisa de um humano, para o chamador (webhook) decidir o que fazer com isso.
export function buildGuestSupportTools(tenantId: string, guestPhone: string, onEscalate?: (reason: string) => void) {
  return {
    check_availability: tool({
      description:
        "Verifica quartos disponíveis por período e o preço real da diária para a quantidade de adultos informada. Use sempre que o hóspede perguntar sobre disponibilidade, preço de diária ou quiser reservar.",
      inputSchema: z.object({
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
        adults: z.number().int().min(1).default(1).describe("Quantidade de adultos — o preço da diária depende disso"),
      }),
      execute: async ({ checkIn, checkOut, adults }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        if (isPastDateStr(checkIn)) {
          return { erro: `Data de check-in (${checkIn}) já passou. Confira o ano — a data de hoje está no início destas instruções.` };
        }
        const disponibilidade = await checkAvailability(tenantId, inDate, outDate, adults);
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
      description: "Retorna informações institucionais do hotel (nome, telefone, endereço, horário do café da manhã).",
      inputSchema: z.object({}),
      execute: async () => await getHotelInfo(tenantId),
    }),

    list_services: tool({
      description: "Lista os serviços extras oferecidos pelo hotel (lavanderia, traslado, cama extra, estacionamento etc.) com preços.",
      inputSchema: z.object({}),
      execute: async () => ({ servicos: await listServices(tenantId) }),
    }),

    search_knowledge_base: tool({
      description:
        "Busca na base de conhecimento deste hotel por respostas já validadas para perguntas parecidas (regras da casa, políticas, dúvidas recorrentes). Use antes de dizer que não sabe algo ou de escalar para um humano.",
      inputSchema: z.object({
        query: z.string().describe("A pergunta ou tópico do hóspede, em texto livre"),
      }),
      execute: async ({ query }) => ({ resultados: await searchKnowledgeBase(tenantId, query) }),
    }),

    create_reservation: tool({
      description:
        "Cria a reserva de verdade no sistema. Só use depois de confirmar com o hóspede: categoria escolhida (via check_availability), datas, quantidade de adultos, nome e CPF (via get_guest_by_cpf). Dependendo da configuração do hotel, a reserva pode sair já confirmada ou como pré-reserva aguardando confirmação da recepção — informe o resultado exato que a tool devolver, não invente.",
      inputSchema: z.object({
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
        categoryName: z.string().describe("Nome da categoria de apartamento, exatamente como retornado por check_availability/list_room_categories"),
        guestName: z.string().describe("Nome completo do hóspede"),
        guestCpf: z.string().optional().describe("CPF do hóspede, se já identificado"),
        adults: z.number().int().min(1).default(1),
      }),
      execute: async ({ checkIn, checkOut, categoryName, guestName, guestCpf, adults }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { sucesso: false, erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        if (isPastDateStr(checkIn)) {
          return { sucesso: false, erro: `Data de check-in (${checkIn}) já passou. Confira o ano — a data de hoje está no início destas instruções.` };
        }
        return await createReservationForAgent(tenantId, guestPhone, { checkIn: inDate, checkOut: outDate, categoryName, guestName, guestCpf, adults });
      },
    }),

    send_photo: tool({
      description: "Envia fotos reais de um quarto da categoria pedida pelo hóspede via WhatsApp. Use quando ele pedir para ver fotos do quarto/apartamento.",
      inputSchema: z.object({
        categoryName: z.string().describe("Nome da categoria de apartamento, exatamente como retornado por check_availability/list_room_categories"),
      }),
      execute: async ({ categoryName }) => await sendRoomPhotos(tenantId, guestPhone, categoryName),
    }),

    escalate_to_human: tool({
      description:
        "Chame quando não conseguir ajudar o hóspede mesmo depois de consultar as tools disponíveis, ou quando ele pedir explicitamente para falar com uma pessoa. Depois de chamar, encerre com uma mensagem curta avisando que a recepção vai continuar o atendimento.",
      inputSchema: z.object({
        motivo: z.string().describe("Resumo curto do que o hóspede precisa, para a recepção entender o contexto rapidamente"),
      }),
      execute: async ({ motivo }) => {
        onEscalate?.(motivo);
        return { ok: true };
      },
    }),
  };
}

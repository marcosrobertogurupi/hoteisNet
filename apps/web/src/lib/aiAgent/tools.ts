// Tools do agente de atendimento via WhatsApp — tenant-scoped por construção: cada tool é criada
// dentro de um closure que já recebe o tenantId real resolvido no servidor (nunca aceito como
// argumento do modelo). Mesmo princípio já aplicado em toda a Fase FNRH: o hóspede nunca pode,
// via prompt injection na própria mensagem do WhatsApp, fazer o agente vazar dado de outro tenant.
import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { brazilPhoneVariants } from "@/lib/uazapiInstance";
import { consultCpfHub } from "@/lib/hubCpfLookup";
import { findConflictingReservation, findBlockingOpenStay, stayOccupiedUntil } from "@/lib/reservationHelpers";
import { sendUazapiImage } from "@/lib/uazapi";
import { sendPreCheckinLink } from "@/lib/preCheckinSender";
import { logActivity } from "@/lib/audit";

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

// Nº máximo de quartos listados por categoria na resposta de disponibilidade — o suficiente para o
// hóspede escolher um quarto/andar específico sem inflar o prompt (e o custo) do modelo.
const MAX_ROOMS_LISTED_PER_CATEGORY = 8;

// Normaliza um nome de andar para comparação tolerante ("2", "2º Andar", "segundo andar",
// "Segundo" batem entre si). Sem isso o hóspede que diz "segundo andar" nunca casa com o valor
// cadastrado no quarto (que vem do cadastro de Andares, texto livre).
const FLOOR_WORD_TO_NUMBER: Record<string, string> = {
  terreo: "0", terrea: "0", subsolo: "-1",
  primeiro: "1", primeira: "1", segundo: "2", segunda: "2", terceiro: "3", terceira: "3",
  quarto: "4", quarta: "4", quinto: "5", quinta: "5", sexto: "6", sexta: "6",
  setimo: "7", setima: "7", oitavo: "8", oitava: "8", nono: "9", nona: "9", decimo: "10", decima: "10",
};
function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}
function normalizeFloorKey(raw: string): string {
  const clean = stripDiacritics(raw)
    .toLowerCase()
    .replace(/andar|pavimento|piso|º|°|ª/g, "")
    .trim();
  const digits = clean.match(/-?\d+/)?.[0];
  if (digits) return digits;
  for (const [word, num] of Object.entries(FLOOR_WORD_TO_NUMBER)) {
    if (clean.includes(word)) return num;
  }
  return clean;
}
function floorMatches(roomFloor: string | null | undefined, query: string): boolean {
  if (!roomFloor) return normalizeFloorKey(query) === "0"; // quarto sem andar = térreo (ver formatRoom)
  return normalizeFloorKey(roomFloor) === normalizeFloorKey(query);
}

// Conjunto de ids de quartos ocupados (reserva ativa/futura ou hospedagem em aberto) que se
// sobrepõem ao período pedido. Reaproveitado por checkAvailability e pelas tools de quarto/andar.
async function busyRoomIdsForPeriod(roomIds: string[], checkIn: Date, checkOut: Date): Promise<Set<string>> {
  if (roomIds.length === 0) return new Set();
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
    // Hospedagens em aberto: NUNCA filtrar por `expectedCheckOut > checkIn` — um hóspede em
    // overstay (saída prevista no passado, hospedagem ainda não finalizada) continua ocupando o
    // quarto. Traz as candidatas e filtra pela ocupação efetiva (stayOccupiedUntil), a mesma régua
    // do Mapa de Reservas.
    prisma.stayCheckin.findMany({
      where: { roomId: { in: roomIds }, isClosed: false, checkInDate: { lt: checkOut } },
      select: { roomId: true, checkInDate: true, expectedCheckOut: true, dailiesCount: true },
    }),
  ]);
  const busyByStay = openStays.filter((s) => stayOccupiedUntil(s) > checkIn).map((s) => s.roomId);
  return new Set<string>([...overlappingReservations.map((r) => r.roomId), ...busyByStay]);
}

async function checkAvailability(tenantId: string, checkIn: Date, checkOut: Date, adults: number) {
  const rooms = await prisma.room.findMany({
    where: { tenantId, active: true },
    include: { category: true },
  });

  // Categorias EVENT_SPACE (auditório, sala de reunião) nunca entram na disponibilidade de quartos —
  // são devolvidas à parte para o agente saber explicar que não são hospedagem.
  const lodgingRooms = rooms.filter((r) => r.category.kind !== "EVENT_SPACE");
  const espacosEventos = Array.from(
    new Map(
      rooms.filter((r) => r.category.kind === "EVENT_SPACE").map((r) => [r.categoryId, { nome: r.category.name, descricao: r.category.description }])
    ).values()
  );

  const roomIds = lodgingRooms.map((r) => r.id);
  if (roomIds.length === 0) return { disponibilidade: [], espacosEventos };

  const [busyRoomIds, tariff] = await Promise.all([
    busyRoomIdsForPeriod(roomIds, checkIn, checkOut),
    resolveTariff(prisma, tenantId, adults),
  ]);

  const byCategory = new Map<
    string,
    { categoria: string; capacidade: number; precoDiaria: number; quartosDisponiveis: number; quartos: Array<{ numero: string; andar: string; bloco: string | null; camasCasal: number; camasSolteiro: number; caracteristicas: string[] }> }
  >();
  for (const room of lodgingRooms) {
    if (busyRoomIds.has(room.id)) continue;
    const key = room.categoryId;
    const entry = byCategory.get(key) ?? {
      categoria: room.category.name,
      capacidade: room.category.capacity,
      precoDiaria: tariff ? Number(tariff.price) : Number(room.category.dailyPrice),
      quartosDisponiveis: 0,
      quartos: [],
    };
    entry.quartosDisponiveis += 1;
    if (entry.quartos.length < MAX_ROOMS_LISTED_PER_CATEGORY) {
      entry.quartos.push({
        numero: room.number,
        andar: room.floor || "Térreo",
        bloco: room.bloco || null,
        // Configuração de camas do quarto (cadastrada por quarto, não por categoria — dois quartos
        // da mesma categoria podem diferir). Deixa o agente responder "tem quarto com 3 camas de
        // solteiro?" e honrar essa preferência até a reserva.
        camasCasal: room.camasCasal,
        camasSolteiro: room.camasSolteiro,
        caracteristicas: room.caracteristicas || [],
      });
    }
    byCategory.set(key, entry);
  }
  return { disponibilidade: Array.from(byCategory.values()), espacosEventos };
}

// Consulta um quarto específico pelo número, para o período pedido. Usada quando o hóspede pede um
// quarto pelo número ("queria o 207"). O tenantId vem sempre do closure — o número vindo do modelo
// é sempre revalidado contra o tenant antes de qualquer uso (regra 4 do CLAUDE.md).
async function checkRoomByNumber(tenantId: string, roomNumber: string, checkIn: Date, checkOut: Date, adults: number) {
  const room = await prisma.room.findFirst({
    where: { tenantId, active: true, number: roomNumber.trim() },
    include: { category: true },
  });
  if (!room) return { encontrado: false, motivo: `Não há um quarto com o número ${roomNumber} neste hotel.` };

  if (room.category.kind === "EVENT_SPACE") {
    return {
      encontrado: true,
      ehEspacoEventos: true,
      numero: room.number,
      categoria: room.category.name,
      motivo: `${room.category.name} é um espaço para eventos/reuniões, não um quarto de hospedagem. Encaminhe para a recepção se o hóspede quiser reservá-lo.`,
    };
  }

  const busy = await busyRoomIdsForPeriod([room.id], checkIn, checkOut);
  const tariff = await resolveTariff(prisma, tenantId, adults);
  return {
    encontrado: true,
    ehEspacoEventos: false,
    numero: room.number,
    categoria: room.category.name,
    andar: room.floor || "Térreo",
    bloco: room.bloco || null,
    camasCasal: room.camasCasal,
    camasSolteiro: room.camasSolteiro,
    caracteristicas: room.caracteristicas || [],
    capacidade: room.category.capacity,
    disponivel: !busy.has(room.id),
    precoDiaria: tariff ? Number(tariff.price) : Number(room.category.dailyPrice),
  };
}

// Lista quartos de hospedagem por andar, para o período pedido. Se `andar` vier vazio, agrupa todos
// os andares. Casa "segundo andar" / "2º andar" / "2" com o valor cadastrado no quarto.
async function listRoomsByFloor(tenantId: string, andar: string | undefined, checkIn: Date, checkOut: Date, adults: number) {
  const rooms = await prisma.room.findMany({
    where: { tenantId, active: true },
    include: { category: true },
  });
  const lodgingRooms = rooms.filter((r) => r.category.kind !== "EVENT_SPACE");
  const filtered = andar && andar.trim() ? lodgingRooms.filter((r) => floorMatches(r.floor, andar)) : lodgingRooms;

  if (filtered.length === 0) {
    const andaresConhecidos = Array.from(new Set(lodgingRooms.map((r) => r.floor || "Térreo")));
    return { encontrados: 0, andaresConhecidos, motivo: andar ? `Nenhum quarto encontrado no andar "${andar}".` : "Nenhum quarto cadastrado." };
  }

  const [busy, tariff] = await Promise.all([
    busyRoomIdsForPeriod(filtered.map((r) => r.id), checkIn, checkOut),
    resolveTariff(prisma, tenantId, adults),
  ]);

  const byFloor = new Map<string, Array<{ numero: string; categoria: string; disponivel: boolean; camasCasal: number; camasSolteiro: number; caracteristicas: string[] }>>();
  for (const room of filtered) {
    const key = room.floor || "Térreo";
    const list = byFloor.get(key) ?? [];
    list.push({
      numero: room.number,
      categoria: room.category.name,
      disponivel: !busy.has(room.id),
      camasCasal: room.camasCasal,
      camasSolteiro: room.camasSolteiro,
      caracteristicas: room.caracteristicas || [],
    });
    byFloor.set(key, list);
  }
  return {
    encontrados: filtered.length,
    precoDiaria: tariff ? Number(tariff.price) : null,
    andares: Array.from(byFloor.entries()).map(([andar, quartos]) => ({ andar, quartos })),
  };
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
    select: { name: true, capacity: true, dailyPrice: true, description: true, kind: true },
  });
  return categories.map((c) => ({
    categoria: c.name,
    capacidade: c.capacity,
    precoDiariaReferencia: Number(c.dailyPrice),
    descricao: c.description,
    tipo: c.kind === "EVENT_SPACE" ? "espaco_eventos" : "hospedagem",
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

// RAG leve: sem embeddings/vetores, busca por palavras-chave. Cobre os dois níveis da Base de
// Conhecimento do Hotel: (1) os 12 "documentos" por área de dúvida que o hotel mantém
// (HotelKnowledgeTopic) e (2) as perguntas+respostas pontuais aprovadas (SupportKnowledgeBase,
// status ACTIVE). Retorna só trechos relevantes e truncados — nunca o documento inteiro — para não
// inflar o prompt/custo. Se a base crescer muito, migrar para busca vetorial (pgvector) é o próximo
// passo natural.
const KB_TOPIC_MAX_RESULTS = 2;
const KB_TOPIC_CONTENT_MAX_CHARS = 700;
const KB_ENTRY_MAX_RESULTS = 5;

// `content` só guarda informação real do hotel (o texto-guia é placeholder de tela, nunca gravado —
// ver ensureKnowledgeTopics), então "preenchido" é simplesmente ter conteúdo não vazio.
function isTopicFilled(topic: { content: string }): boolean {
  return !!topic.content?.trim();
}

async function searchKnowledgeBase(tenantId: string, query: string) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 4)
    .slice(0, 6);
  if (keywords.length === 0) return { topicos: [], perguntas: [] };

  const [topicsRaw, entries] = await Promise.all([
    prisma.hotelKnowledgeTopic.findMany({
      where: {
        tenantId,
        active: true,
        OR: keywords.flatMap((kw) => [
          { title: { contains: kw, mode: "insensitive" as const } },
          { content: { contains: kw, mode: "insensitive" as const } },
        ]),
      },
      select: { title: true, content: true },
    }),
    prisma.supportKnowledgeBase.findMany({
      where: {
        tenantId,
        agentType: "SUPPORT",
        status: "ACTIVE",
        OR: keywords.flatMap((kw) => [
          { question: { contains: kw, mode: "insensitive" as const } },
          { title: { contains: kw, mode: "insensitive" as const } },
          { category: { contains: kw, mode: "insensitive" as const } },
        ]),
      },
      select: { title: true, category: true, question: true, resolution: true },
      take: KB_ENTRY_MAX_RESULTS,
    }),
  ]);

  const topicos = topicsRaw
    .filter(isTopicFilled)
    .slice(0, KB_TOPIC_MAX_RESULTS)
    .map((t) => ({
      area: t.title,
      informacao:
        t.content.length > KB_TOPIC_CONTENT_MAX_CHARS ? t.content.slice(0, KB_TOPIC_CONTENT_MAX_CHARS) + "…" : t.content,
    }));

  const perguntas = entries.map((e) => ({
    titulo: e.title,
    categoria: e.category,
    pergunta: e.question,
    resposta: e.resolution,
  }));

  return { topicos, perguntas };
}

// Horário padrão de check-in/check-out do hotel. A tela de Configurações ("Horários Padrão de
// Check-in e Check-out") só persiste esse valor no localStorage do navegador — o agente roda no
// servidor e não tem acesso a isso, então usa o mesmo padrão já assumido em todo o resto do
// sistema quando o hóspede não define um horário (LancarReservaModal.tsx, CheckinHospedagemModal.tsx).
const DEFAULT_CHECK_IN_TIME = "14:00";
const DEFAULT_CHECK_OUT_TIME = "12:00";

// O modelo manda só a data (AAAA-MM-DD). Ancoramos no horário padrão de check-in/out do hotel no
// fuso de Brasília (UTC-3 o ano todo — o Brasil não tem mais horário de verão desde 2019), igual
// ao fluxo manual (LancarReservaModal/POST /api/reservations). Sem isso a reserva era gravada à
// meia-noite UTC, que é 21h do dia ANTERIOR em BRT — desalinhava a barra do Mapa de Reservas, a
// checagem de conflito e a régua de tolerância de no-show (a reserva "nascia" já quase expirada).
function atBrasiliaTime(dateYmd: string, hhmm: string): Date {
  return new Date(`${dateYmd}T${hhmm}:00-03:00`);
}

// Cria a reserva de verdade, dentro de uma transação (mesmo princípio de atomic-checkout-balance-guard
// já aplicado no resto do sistema: a checagem de conflito acontece dentro da própria transação, não
// só antes dela). O status (CONFIRMED vs PRE_RESERVATION) nunca é decidido pelo modelo — vem de
// AIAgentSetting.autoConfirmReservations, configurado pelo assinante. tenantId da Reservation em si
// é sempre "TNT-01" por convenção histórica do projeto (ver room.tenantId para o tenant real).
async function createReservationForAgent(
  tenantId: string,
  guestPhone: string,
  params: {
    checkIn: Date;
    checkOut: Date;
    categoryName?: string;
    roomNumber?: string;
    floor?: string;
    camasCasal?: number;
    camasSolteiro?: number;
    guestName: string;
    guestCpf?: string;
    adults: number;
  }
) {
  // Se o hóspede pediu um quarto específico pelo número, é o quarto que manda — a categoria é
  // derivada dele, não do que o modelo passou. O número vem do modelo, então é revalidado contra o
  // tenant aqui (regra 4 do CLAUDE.md: id de recurso vindo do cliente nunca é usado cru).
  const requestedRoom = params.roomNumber?.trim()
    ? await prisma.room.findFirst({ where: { tenantId, active: true, number: params.roomNumber.trim() }, include: { category: true } })
    : null;
  if (params.roomNumber?.trim() && !requestedRoom) {
    return { sucesso: false, erro: `Não há um quarto com o número ${params.roomNumber} neste hotel.` };
  }

  const [agentSetting, categoryByName] = await Promise.all([
    prisma.aIAgentSetting.findUnique({ where: { tenantId }, select: { autoConfirmReservations: true } }),
    params.categoryName
      ? prisma.roomCategory.findFirst({ where: { tenantId, active: true, name: { equals: params.categoryName, mode: "insensitive" } } })
      : Promise.resolve(null),
  ]);
  const category = requestedRoom?.category ?? categoryByName;
  if (!category) return { sucesso: false, erro: "Categoria de apartamento não encontrada." };

  if (category.kind === "EVENT_SPACE") {
    return {
      sucesso: false,
      precisaEscalar: true,
      erro: `${category.name} é um espaço para eventos/reuniões, não um quarto — a reserva desse tipo de espaço passa pela recepção. Use escalate_to_human.`,
    };
  }

  const floorPref = params.floor?.trim() || null;
  const bedsDoublePref = params.camasCasal && params.camasCasal > 0 ? params.camasCasal : null;
  const bedsSinglePref = params.camasSolteiro && params.camasSolteiro > 0 ? params.camasSolteiro : null;
  const bedsPrefLabel = [
    bedsDoublePref ? `${bedsDoublePref} de casal` : null,
    bedsSinglePref ? `${bedsSinglePref} de solteiro` : null,
  ]
    .filter(Boolean)
    .join(" + ");

  // Datas ancoradas no horário padrão do hotel (BRT) — usadas em TODAS as checagens e na gravação,
  // para o agente nunca divergir do fluxo manual. params.checkIn/checkOut chegam à meia-noite UTC
  // (o modelo só informa a data), então extraímos só a parte AAAA-MM-DD.
  const checkInAt = atBrasiliaTime(params.checkIn.toISOString().slice(0, 10), DEFAULT_CHECK_IN_TIME);
  const checkOutAt = atBrasiliaTime(params.checkOut.toISOString().slice(0, 10), DEFAULT_CHECK_OUT_TIME);

  const result = await prisma.$transaction(async (tx) => {
    let rooms = requestedRoom
      ? await tx.room.findMany({ where: { tenantId, id: requestedRoom.id, active: true } })
      : await tx.room.findMany({ where: { tenantId, categoryId: category.id, active: true } });

    // Preferência de andar do hóspede: filtra os candidatos ANTES de escolher — nunca reservar em
    // outro andar quando ele deixou claro que quer um específico (caso real: hóspede pediu "segundo
    // andar" três vezes e o agente reservou no 109, 1º andar, porque a tool só recebia a categoria).
    if (floorPref && !requestedRoom) {
      const onFloor = rooms.filter((r) => floorMatches(r.floor, floorPref));
      if (onFloor.length === 0) {
        return {
          sucesso: false as const,
          erro: `A categoria ${category.name} não tem quartos no andar "${params.floor}". Ofereça outro andar ou outra categoria — nunca reserve num andar diferente do que o hóspede pediu.`,
        };
      }
      rooms = onFloor;
    }

    // Preferência de configuração de camas: mesma régua do andar — se o hóspede pediu "3 camas de
    // solteiro", nunca reservar um quarto que não atende. Trata os números como mínimo (um quarto
    // com 4 de solteiro serve para quem pediu 3).
    if ((bedsDoublePref || bedsSinglePref) && !requestedRoom) {
      const matching = rooms.filter(
        (r) =>
          (!bedsDoublePref || r.camasCasal >= bedsDoublePref) &&
          (!bedsSinglePref || r.camasSolteiro >= bedsSinglePref)
      );
      if (matching.length === 0) {
        return {
          sucesso: false as const,
          erro: `A categoria ${category.name} não tem quarto com ${bedsPrefLabel}. Ofereça outra categoria ou outra configuração de camas — nunca reserve um quarto que não atende o que o hóspede pediu.`,
        };
      }
      rooms = matching;
    }

    let freeRoom: (typeof rooms)[number] | null = null;
    for (const room of rooms) {
      const [conflict, openStay] = await Promise.all([
        findConflictingReservation(tx, room.id, checkInAt, checkOutAt),
        // Hospedagem em aberto (inclui overstay) — findBlockingOpenStay usa a ocupação efetiva, não
        // o expectedCheckOut cru. Impede o agente de reservar um quarto onde ainda há hóspede.
        findBlockingOpenStay(tx, room.id, checkInAt, checkOutAt),
      ]);
      if (!conflict && !openStay) {
        freeRoom = room;
        break;
      }
    }
    if (!freeRoom) {
      return {
        sucesso: false as const,
        erro: requestedRoom
          ? `O quarto ${requestedRoom.number} não está livre no período pedido. Ofereça outro quarto da mesma categoria (${category.name}).`
          : floorPref
            ? `Não há quarto livre da categoria ${category.name} no andar "${params.floor}" para o período. Ofereça outro andar ou categoria — nunca reserve num andar diferente do pedido.`
            : bedsPrefLabel
              ? `Não há quarto livre da categoria ${category.name} com ${bedsPrefLabel} para o período. Ofereça outra categoria ou configuração de camas — nunca reserve um quarto que não atende o pedido.`
              : "Não há mais quartos livres nessa categoria para o período pedido.",
      };
    }

    const tariff = await resolveTariff(tx, tenantId, params.adults);
    if (!tariff) {
      return { sucesso: false as const, erro: "Hotel ainda não tem tarifa cadastrada — encaminhe para a recepção fechar a reserva manualmente." };
    }

    const nights = Math.max(1, Math.round((checkOutAt.getTime() - checkInAt.getTime()) / (24 * 60 * 60 * 1000)));
    const totalAmount = Number(tariff.price) * nights;
    const status = agentSetting?.autoConfirmReservations ? "CONFIRMED" : "PRE_RESERVATION";
    const reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));

    const created = await tx.reservation.create({
      data: {
        tenantId: "TNT-01",
        roomId: freeRoom.id,
        guestName: params.guestName,
        guestPhone,
        guestCpf: params.guestCpf || null,
        checkInDate: checkInAt,
        checkOutDate: checkOutAt,
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
      sucesso: true as const,
      reservationId: created.id,
      numeroReserva: reservationNumber,
      status,
      quarto: freeRoom.number,
      andar: freeRoom.floor || "Térreo",
      camasCasal: freeRoom.camasCasal,
      camasSolteiro: freeRoom.camasSolteiro,
      categoria: category.name,
      diarias: nights,
      valorTotal: totalAmount,
      confirmadaAutomaticamente: status === "CONFIRMED",
      horarioCheckIn: DEFAULT_CHECK_IN_TIME,
      horarioCheckOut: DEFAULT_CHECK_OUT_TIME,
    };
  });

  if (result.sucesso) {
    await logActivity({
      tenantId,
      userName: "Agente de IA",
      action: "AGENT_RESERVATION_CREATE",
      entityType: "RESERVATION",
      entityId: result.reservationId,
      description: `Reserva ${result.numeroReserva} criada pelo agente de atendimento (${result.quarto}, ${params.guestName}).`,
    });
  }

  return result;
}

// Janela de validade de um pedido de cancelamento pendente (ver cancelReservationForAgent) — se o
// hóspede não confirmar dentro deste prazo, a próxima chamada da tool volta a exigir novo pedido.
const AGENT_CANCEL_CONFIRMATION_WINDOW_MS = 5 * 60 * 1000;
// Intervalo mínimo antes de uma confirmação pendente poder ser efetivada — existe para impedir que
// o próprio modelo "confirme" chamando a tool duas vezes seguidas dentro do mesmo turno (o
// ToolLoopAgent permite até 8 passos numa única execução, ver buildGuestSupportAgent em agent.ts).
// Uma resposta real do hóspede sempre implica uma nova mensagem de WhatsApp chegando por um novo
// webhook, em processos separados — o que na prática nunca acontece em menos deste intervalo —
// enquanto duas chamadas da mesma tool dentro do mesmo turno acontecem em milissegundos.
const AGENT_CANCEL_MIN_CONFIRMATION_GAP_MS = 5 * 1000;

// Cancela (soft-cancel, status = CANCELLED) uma reserva a pedido do hóspede via WhatsApp — nunca
// apaga a linha do banco (diferente da exclusão física que a tela de admin usa). Só permite
// cancelar PRE_RESERVATION/CONFIRMED; nunca CHECKED_IN (hospedagem em andamento sempre vai para a
// recepção). Gated por AIAgentSetting.allowAgentCancelReservation — desligado por padrão.
//
// Exige confirmação registrada em código, não só sugerida no prompt do modelo: a PRIMEIRA chamada
// desta função para uma reserva nunca cancela de verdade — só grava Reservation.agentCancelRequestedAt
// e devolve aguardandoConfirmacao:true, pedindo que o hóspede confirme explicitamente. Só uma
// SEGUNDA chamada, para a mesma reserva e dentro de AGENT_CANCEL_CONFIRMATION_WINDOW_MS, efetiva o
// cancelamento (isso acontece naturalmente no fluxo: o modelo chama a tool de novo depois que o
// hóspede responde afirmativamente numa mensagem seguinte — ver instruções em agent.ts). Assim, uma
// única chamada da tool nunca é suficiente para cancelar, mesmo que o modelo erre a leitura da
// conversa e chame a tool cedo demais.
async function cancelReservationForAgent(tenantId: string, guestPhone: string, reservationNumber: string) {
  const setting = await prisma.aIAgentSetting.findUnique({ where: { tenantId }, select: { allowAgentCancelReservation: true } });
  if (!setting?.allowAgentCancelReservation) {
    return { sucesso: false, precisaEscalar: true, erro: "Cancelamento pelo agente não está habilitado neste hotel." };
  }

  const variants = brazilPhoneVariants(guestPhone.replace(/\D/g, ""));
  const reservation = await prisma.reservation.findFirst({
    where: { reservationNumber, room: { tenantId } },
    include: { room: { select: { number: true, tenantId: true } } },
  });

  if (!reservation || !variants.some((v) => brazilPhoneVariants(reservation.guestPhone || "").includes(v))) {
    return { sucesso: false, erro: "Reserva não encontrada para este telefone." };
  }
  if (reservation.status === "CHECKED_IN") {
    return { sucesso: false, precisaEscalar: true, erro: "Esta hospedagem já teve check-in — cancelamento precisa passar pela recepção." };
  }
  if (reservation.status !== "PRE_RESERVATION" && reservation.status !== "CONFIRMED") {
    return { sucesso: false, erro: `Reserva já está com status ${reservation.status}, não é possível cancelar.` };
  }

  const now = new Date();
  const pendingSince = reservation.agentCancelRequestedAt;
  const pendingAgeMs = pendingSince ? now.getTime() - pendingSince.getTime() : -1;
  const pendingStillValid = pendingAgeMs >= AGENT_CANCEL_MIN_CONFIRMATION_GAP_MS && pendingAgeMs < AGENT_CANCEL_CONFIRMATION_WINDOW_MS;

  if (!pendingStillValid) {
    // Primeira chamada (ou pedido anterior expirado): só registra o pedido, não cancela.
    await prisma.reservation.update({ where: { id: reservation.id }, data: { agentCancelRequestedAt: now } });
    return {
      sucesso: false,
      aguardandoConfirmacao: true,
      numeroReserva: reservationNumber,
      quarto: reservation.room.number,
      erro:
        "Pedido de cancelamento registrado, mas ainda não confirmado. Peça para o hóspede confirmar explicitamente (ex: responda CONFIRMAR) e só então chame cancel_reservation de novo com o mesmo número de reserva.",
    };
  }

  // Segunda chamada dentro da janela de validade: cancela de verdade.
  await prisma.reservation.update({
    where: { id: reservation.id },
    data: { status: "CANCELLED", agentCancelRequestedAt: null },
  });

  await logActivity({
    tenantId,
    userName: "Agente de IA",
    action: "AGENT_RESERVATION_CANCEL",
    entityType: "RESERVATION",
    entityId: reservation.id,
    description: `Reserva ${reservationNumber} (quarto ${reservation.room.number}, ${reservation.guestName}) cancelada pelo agente de atendimento a pedido do hóspede.`,
  });

  return { sucesso: true, numeroReserva: reservationNumber, quarto: reservation.room.number };
}

// Reenvia o link de pré-check-in/FNRH a pedido do hóspede — reaproveita sendPreCheckinLink
// (mesma função usada pelo cron automático e pelo botão manual da recepção), só acrescenta um
// segundo registro de auditoria prefixado AGENT_ para aparecer na tela "Ações do Agente".
async function resendFnrhForAgent(tenantId: string, guestPhone: string, reservationNumber: string) {
  const variants = brazilPhoneVariants(guestPhone.replace(/\D/g, ""));
  const reservation = await prisma.reservation.findFirst({
    where: { reservationNumber, room: { tenantId } },
    select: { id: true, guestPhone: true, guestName: true },
  });

  if (!reservation || !variants.some((v) => brazilPhoneVariants(reservation.guestPhone || "").includes(v))) {
    return { sucesso: false, erro: "Reserva não encontrada para este telefone." };
  }

  const result = await sendPreCheckinLink(reservation.id);
  if (!result.success) {
    return { sucesso: false, erro: result.error };
  }

  await logActivity({
    tenantId,
    userName: "Agente de IA",
    action: "AGENT_FNRH_RESEND",
    entityType: "RESERVATION",
    entityId: reservation.id,
    description: `Link de pré-check-in/FNRH reenviado pelo agente de atendimento a pedido de ${reservation.guestName}.`,
  });

  return { sucesso: true };
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
    select: { name: true, tradeName: true, phone: true, breakfastHours: true, breakfastHoursHoliday: true },
  });
  // Deliberadamente sem endereço/cidade/estado: o cadastro do Tenant só tem esses campos parciais
  // (às vezes só a cidade, às vezes errados) e o agente respondia "o hotel fica em <cidade>", que é
  // inútil para quem quer chegar. Localização, endereço, mapa, estacionamento e transfer vêm do
  // tópico "Localização" da base de conhecimento (search_knowledge_base).
  return {
    nome: tenant?.tradeName || tenant?.name,
    telefone: tenant?.phone,
    // Horário padrão do café da manhã (segunda a sábado).
    horarioCafeDaManha: tenant?.breakfastHours || null,
    // Horário do café da manhã aos domingos e feriados. Se null, vale o horário padrão todos os dias.
    horarioCafeDaManhaDomingosEFeriados: tenant?.breakfastHoursHoliday || null,
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
        "Verifica quartos disponíveis por período e o preço real da diária para a quantidade de adultos informada. Use sempre que o hóspede perguntar sobre disponibilidade, preço de diária ou quiser reservar. O retorno traz, por categoria, a lista de quartos livres com número, andar, bloco, configuração de camas (`camasCasal`/`camasSolteiro`) e características — dá para responder sobre um quarto, andar ou tipo de cama específico a partir disso. `espacosEventos` lista espaços que NÃO são hospedagem (auditório, sala de reunião): nunca ofereça como quarto/diária.",
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
        return await checkAvailability(tenantId, inDate, outDate, adults);
      },
    }),

    check_room_by_number: tool({
      description:
        "Consulta um quarto específico pelo número, para um período. Use quando o hóspede pedir um quarto pelo número ('queria o 207', 'o mesmo da última vez, 305'). Devolve categoria, andar, bloco, configuração de camas (`camasCasal`/`camasSolteiro`), características, capacidade, se está disponível no período e o preço da diária. Se `ehEspacoEventos` for true, não é quarto de hospedagem — encaminhe para a recepção.",
      inputSchema: z.object({
        roomNumber: z.string().describe("Número do quarto exatamente como o hóspede falou (ex: '207')"),
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
        adults: z.number().int().min(1).default(1).describe("Quantidade de adultos — o preço da diária depende disso"),
      }),
      execute: async ({ roomNumber, checkIn, checkOut, adults }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        if (isPastDateStr(checkIn)) {
          return { erro: `Data de check-in (${checkIn}) já passou. Confira o ano — a data de hoje está no início destas instruções.` };
        }
        return await checkRoomByNumber(tenantId, roomNumber, inDate, outDate, adults);
      },
    }),

    list_rooms_by_floor: tool({
      description:
        "Lista os quartos de hospedagem de um andar (ou de todos os andares, se `andar` for omitido), para um período, indicando quais estão livres e a configuração de camas de cada um (`camasCasal`/`camasSolteiro`). Use quando o hóspede perguntar por andar ('o que tem no segundo andar?', 'algo no térreo?'). Casa '2', '2º andar', 'segundo andar' com o cadastro. Se não achar o andar, o retorno traz `andaresConhecidos` para você oferecer as opções reais.",
      inputSchema: z.object({
        andar: z.string().optional().describe("Andar como o hóspede falou (ex: 'segundo andar', '2', 'térreo'). Omita para listar todos."),
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
        adults: z.number().int().min(1).default(1).describe("Quantidade de adultos — o preço da diária depende disso"),
      }),
      execute: async ({ andar, checkIn, checkOut, adults }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        if (isPastDateStr(checkIn)) {
          return { erro: `Data de check-in (${checkIn}) já passou. Confira o ano — a data de hoje está no início destas instruções.` };
        }
        return await listRoomsByFloor(tenantId, andar, inDate, outDate, adults);
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
      description:
        "Lista as categorias de apartamento do hotel, com capacidade e preço de referência. O campo `tipo` diz se é 'hospedagem' ou 'espaco_eventos' — categorias 'espaco_eventos' (auditório, sala de reunião) nunca devem ser oferecidas como quarto.",
      inputSchema: z.object({}),
      execute: async () => ({ categorias: await listRoomCategories(tenantId) }),
    }),

    get_hotel_info: tool({
      description:
        "Retorna nome, telefone e horário do café da manhã do hotel (de segunda a sábado e, quando houver, o horário diferente para domingos e feriados). NÃO tem endereço, localização, estacionamento nem transfer — para isso use search_knowledge_base (tópico 'Localização').",
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
        "Consulta a base de conhecimento deste hotel: localização, endereço, como chegar, estacionamento, transfer, regras da casa, políticas (cancelamento, pets, crianças), horários, o que a diária inclui, formas de pagamento, recomendações locais e dúvidas recorrentes. Retorna `topicos` (trechos do manual que o hotel mantém, por área) e `perguntas` (perguntas+respostas pontuais já aprovadas). Use SEMPRE antes de dizer que não sabe algo ou de escalar para um humano. Se vier vazio, aí sim escale.",
      inputSchema: z.object({
        query: z.string().describe("A pergunta ou tópico do hóspede, em texto livre"),
      }),
      execute: async ({ query }) => await searchKnowledgeBase(tenantId, query),
    }),

    create_reservation: tool({
      description:
        "Cria a reserva de verdade no sistema. Só use depois de confirmar com o hóspede: categoria escolhida (via check_availability), datas, quantidade de adultos, nome e CPF (via get_guest_by_cpf). Informe `roomNumber` quando o hóspede tiver pedido um quarto específico pelo número — a reserva sai nesse quarto exato. Informe `floor` quando ele tiver pedido um andar específico ('quero no segundo andar') — a reserva só sai num quarto daquele andar; se não houver, a tool avisa e você oferece outro andar/categoria, NUNCA reserve num andar diferente do que ele pediu. Informe `camasSolteiro`/`camasCasal` quando ele tiver pedido uma configuração de camas ('quero um quarto com 3 camas de solteiro') — a reserva só sai num quarto que atende; se não houver, a tool avisa e você oferece outra categoria/configuração, NUNCA reserve um quarto que não atende o pedido. Sem `roomNumber`/`floor`/camas, o sistema escolhe qualquer quarto livre da categoria. Dependendo da configuração do hotel, a reserva pode sair já confirmada ou como pré-reserva aguardando a recepção — informe o resultado exato que a tool devolver, não invente. Se o retorno tiver precisaEscalar:true (ex: categoria é espaço de eventos), use escalate_to_human. O retorno inclui `quarto`, `andar`, `camasCasal`/`camasSolteiro`, horarioCheckIn/horarioCheckOut — informe o quarto, o andar e os dois horários na confirmação, junto com as datas.",
      inputSchema: z.object({
        checkIn: z.string().describe("Data de entrada no formato AAAA-MM-DD"),
        checkOut: z.string().describe("Data de saída no formato AAAA-MM-DD"),
        categoryName: z.string().optional().describe("Nome da categoria de apartamento, como retornado por check_availability/list_room_categories. Opcional se roomNumber for informado."),
        roomNumber: z.string().optional().describe("Número de um quarto específico pedido pelo hóspede (ex: '207'). Quando informado, a categoria é derivada do próprio quarto."),
        floor: z.string().optional().describe("Andar pedido pelo hóspede, como ele falou (ex: 'segundo andar', '2'). Obrigatório quando ele expressou preferência de andar e não escolheu um quarto pelo número."),
        camasSolteiro: z.number().int().min(1).optional().describe("Nº mínimo de camas de solteiro pedido pelo hóspede (ex: 3 para 'quarto com 3 camas de solteiro'). Só quando ele expressou essa preferência."),
        camasCasal: z.number().int().min(1).optional().describe("Nº mínimo de camas de casal pedido pelo hóspede. Só quando ele expressou essa preferência."),
        guestName: z.string().describe("Nome completo do hóspede"),
        guestCpf: z.string().optional().describe("CPF do hóspede, se já identificado"),
        adults: z.number().int().min(1).default(1),
      }),
      execute: async ({ checkIn, checkOut, categoryName, roomNumber, floor, camasSolteiro, camasCasal, guestName, guestCpf, adults }) => {
        const inDate = new Date(checkIn);
        const outDate = new Date(checkOut);
        if (isNaN(inDate.getTime()) || isNaN(outDate.getTime()) || outDate <= inDate) {
          return { sucesso: false, erro: "Datas inválidas. checkOut deve ser depois de checkIn." };
        }
        if (isPastDateStr(checkIn)) {
          return { sucesso: false, erro: `Data de check-in (${checkIn}) já passou. Confira o ano — a data de hoje está no início destas instruções.` };
        }
        if (!categoryName && !roomNumber) {
          return { sucesso: false, erro: "Informe categoryName ou roomNumber." };
        }
        return await createReservationForAgent(tenantId, guestPhone, { checkIn: inDate, checkOut: outDate, categoryName, roomNumber, floor, camasSolteiro, camasCasal, guestName, guestCpf, adults });
      },
    }),

    cancel_reservation: tool({
      description:
        "Pede o cancelamento (soft-cancel, reversível) de uma reserva do hóspede. NUNCA cancela na primeira chamada: ela só registra o pedido e devolve aguardandoConfirmacao:true — nesse caso, peça ao hóspede uma confirmação explícita (ex: 'responda CONFIRMAR para cancelar a reserva RES-XXXX') e só chame esta tool de novo, com o mesmo número de reserva, depois que ele confirmar numa mensagem seguinte; a segunda chamada, dentro de poucos minutos da primeira, efetiva o cancelamento. Se o retorno tiver precisaEscalar:true, use escalate_to_human em seguida — significa que o cancelamento pelo agente está desligado nas configurações do hotel, ou que a hospedagem já teve check-in.",
      inputSchema: z.object({
        reservationNumber: z.string().describe("Número da reserva (ex: RES-1234), já visto pelo hóspede via get_reservation_by_phone ou na confirmação da reserva"),
      }),
      execute: async ({ reservationNumber }) => await cancelReservationForAgent(tenantId, guestPhone, reservationNumber),
    }),

    resend_fnrh_link: tool({
      description: "Reenvia o link de pré-check-in/FNRH da reserva do hóspede via WhatsApp. Use quando ele pedir o link de novo, disser que perdeu ou não recebeu.",
      inputSchema: z.object({
        reservationNumber: z.string().describe("Número da reserva (ex: RES-1234), já visto pelo hóspede via get_reservation_by_phone ou na confirmação da reserva"),
      }),
      execute: async ({ reservationNumber }) => await resendFnrhForAgent(tenantId, guestPhone, reservationNumber),
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

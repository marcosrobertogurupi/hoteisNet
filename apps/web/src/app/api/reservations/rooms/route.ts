import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/utils/supabaseClient";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// Reexecuta uma operação do Prisma uma vez em caso de falha de conexão com o banco
// (ex.: reconexão "fria" do pool do Supabase após período ocioso), evitando expor
// esse tipo de erro transitório ao usuário final.
async function withDbRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    const isConnectionError =
      error?.code === "P1001" || error?.code === "P1002" || error?.code === "P1017" || /connect/i.test(String(error?.message || ""));
    if (!isConnectionError) throw error;
    await new Promise((resolve) => setTimeout(resolve, 300));
    return operation();
  }
}

// Formata um Room (com category e a hospedagem ativa mais recente, se houver) para a resposta da API
function formatRoom(r: any) {
  const activeStay = r.checkins && r.checkins[0];
  return {
    id: r.id,
    number: r.number,
    floor: r.floor || "Térreo",
    bloco: r.bloco || "",
    camasCasal: r.camasCasal ?? 0,
    camasSolteiro: r.camasSolteiro ?? 0,
    caracteristicas: r.caracteristicas || [],
    photos: r.photos || [],
    status: r.status,
    notes: r.notes || "",
    active: r.active,
    categoryId: r.categoryId,
    category: r.category.name,
    ratePerNight: Number(r.category.dailyPrice),
    capacity: r.category.capacity,
    room_categories: {
      id: r.category.id,
      name: r.category.name,
      description: r.category.description || r.category.name,
    },
    activeStay: activeStay
      ? {
          stayCheckinId: activeStay.id,
          guestName: activeStay.primaryGuest?.fullName || null,
          checkInDate: activeStay.checkInDate,
          expectedCheckOut: activeStay.expectedCheckOut,
          totalConsumption: Number(activeStay.totalConsumption),
          unreadWhatsappCount: activeStay._count?.whatsappMessages ?? 0,
        }
      : null,
  };
}

// Resolve o nome de categoria vindo do formulário para um categoryId existente,
// criando a categoria no tenant caso ainda não exista.
async function resolveCategoryId(tenantId: string, categoryName: string): Promise<string> {
  const existing = await prisma.roomCategory.findFirst({
    where: { tenantId, name: categoryName },
  });
  if (existing) return existing.id;

  const created = await prisma.roomCategory.create({
    data: {
      tenantId,
      name: categoryName,
      dailyPrice: 0,
      capacity: 2,
    },
  });
  return created.id;
}

function mapStatusToDb(status?: string): string | undefined {
  if (!status) return undefined;
  const map: Record<string, string> = {
    LIVRE: "VACANT_CLEAN",
    OCUPADO: "OCCUPIED",
    LIMPEZA: "VACANT_DIRTY",
    MANUTENCAO: "MAINTENANCE",
  };
  return map[status] || status;
}

// GET /api/reservations/rooms — lista todos os quartos com categoria do banco
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const activeStayInclude = {
      where: { isClosed: false },
      orderBy: { checkInDate: "desc" as const },
      take: 1,
      include: {
        primaryGuest: true,
        _count: { select: { whatsappMessages: { where: { direction: "IN", read: false } } } },
      },
    };

    const rooms = await withDbRetry(() =>
      prisma.room.findMany({
        where: {
          tenantId: { in: tenantIdsToSearch },
        },
        include: {
          category: true,
          checkins: activeStayInclude,
        },
        orderBy: {
          number: "asc",
        },
      })
    );

    if (!rooms || rooms.length === 0) {
      // Se não encontrar por tenantId, buscar todos os quartos cadastrados no banco
      const allRooms = await withDbRetry(() =>
        prisma.room.findMany({
          include: { category: true, checkins: activeStayInclude },
          orderBy: { number: "asc" },
        })
      );

      const formatted = allRooms.map((r) => formatRoom(r));

      return NextResponse.json({ success: true, rooms: formatted });
    }

    const formatted = rooms.map((r) => formatRoom(r));

    return NextResponse.json({ success: true, rooms: formatted });
  } catch (error: any) {
    console.error("[GET /api/reservations/rooms] Erro ao buscar quartos do Prisma:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// POST /api/reservations/rooms — cria um novo apartamento (UH) no banco de dados
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId,
      numero,
      categoria,
      andar,
      bloco,
      camasCasal,
      camasSolteiro,
      caracteristicas,
      photos,
      status,
      observacao,
    } = body;

    if (!numero || !String(numero).trim()) {
      return NextResponse.json({ success: false, error: "Número do quarto é obrigatório." }, { status: 400 });
    }

    const effectiveTenantId = tenantId || DEFAULT_TENANT_ID;
    const categoryId = await resolveCategoryId(effectiveTenantId, categoria || "Standard");

    const created = await prisma.room.create({
      data: {
        tenantId: effectiveTenantId,
        categoryId,
        number: String(numero).trim(),
        floor: andar || null,
        bloco: bloco || null,
        camasCasal: camasCasal ?? 0,
        camasSolteiro: camasSolteiro ?? 0,
        caracteristicas: caracteristicas || [],
        photos: photos || [],
        status: (mapStatusToDb(status) as any) || "VACANT_CLEAN",
        notes: observacao || null,
      },
      include: { category: true, checkins: true },
    });

    return NextResponse.json({ success: true, room: formatRoom(created) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/reservations/rooms] Erro ao criar quarto:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH /api/reservations/rooms — atualiza um apartamento existente no banco de dados (Prisma & Supabase)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      roomNumber,
      roomId,
      id,
      tenantId,
      status,
      notes,
      observacao,
      active,
      numero,
      categoria,
      andar,
      bloco,
      camasCasal,
      camasSolteiro,
      caracteristicas,
      photos,
    } = body;

    const target = String(id || roomId || roomNumber || "");

    if (!target) {
      return NextResponse.json({ success: false, error: "ID ou número do quarto é obrigatório." }, { status: 400 });
    }

    const data: Record<string, unknown> = {};
    const mappedStatus = mapStatusToDb(status);
    if (mappedStatus) data.status = mappedStatus;
    if (notes !== undefined) data.notes = notes;
    else if (observacao !== undefined) data.notes = observacao;
    if (active !== undefined) data.active = active;
    if (numero !== undefined) data.number = numero;
    if (andar !== undefined) data.floor = andar;
    if (bloco !== undefined) data.bloco = bloco;
    if (camasCasal !== undefined) data.camasCasal = camasCasal;
    if (camasSolteiro !== undefined) data.camasSolteiro = camasSolteiro;
    if (caracteristicas !== undefined) data.caracteristicas = caracteristicas;
    if (photos !== undefined) data.photos = photos;
    if (categoria !== undefined) {
      data.categoryId = await resolveCategoryId(tenantId || DEFAULT_TENANT_ID, categoria);
    }

    // 1. Atualizar no Prisma
    const updated = await withDbRetry(() =>
      prisma.room.updateMany({
        where: {
          OR: [
            { number: target },
            { id: target },
          ],
        },
        data,
      })
    );

    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: `Quarto ${target} não encontrado.` }, { status: 404 });
    }

    // 2. Fallback / Sincronizar via Supabase Admin
    try {
      await supabaseAdmin
        .from("rooms")
        .update(data)
        .or(`number.eq.${target},id.eq.${target}`);
    } catch (sbErr) {
      console.warn("[PATCH /api/reservations/rooms] Supabase sync notice:", sbErr);
    }

    const room = await withDbRetry(() =>
      prisma.room.findFirst({
        where: { OR: [{ number: target }, { id: target }] },
        include: { category: true, checkins: true },
      })
    );

    if (mappedStatus) {
      const session = await getSessionUser(req);
      await logActivity({
        tenantId: tenantId || DEFAULT_TENANT_ID,
        userId: session?.userId,
        userName: session?.name,
        action: "ROOM_STATUS_CHANGE",
        description: `${session?.name || "Usuário"} alterou o status do quarto ${target} para ${mappedStatus}.`,
        entityType: "ROOM",
        entityId: room?.id || target,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
    }

    return NextResponse.json({
      success: true,
      message: `Quarto ${target} atualizado com sucesso.`,
      count: updated.count,
      room: room ? formatRoom(room) : null,
    });
  } catch (error: any) {
    console.error("[PATCH /api/reservations/rooms] Erro ao atualizar status do quarto:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/reservations/rooms — exclui um apartamento do banco de dados (restrito a administradores)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");

    if (!id) {
      const body = await req.json().catch(() => null);
      id = body?.id || body?.roomId || null;
    }

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do quarto é obrigatório." }, { status: 400 });
    }

    let deleted;
    try {
      deleted = await prisma.room.deleteMany({ where: { id } });
    } catch (dbErr: any) {
      if (dbErr?.code === "P2003") {
        return NextResponse.json(
          { success: false, error: "Não é possível excluir: este quarto possui reservas ou hospedagens vinculadas." },
          { status: 409 }
        );
      }
      throw dbErr;
    }

    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: `Quarto ${id} não encontrado.` }, { status: 404 });
    }

    try {
      await supabaseAdmin.from("rooms").delete().eq("id", id);
    } catch (sbErr) {
      console.warn("[DELETE /api/reservations/rooms] Supabase sync notice:", sbErr);
    }

    await logActivity({
      tenantId: DEFAULT_TENANT_ID,
      userId: session!.userId,
      userName: session!.name,
      action: "ROOM_DELETE",
      description: `${session!.name} excluiu o quarto ${id}.`,
      entityType: "ROOM",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, message: `Quarto excluído com sucesso.` });
  } catch (error: any) {
    console.error("[DELETE /api/reservations/rooms] Erro ao excluir quarto:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

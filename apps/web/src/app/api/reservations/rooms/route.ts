import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/reservations/rooms — lista todos os quartos com categoria do banco
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const reqTenantId = searchParams.get("tenantId");

    const tenantIdsToSearch = reqTenantId 
      ? [reqTenantId, DEFAULT_TENANT_ID, "TNT-01"]
      : [DEFAULT_TENANT_ID, "TNT-01"];

    const rooms = await prisma.room.findMany({
      where: {
        tenantId: { in: tenantIdsToSearch },
      },
      include: {
        category: true,
      },
      orderBy: {
        number: "asc",
      },
    });

    if (!rooms || rooms.length === 0) {
      // Se não encontrar por tenantId, buscar todos os quartos cadastrados no banco
      const allRooms = await prisma.room.findMany({
        include: { category: true },
        orderBy: { number: "asc" },
      });

      const formatted = allRooms.map((r) => ({
        id: r.id,
        number: r.number,
        floor: r.floor || "Térreo",
        status: r.status,
        notes: r.notes || "",
        categoryId: r.categoryId,
        category: r.category.name,
        ratePerNight: Number(r.category.dailyPrice),
        capacity: r.category.capacity,
        room_categories: {
          id: r.category.id,
          name: r.category.name,
          description: r.category.description || r.category.name,
        },
      }));

      return NextResponse.json({ success: true, rooms: formatted });
    }

    const formatted = rooms.map((r) => ({
      id: r.id,
      number: r.number,
      floor: r.floor || "Térreo",
      status: r.status,
      notes: r.notes || "",
      categoryId: r.categoryId,
      category: r.category.name,
      ratePerNight: Number(r.category.dailyPrice),
      capacity: r.category.capacity,
      room_categories: {
        id: r.category.id,
        name: r.category.name,
        description: r.category.description || r.category.name,
      },
    }));

    return NextResponse.json({ success: true, rooms: formatted });
  } catch (error: any) {
    console.error("[GET /api/reservations/rooms] Erro ao buscar quartos do Prisma:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}



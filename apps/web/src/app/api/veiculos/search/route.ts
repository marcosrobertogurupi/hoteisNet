import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/veiculos/search?q=...&by=placa|caracteristica
// Busca veículos por placa ou por característica, trazendo o hóspede dono de cada um.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") || "").trim();
    const by = searchParams.get("by") === "caracteristica" ? "caracteristica" : "placa";

    const where: any = { tenantId: session.tenantId };
    if (q) {
      where[by] = { contains: q, mode: "insensitive" };
    }

    const vehicles = await prisma.vehicle.findMany({
      where,
      include: { guest: { select: { id: true, fullName: true } } },
      orderBy: { placa: "asc" },
      take: 200,
    });

    return NextResponse.json({
      success: true,
      vehicles: vehicles.map((v) => ({
        id: v.id,
        placa: v.placa,
        caracteristica: v.caracteristica,
        guestId: v.guest.id,
        guestName: v.guest.fullName,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/veiculos/search] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

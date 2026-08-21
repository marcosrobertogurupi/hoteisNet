import { NextRequest, NextResponse } from "next/server";
import { getHousekeeperSession } from "@/lib/housekeeperAuth";
import { prisma } from "@/lib/prisma";

// GET /api/housekeeping/me — usado pelo app mobile ao abrir, para saber se a governanta já está
// logada (sessão válida) sem pedir WhatsApp/senha de novo.
export async function GET(req: NextRequest) {
  const session = await getHousekeeperSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: "Não autenticado." }, { status: 401 });
  }

  const housekeeper = await prisma.housekeeper.findUnique({
    where: { id: session.housekeeperId },
    select: { id: true, name: true, whatsapp: true, photoUrl: true, active: true },
  });

  if (!housekeeper || !housekeeper.active) {
    return NextResponse.json({ success: false, error: "Governanta não encontrada ou inativa." }, { status: 401 });
  }

  return NextResponse.json({ success: true, housekeeper });
}

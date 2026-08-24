import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/cadastros/saldo-hospede?search=nome+ou+cpf — busca hóspedes por nome/CPF (para o campo
// de busca da tela); GET /api/cadastros/saldo-hospede?guestId=... — devolve o saldo atual e o
// extrato (ledger) completo de um hóspede específico, equivalente a Win_MovHospede.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const guestId = searchParams.get("guestId");
    const search = searchParams.get("search");

    if (guestId) {
      const guest = await prisma.guest.findFirst({ where: { id: guestId, tenantId: session.tenantId } });
      if (!guest) {
        return NextResponse.json({ success: false, error: "Hóspede não encontrado." }, { status: 404 });
      }
      const entries = await prisma.guestBalanceEntry.findMany({
        where: { guestId, tenantId: session.tenantId },
        orderBy: { createdAt: "asc" },
      });
      return NextResponse.json({
        success: true,
        guest: { id: guest.id, fullName: guest.fullName, cpf: guest.cpf, balance: Number(guest.balance) },
        entries,
      });
    }

    if (!search || !search.trim()) {
      return NextResponse.json({ success: true, guests: [] });
    }

    const term = search.trim();
    const guests = await prisma.guest.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [
          { fullName: { contains: term, mode: "insensitive" } },
          { cpf: { contains: term.replace(/\D/g, "") || term } },
        ],
      },
      orderBy: { fullName: "asc" },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      guests: guests.map((g) => ({ id: g.id, fullName: g.fullName, cpf: g.cpf, balance: Number(g.balance) })),
    });
  } catch (error: any) {
    console.error("[GET /api/cadastros/saldo-hospede] Erro ao buscar saldo do hóspede:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

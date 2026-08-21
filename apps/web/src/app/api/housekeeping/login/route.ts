import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import {
  createHousekeeperSessionToken,
  HOUSEKEEPER_SESSION_COOKIE,
  HOUSEKEEPER_SESSION_COOKIE_MAX_AGE,
} from "@/lib/housekeeperAuth";

// POST /api/housekeeping/login — login do app mobile de governança, por WhatsApp + senha
// (a governanta não tem e-mail). Emite cookie de sessão próprio, separado do login administrativo.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { whatsapp, password } = body;

    if (!whatsapp?.trim() || !password?.trim()) {
      return NextResponse.json({ success: false, error: "WhatsApp e senha são obrigatórios." }, { status: 400 });
    }

    const housekeeper = await prisma.housekeeper.findFirst({
      where: { whatsapp: whatsapp.trim() },
    });

    if (!housekeeper || !housekeeper.active) {
      return NextResponse.json({ success: false, error: "WhatsApp ou senha inválidos." }, { status: 401 });
    }

    const validPassword = await verifyPassword(password, housekeeper.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ success: false, error: "WhatsApp ou senha inválidos." }, { status: 401 });
    }

    const token = await createHousekeeperSessionToken({
      housekeeperId: housekeeper.id,
      tenantId: housekeeper.tenantId,
      name: housekeeper.name,
      whatsapp: housekeeper.whatsapp,
    });

    const res = NextResponse.json({
      success: true,
      housekeeper: { id: housekeeper.id, name: housekeeper.name, whatsapp: housekeeper.whatsapp, photoUrl: housekeeper.photoUrl },
    });

    res.cookies.set(HOUSEKEEPER_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: HOUSEKEEPER_SESSION_COOKIE_MAX_AGE,
    });

    return res;
  } catch (error: any) {
    console.error("[POST /api/housekeeping/login] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao autenticar." }, { status: 500 });
  }
}

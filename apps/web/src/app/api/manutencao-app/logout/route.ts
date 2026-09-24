import { NextResponse } from "next/server";
import { MAINTENANCE_SESSION_COOKIE } from "@/lib/maintenanceAuth";

// POST /api/manutencao-app/logout — encerra a sessão do app de manutenção.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(MAINTENANCE_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

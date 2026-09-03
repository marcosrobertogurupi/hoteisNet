import { NextResponse } from "next/server";
import { STOCK_COUNT_SESSION_COOKIE } from "@/lib/stockCountAuth";

// POST /api/stock-count/logout — encerra a sessão do app de contagem de estoque.
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(STOCK_COUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

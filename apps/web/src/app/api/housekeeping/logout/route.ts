import { NextResponse } from "next/server";
import { HOUSEKEEPER_SESSION_COOKIE } from "@/lib/housekeeperAuth";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(HOUSEKEEPER_SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

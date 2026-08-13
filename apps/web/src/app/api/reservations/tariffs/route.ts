import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabaseClient";

// GET /api/reservations/tariffs — lista todas as tarifas ativas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "TNT-01";

    const { data: tariffs, error } = await supabaseAdmin
      .from("tariffs")
      .select("id, name, adults, price, active")
      .eq("tenantId", tenantId)
      .eq("active", true)
      .order("name");

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, tariffs: tariffs || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

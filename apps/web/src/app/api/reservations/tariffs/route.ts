import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabaseClient";
import { getSessionUser } from "@/lib/auth";

// GET /api/reservations/tariffs — lista as tarifas ativas do tenant da sessão
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

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

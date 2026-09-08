import { NextRequest, NextResponse } from "next/server";
import { getImpersonation } from "@/lib/platformAuth";

// GET /api/auth/impersonation — o app do assinante consulta isto para saber se a sessão atual é
// uma personificação da equipe da plataforma ("entrar como assinante") e mostrar o banner de aviso
// no topo. Sem personificação, devolve { impersonating: false }.
export async function GET(req: NextRequest) {
  const imp = await getImpersonation(req);
  return NextResponse.json({
    success: true,
    impersonating: !!imp,
    actorName: imp?.actorName ?? null,
    tenantName: imp?.tenantName ?? null,
  });
}

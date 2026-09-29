import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { runDailyRolloverCatchUp } from "@/lib/dailyRollover";

// POST /api/stay/rollover
// Chamado a cada minuto por cada terminal com o Mapa de Quartos aberto (e ao abrir "Alterar
// Período"): lança as diárias que faltam nas hospedagens abertas DO PRÓPRIO HOTEL cujo horário de
// virada (Tenant.dailyRolloverTime) já passou. É a rede de segurança imediata para quando o worker
// da Railway está fora do ar — ver lib/dailyRollover.ts.
//
// Enxuto por construção: a consulta traz só as hospedagens pendentes de virada; no ciclo normal
// (worker em dia) volta vazia, sem baixar as hospedagens abertas a cada minuto × terminal.
// O horário de virada NUNCA vem do cliente, e o tenant vem só da sessão.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const launches = await runDailyRolloverCatchUp({ tenantId: session.tenantId });
    const rolledOver = launches.map((l) => ({
      roomNumber: l.roomNumber,
      daysAdded: l.daysAdded,
      amountAdded: l.amountAdded,
    }));

    return NextResponse.json({ success: true, rolledOver });
  } catch (error: any) {
    console.error("[POST /api/stay/rollover] Erro:", error);
    return NextResponse.json(
      { success: false, error: "Erro ao verificar diárias vencidas." },
      { status: 500 }
    );
  }
}

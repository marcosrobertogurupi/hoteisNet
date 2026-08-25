import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { transmitFnrhRecord } from "@/lib/snrhosClient";

// POST /api/tenant/fnrh/:id/send — dispara manualmente a transmissão de uma ficha FNRH pendente ao
// SNRHos. Chamado pela tela Tarefas administrativas > Controle de FNRH, tanto no envio individual
// quanto, em sequência no cliente, no envio em lote por período. tenantId vem só da sessão;
// transmitFnrhRecord revalida que a ficha pertence a esse tenant antes de transmitir.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const result = await transmitFnrhRecord(session.tenantId, id);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/tenant/fnrh/:id/send] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao transmitir a ficha." }, { status: 500 });
  }
}

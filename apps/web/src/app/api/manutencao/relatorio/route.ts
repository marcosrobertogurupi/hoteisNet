import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { parseBrasiliaDateTime } from "@/lib/brasiliaDate";
import { buildMaintenanceReport } from "@/lib/maintenanceReport";

const MAX_RANGE_DAYS = 366;

// GET /api/manutencao/relatorio?de=AAAA-MM-DD&ate=AAAA-MM-DD — relatório de tempo inativo dos
// quartos por manutenção (OS com entrada no período). Regras em lib/maintenanceReport.ts.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const sp = req.nextUrl.searchParams;
    const ate = sp.get("ate") ? parseBrasiliaDateTime(sp.get("ate"), "23:59") : new Date();
    const de = sp.get("de") ? parseBrasiliaDateTime(sp.get("de"), "00:00") : new Date(ate.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(de.getTime()) || isNaN(ate.getTime()) || de > ate) {
      return NextResponse.json({ success: false, error: "Período inválido." }, { status: 400 });
    }
    if (ate.getTime() - de.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
      return NextResponse.json({ success: false, error: "Escolha um período de até 1 ano." }, { status: 400 });
    }
    const ateFim = new Date(ate.getTime() + 59_999);

    const report = await buildMaintenanceReport(tenantId, de, ateFim);
    return NextResponse.json({ success: true, ...report });
  } catch (error: any) {
    console.error("[GET /api/manutencao/relatorio] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao montar o relatório." }, { status: 500 });
  }
}

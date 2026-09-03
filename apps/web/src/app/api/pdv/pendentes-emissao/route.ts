import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/pdv/pendentes-emissao — comandas fechadas que ainda não têm cupom autorizado
// (AGUARDANDO_FISCAL ou FISCAL_REJEITADA), com o tempo de espera. A partir de 24 h o item é
// marcado como "emissão vencida" (prazo alinhado com o contador). Janela: últimos 7 dias.
const VENCIDA_HORAS = 24;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const desde = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await prisma.comandaSession.findMany({
      where: {
        tenantId: session.tenantId,
        status: { in: ["AGUARDANDO_FISCAL", "FISCAL_REJEITADA"] },
        closedAt: { gte: desde },
      },
      orderBy: { closedAt: "asc" },
      select: {
        id: true,
        status: true,
        total: true,
        closedAt: true,
        customerType: true,
        customerName: true,
        comanda: { select: { number: true } },
        terminal: { select: { name: true } },
        stayCheckin: { select: { room: { select: { number: true } } } },
        fiscalDocuments: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, status: true, series: true, number: true, rejectionReason: true },
        },
      },
    });

    const agora = Date.now();
    const itens = sessions.map((s) => {
      const horas = s.closedAt ? (agora - new Date(s.closedAt).getTime()) / 3_600_000 : 0;
      const doc = s.fiscalDocuments[0] ?? null;
      return {
        atendimentoId: s.id,
        comanda: s.comanda.number,
        caixa: s.terminal.name,
        cliente:
          s.customerType === "HOSPEDE"
            ? `Quarto ${s.stayCheckin?.room?.number ?? "—"}`
            : s.customerName || "Passante",
        total: Number(s.total),
        status: s.status,
        fechadaEm: s.closedAt,
        horasEspera: Math.floor(horas),
        vencida: horas >= VENCIDA_HORAS,
        documento: doc
          ? {
              id: doc.id,
              status: doc.status,
              numero: doc.number,
              serie: doc.series,
              motivoRejeicao: doc.rejectionReason,
              emFila: doc.status === "PENDENTE" || doc.status === "PROCESSANDO",
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, itens, prazoVencidaHoras: VENCIDA_HORAS });
  } catch (error: any) {
    console.error("[GET /api/pdv/pendentes-emissao] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

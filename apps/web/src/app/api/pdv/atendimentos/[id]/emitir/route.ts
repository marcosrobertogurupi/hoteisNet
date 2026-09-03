import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { loadSession, serializeSession } from "@/lib/pdvSession";

// POST /api/pdv/atendimentos/[id]/emitir — coloca a comanda fechada na fila de emissão de NFC-e:
// reserva o próximo número da série do caixa (incremento atômico) e cria um FiscalDocument
// PENDENTE que o agente daquele caixa vai puxar. Disparo manual do operador.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;

    const s = await loadSession(id, session.tenantId);
    if (!s) return NextResponse.json({ success: false, error: "Atendimento não encontrado." }, { status: 404 });
    if (!["AGUARDANDO_FISCAL", "FISCAL_REJEITADA"].includes(s.status)) {
      return NextResponse.json({ success: false, error: "A comanda precisa estar fechada e sem cupom autorizado." }, { status: 409 });
    }

    // Se já existe um documento em andamento, não cria outro.
    const emAndamento = await prisma.fiscalDocument.findFirst({
      where: { comandaSessionId: id, status: { in: ["PENDENTE", "PROCESSANDO"] } },
      select: { id: true },
    });
    if (emAndamento) {
      return NextResponse.json({ success: true, jaEnfileirado: true, fiscalDocumentId: emAndamento.id });
    }

    const config = await prisma.fiscalConfig.findUnique({
      where: { tenantId: session.tenantId },
      select: { environment: true, nfceCscId: true, nfceCsc: true },
    });
    if (!config?.nfceCscId || !config.nfceCsc) {
      return NextResponse.json({ success: false, error: "Configure o CSC da NFC-e em Fiscal & PDV → Configuração." }, { status: 400 });
    }

    const terminal = await prisma.pdvTerminal.findFirst({
      where: { comandaSessions: { some: { id } }, tenantId: session.tenantId },
      select: { id: true, nfceSeries: true },
    });
    if (!terminal) return NextResponse.json({ success: false, error: "Caixa do atendimento não encontrado." }, { status: 404 });

    const doc = await txWithRetry(async (tx) => {
      // Incremento atômico da numeração (modelo 65 + série do caixa).
      const seq = await tx.fiscalSequence.upsert({
        where: { tenantId_model_series: { tenantId: session.tenantId!, model: "NFCE", series: terminal.nfceSeries } },
        create: { tenantId: session.tenantId!, model: "NFCE", series: terminal.nfceSeries, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
        select: { nextNumber: true },
      });
      const numero = seq.nextNumber - 1;

      return tx.fiscalDocument.create({
        data: {
          tenantId: session.tenantId!,
          comandaSessionId: id,
          terminalId: terminal.id,
          model: "NFCE",
          series: terminal.nfceSeries,
          number: numero,
          environment: config.environment,
          status: "PENDENTE",
        },
        select: { id: true, number: true, series: true },
      });
    });

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "PDV_NFCE_ENFILEIRAR",
      description: `${session.name} enviou a comanda ${s.comanda.number} para emissão de NFC-e (${doc.series}/${doc.number}).`,
      entityType: "FISCAL_DOCUMENT",
      entityId: doc.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const updated = await loadSession(id, session.tenantId);
    return NextResponse.json({ success: true, fiscalDocumentId: doc.id, atendimento: updated ? serializeSession(updated) : null });
  } catch (error: any) {
    console.error("[POST /api/pdv/atendimentos/[id]/emitir] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

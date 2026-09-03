import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAgentContext } from "@/lib/agentAuth";
import { buildNfcePayload, SESSION_FOR_PAYLOAD_SELECT, FiscalPayloadError } from "@/lib/fiscal/nfcePayload";

// GET /api/pdv/agente/pendentes — o agente fiscal do caixa busca os documentos que precisa
// emitir. Autenticado pelo token do caixa (Bearer). Devolve cada FiscalDocument PENDENTE do
// caixa com o payload fiscal já montado. Só NFC-e (modelo 65) passa pelo agente.
export async function GET(req: NextRequest) {
  const ctx = await getAgentContext(req);
  if (!ctx) return NextResponse.json({ success: false, error: "Token do caixa inválido." }, { status: 401 });

  try {
    const docs = await prisma.fiscalDocument.findMany({
      where: { terminalId: ctx.terminalId, tenantId: ctx.tenantId, model: "NFCE", status: "PENDENTE" },
      orderBy: { createdAt: "asc" },
      take: 20,
      select: {
        id: true,
        series: true,
        number: true,
        comandaSessionId: true,
        comandaSession: { select: { ...SESSION_FOR_PAYLOAD_SELECT, comanda: { select: { number: true } } } },
      },
    });

    const pendentes: Array<Record<string, unknown>> = [];
    for (const d of docs) {
      if (!d.comandaSession) continue;
      try {
        const payload = await buildNfcePayload({
          tenantId: ctx.tenantId,
          session: d.comandaSession,
          serie: d.series,
          numero: d.number,
        });
        pendentes.push({ fiscalDocumentId: d.id, comanda: d.comandaSession.comanda.number, payload });
      } catch (e) {
        // Payload inválido (config incompleta, item sem NCM...): marca o documento como rejeitado
        // com o motivo, para o operador ver na tela em vez de o agente ficar tentando para sempre.
        const motivo = e instanceof FiscalPayloadError ? e.message : "Falha ao montar o payload fiscal.";
        await prisma.fiscalDocument.update({ where: { id: d.id }, data: { status: "REJEITADA", rejectionReason: motivo } });
        await prisma.comandaSession.updateMany({
          where: { id: d.comandaSessionId!, tenantId: ctx.tenantId },
          data: { status: "FISCAL_REJEITADA" },
        });
      }
    }

    return NextResponse.json({ success: true, pendentes });
  } catch (error: any) {
    console.error("[GET /api/pdv/agente/pendentes] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

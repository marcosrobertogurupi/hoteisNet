import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { logActivity } from "@/lib/audit";
import { getAgentContext } from "@/lib/agentAuth";
import { uploadFiscalFile } from "@/lib/fiscalStorage";

// POST /api/pdv/agente/documentos/[docId] — o agente devolve o resultado da transmissão de uma
// NFC-e à SEFAZ. Autenticado pelo token do caixa. Body:
//  { status: "AUTORIZADA" | "REJEITADA" | "DENEGADA", chave?, protocolo?, xmlBase64?,
//    danfeBase64?, qrCodeData?, motivoRejeicao? }
export async function POST(req: NextRequest, { params }: { params: Promise<{ docId: string }> }) {
  const ctx = await getAgentContext(req);
  if (!ctx) return NextResponse.json({ success: false, error: "Token do caixa inválido." }, { status: 401 });

  try {
    const { docId } = await params;
    const body = await req.json();
    const status = String(body.status || "").toUpperCase();
    if (!["AUTORIZADA", "REJEITADA", "DENEGADA"].includes(status)) {
      return NextResponse.json({ success: false, error: "status inválido." }, { status: 400 });
    }

    const doc = await prisma.fiscalDocument.findFirst({
      where: { id: docId, terminalId: ctx.terminalId, tenantId: ctx.tenantId },
      select: { id: true, comandaSessionId: true, series: true, number: true, status: true },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Documento não encontrado." }, { status: 404 });
    if (["AUTORIZADA", "CANCELADA"].includes(doc.status)) {
      return NextResponse.json({ success: true, jaFinalizado: true });
    }

    let xmlPath: string | null = null;
    let danfePath: string | null = null;
    if (status === "AUTORIZADA") {
      const base = `nfce-${doc.series}-${doc.number}-${doc.id.slice(0, 8)}`;
      if (typeof body.xmlBase64 === "string" && body.xmlBase64) {
        xmlPath = await uploadFiscalFile({
          tenantId: ctx.tenantId,
          fileName: `${base}.xml`,
          content: Buffer.from(body.xmlBase64, "base64"),
          contentType: "application/xml",
        });
      }
      if (typeof body.danfeBase64 === "string" && body.danfeBase64) {
        danfePath = await uploadFiscalFile({
          tenantId: ctx.tenantId,
          fileName: `${base}.pdf`,
          content: Buffer.from(body.danfeBase64, "base64"),
          contentType: "application/pdf",
        });
      }
    }

    const autorizada = status === "AUTORIZADA";

    await txWithRetry(async (tx) => {
      await tx.fiscalDocument.update({
        where: { id: doc.id },
        data: {
          status: autorizada ? "AUTORIZADA" : status === "DENEGADA" ? "DENEGADA" : "REJEITADA",
          accessKey: body.chave ? String(body.chave).replace(/\D/g, "") : null,
          protocol: body.protocolo ? String(body.protocolo) : null,
          authorizedAt: autorizada ? new Date() : null,
          issuedAt: autorizada ? new Date() : null,
          rejectionReason: autorizada ? null : String(body.motivoRejeicao || "Rejeitada pela SEFAZ."),
          qrCodeData: body.qrCodeData ? String(body.qrCodeData) : null,
          xmlPath,
          danfePath,
        },
      });
      if (doc.comandaSessionId) {
        await tx.comandaSession.updateMany({
          where: { id: doc.comandaSessionId, tenantId: ctx.tenantId },
          data: { status: autorizada ? "FISCAL_AUTORIZADA" : "FISCAL_REJEITADA" },
        });
      }
    });

    await logActivity({
      tenantId: ctx.tenantId,
      userName: `Agente fiscal (${ctx.terminalName})`,
      action: autorizada ? "PDV_NFCE_AUTORIZADA" : "PDV_NFCE_REJEITADA",
      description: autorizada
        ? `NFC-e ${doc.series}/${doc.number} autorizada (chave ${body.chave || "—"}).`
        : `NFC-e ${doc.series}/${doc.number} ${status.toLowerCase()}: ${body.motivoRejeicao || "—"}`,
      entityType: "FISCAL_DOCUMENT",
      entityId: doc.id,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/pdv/agente/documentos/[docId]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

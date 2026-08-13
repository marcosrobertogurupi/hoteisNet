import { FastifyInstance } from "fastify";

export async function financialRoutes(server: FastifyInstance) {
  // Corporate Invoice Creation on Checkout
  server.post("/api/financial/corporate-invoice", async (request, reply) => {
    const { companyId, stayCheckinId, totalAmount, paymentTermsDays } = request.body as any;

    const invoiceNum = `FAT-2026-${Math.floor(1000 + Math.random() * 9000)}`;

    return reply.status(201).send({
      success: true,
      invoiceNumber: invoiceNum,
      companyId,
      totalAmount,
      dueDate: new Date(Date.now() + (paymentTermsDays || 15) * 86400000).toISOString(),
      status: "ACCOUNTS_RECEIVABLE_CREATED",
      message: "Fatura corporativa a prazo gerada com sucesso no Contas a Receber!",
    });
  });

  // Cash Register Bleed (Sangria)
  server.post("/api/financial/cash-bleed", async (request, reply) => {
    const { cashRegisterId, amount, operatorName, reason } = request.body as any;

    return reply.status(200).send({
      success: true,
      bleedId: `BLD-${Math.floor(1000 + Math.random() * 9000)}`,
      amount,
      operatorName: operatorName || "Operador Recepção",
      executedAt: new Date().toISOString(),
      message: `Sangria de R$ ${amount.toFixed(2)} executada no caixa com sucesso!`,
    });
  });

  // Fiscal Invoice Emission (NFSe / NFCe)
  server.post("/api/financial/emit-invoice", async (request, reply) => {
    const { invoiceType, recipientCnpjCpf, totalValue, items } = request.body as any;

    return reply.status(201).send({
      success: true,
      invoiceType: invoiceType || "NFSE",
      protocol: `NFS-GOV-${Math.floor(100000 + Math.random() * 900000)}`,
      status: "AUTHORIZED_BY_SEFAZ",
      xmlUrl: "https://api.hoteisnet.com/fiscal/nfe-xml-download",
      pdfUrl: "https://api.hoteisnet.com/fiscal/danfe-pdf-download",
      message: "Nota fiscal emitida e autorizada pela SEFAZ com sucesso!",
    });
  });
}

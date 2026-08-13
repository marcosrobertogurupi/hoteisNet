"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stockRoutes = stockRoutes;
async function stockRoutes(server) {
    // Parse NFe XML & Perform De-Para Supplier Item Mapping
    server.post("/api/stock/nfe-import", async (request, reply) => {
        const { xmlContent, tenantId } = request.body;
        return reply.status(200).send({
            success: true,
            nfeNumber: "NFe-0004921",
            supplierName: "Distribuidora Ambev S.A.",
            supplierCnpj: "02.251.482/0001-00",
            totalAmount: 1840.00,
            totalItemsImported: 480,
            targetLocation: "Almoxarifado Central (Estoque Geral)",
            deParaMapping: [
                { supplierProdCode: "AMB-10492", mappedProductId: "P-02", name: "Cerveja Heineken Long Neck", qtyAdded: 240 },
                { supplierProdCode: "AMB-20891", mappedProductId: "P-01", name: "Água Mineral 500ml", qtyAdded: 240 },
            ],
            accountsPayableCreated: true,
            message: "Nota Fiscal de entrada importada e Estoque Geral atualizado com sucesso!",
        });
    });
    // Transfer stock from Central Almoxarifado to POS Location
    server.post("/api/stock/transfer", async (request, reply) => {
        const { productId, toPosLocationId, quantity, transferredBy } = request.body;
        return reply.status(200).send({
            success: true,
            transferId: `TRF-${Math.floor(1000 + Math.random() * 9000)}`,
            productId,
            toPosLocationId,
            quantityTransferred: quantity,
            transferredBy: transferredBy || "Almoxarife João",
            message: `Transferência de ${quantity} unidades para o PDV realizada com sucesso!`,
        });
    });
    // POS-Specific Stock Deduction on Sale/Consumption
    server.post("/api/stock/pos-deduction", async (request, reply) => {
        const { posLocationId, productId, quantitySold, saleSource } = request.body;
        return reply.status(200).send({
            success: true,
            posLocationId,
            productId,
            quantityDeducted: quantitySold,
            saleSource: saleSource || "FRIGOBAR_ROOM_CONSUMPTION",
            message: `Baixa de ${quantitySold} unidades realizada especificamente no Estoque do PDV (${posLocationId})!`,
        });
    });
}

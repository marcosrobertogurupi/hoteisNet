"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tariffRoutes = tariffRoutes;
// Initial mock dataset matching Print 3
let MOCK_TARIFFS = [
    { id: "TAR-001", name: "APTO LUXO INDIVIDUAL", adults: 1, price: 190.00 },
    { id: "TAR-002", name: "APTO LUXO DUPLO", adults: 2, price: 260.00 },
    { id: "TAR-003", name: "APTO ESPECIAL INDIVIDUAL", adults: 1, price: 170.00 },
    { id: "TAR-004", name: "APTO ESPECIAL DUPLO", adults: 2, price: 230.00 },
    { id: "TAR-005", name: "APTO STANDAR INDIVIDUAL", adults: 1, price: 150.00 },
    { id: "TAR-006", name: "APTO STANDAR DUPLO", adults: 2, price: 210.00 },
    { id: "TAR-007", name: "SUITE MASTER", adults: 2, price: 520.00 },
    { id: "TAR-008", name: "REPRESENTANTE", adults: 1, price: 140.00 },
    { id: "TAR-009", name: "APTO LUXO TRIPLO", adults: 3, price: 310.00 },
    { id: "TAR-010", name: "APTO ESPECIAL TRIPLO", adults: 3, price: 280.00 },
];
async function tariffRoutes(server) {
    // GET /api/tariffs - List subscriber tariffs
    server.get("/api/tariffs", async () => {
        return {
            success: true,
            tariffs: MOCK_TARIFFS,
        };
    });
    // POST /api/tariffs - Create new subscriber tariff
    server.post("/api/tariffs", async (request, reply) => {
        const { name, adults, price } = request.body;
        if (!name || !price) {
            return reply.status(400).send({
                success: false,
                message: "Nome da tarifa e Valor do apartamento são obrigatórios.",
            });
        }
        const newTariff = {
            id: `TAR-${Math.floor(1000 + Math.random() * 9000)}`,
            name: String(name).trim().toUpperCase(),
            adults: Number(adults) || 1,
            price: Number(price),
        };
        MOCK_TARIFFS.push(newTariff);
        return reply.status(201).send({
            success: true,
            tariff: newTariff,
            message: `Tarifa '${newTariff.name}' cadastrada com sucesso!`,
        });
    });
    // PUT /api/tariffs/:id - Update tariff
    server.put("/api/tariffs/:id", async (request, reply) => {
        const { id } = request.params;
        const { name, adults, price } = request.body;
        const index = MOCK_TARIFFS.findIndex((t) => t.id === id);
        if (index === -1) {
            return reply.status(404).send({
                success: false,
                message: "Tarifa não encontrada.",
            });
        }
        MOCK_TARIFFS[index] = {
            ...MOCK_TARIFFS[index],
            name: name ? String(name).trim().toUpperCase() : MOCK_TARIFFS[index].name,
            adults: adults !== undefined ? Number(adults) : MOCK_TARIFFS[index].adults,
            price: price !== undefined ? Number(price) : MOCK_TARIFFS[index].price,
        };
        return reply.status(200).send({
            success: true,
            tariff: MOCK_TARIFFS[index],
            message: `Tarifa '${MOCK_TARIFFS[index].name}' atualizada com sucesso!`,
        });
    });
    // DELETE /api/tariffs/:id - Delete tariff
    server.delete("/api/tariffs/:id", async (request, reply) => {
        const { id } = request.params;
        const index = MOCK_TARIFFS.findIndex((t) => t.id === id);
        if (index === -1) {
            return reply.status(404).send({
                success: false,
                message: "Tarifa não encontrada.",
            });
        }
        const removed = MOCK_TARIFFS.splice(index, 1)[0];
        return reply.status(200).send({
            success: true,
            removedId: id,
            message: `Tarifa '${removed.name}' excluída com sucesso!`,
        });
    });
}

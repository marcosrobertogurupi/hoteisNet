"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRoutes = adminRoutes;
async function adminRoutes(server) {
    // List all SaaS Tenants
    server.get("/api/admin/tenants", async () => {
        return {
            success: true,
            tenants: [
                {
                    id: "TNT-01",
                    name: "Pousada Sol & Mar",
                    tradeName: "Sol & Mar Búzios",
                    cnpj: "12.345.678/0001-90",
                    cadastur: "19.012345.10.0001-2",
                    city: "Búzios, RJ",
                    plan: "PRO",
                    rooms: 24,
                    maxRooms: 30,
                    status: "ACTIVE",
                    mrr: 490.00,
                    aiTokenUsage: 34200,
                    aiTokenLimit: 50000,
                    aiCostUsd: 1.71,
                    createdAt: "2026-01-15T10:00:00Z",
                },
                {
                    id: "TNT-02",
                    name: "Hotel Praia Azul",
                    tradeName: "Praia Azul Resort",
                    cnpj: "98.765.432/0001-10",
                    cadastur: "29.987654.10.0001-9",
                    city: "Salvador, BA",
                    plan: "ENTERPRISE",
                    rooms: 85,
                    maxRooms: 150,
                    status: "ACTIVE",
                    mrr: 1290.00,
                    aiTokenUsage: 112000,
                    aiTokenLimit: 250000,
                    aiCostUsd: 5.60,
                    createdAt: "2025-11-20T14:30:00Z",
                },
                {
                    id: "TNT-03",
                    name: "Resort Montanha Real",
                    tradeName: "Montanha Real Gramado",
                    cnpj: "45.123.890/0001-33",
                    cadastur: "14.451238.10.0001-5",
                    city: "Gramado, RS",
                    plan: "ENTERPRISE",
                    rooms: 120,
                    maxRooms: 200,
                    status: "ACTIVE",
                    mrr: 1890.00,
                    aiTokenUsage: 185400,
                    aiTokenLimit: 250000,
                    aiCostUsd: 9.27,
                    createdAt: "2025-08-10T09:15:00Z",
                },
                {
                    id: "TNT-04",
                    name: "Pousada Cantinho da Serra",
                    tradeName: "Cantinho da Serra",
                    cnpj: "67.890.123/0001-55",
                    cadastur: "26.678901.10.0001-8",
                    city: "Campos do Jordão, SP",
                    plan: "STARTER",
                    rooms: 12,
                    maxRooms: 15,
                    status: "TRIAL",
                    mrr: 0.00,
                    aiTokenUsage: 4100,
                    aiTokenLimit: 15000,
                    aiCostUsd: 0.20,
                    createdAt: "2026-08-01T16:00:00Z",
                },
                {
                    id: "TNT-05",
                    name: "Hotel Central Executivo",
                    tradeName: "Central Executivo SP",
                    cnpj: "33.444.555/0001-22",
                    cadastur: "33.334445.10.0001-1",
                    city: "São Paulo, SP",
                    plan: "PRO",
                    rooms: 45,
                    maxRooms: 50,
                    status: "OVERDUE",
                    mrr: 690.00,
                    aiTokenUsage: 48900,
                    aiTokenLimit: 50000,
                    aiCostUsd: 2.44,
                    createdAt: "2026-02-10T11:20:00Z",
                },
            ],
        };
    });
    // Create new Tenant (Assinante Onboarding)
    server.post("/api/admin/tenants", async (request, reply) => {
        const body = request.body;
        return reply.status(201).send({
            success: true,
            tenantId: `TNT-${Math.floor(10 + Math.random() * 90)}`,
            message: "Novo hotel assinante cadastrado com sucesso!",
            createdTenant: body,
        });
    });
    // List SaaS Plans
    server.get("/api/admin/plans", async () => {
        return {
            success: true,
            plans: [
                { id: "PLAN-STARTER", name: "Starter", priceMonthly: 290.00, maxRooms: 15, maxUsers: 3, aiTokenQuota: 15000 },
                { id: "PLAN-PRO", name: "Pro", priceMonthly: 490.00, maxRooms: 40, maxUsers: 10, aiTokenQuota: 50000 },
                { id: "PLAN-ENTERPRISE", name: "Enterprise", priceMonthly: 1290.00, maxRooms: 200, maxUsers: 50, aiTokenQuota: 250000 },
            ],
        };
    });
    // AI Usage Telemetry
    server.get("/api/admin/ai-telemetry", async () => {
        return {
            success: true,
            summary: {
                totalTokensThisMonth: 2260000,
                totalCostUsd: 11.30,
                totalRequests: 4460,
                aiAutonomyRate: 0.885, // 88.5% of tickets resolved by AI
            },
            features: [
                { feature: "IA Suporte RAG (Embeddings Supabase)", requests: 1420, tokens: 680000, costUsd: 3.40, status: "HEALTHY" },
                { feature: "Pré-Checkin FNRH Preditivo", requests: 890, tokens: 340000, costUsd: 1.70, status: "HEALTHY" },
                { feature: "Concierge WhatsApp Uazapi", requests: 2150, tokens: 1240000, costUsd: 6.20, status: "HEALTHY" },
            ],
        };
    });
}

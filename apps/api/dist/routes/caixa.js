"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CAIXA_ATIVO = exports.CONTAS_QUARTO = exports.CAIXA_SESSOES = void 0;
exports.caixaRoutes = caixaRoutes;
// In-memory stores
exports.CAIXA_SESSOES = new Map();
exports.CONTAS_QUARTO = new Map();
// Active session per operator
exports.CAIXA_ATIVO = new Map(); // operatorId -> caixaId
// Seed: one open cash session for default operator
const defaultSessao = {
    id: "CX-001",
    operatorId: "USR-001",
    operatorName: "OPERADOR RECEPÇÃO",
    dataAbertura: new Date().toISOString(),
    status: "ABERTO",
    totalEntradas: 0,
    totalSaidas: 0,
    totalSangrias: 0,
    movimentos: [],
};
exports.CAIXA_SESSOES.set("CX-001", defaultSessao);
exports.CAIXA_ATIVO.set("USR-001", "CX-001");
// Helper to format currency
function fmtBRL(val) {
    return `R$ ${val.toFixed(2).replace(".", ",")}`;
}
// Helper to get or create ContaQuarto
function getOrCreateContaQuarto(roomId, stayCheckinId, guestName) {
    const key = `${stayCheckinId}-${roomId}`;
    if (!exports.CONTAS_QUARTO.has(key)) {
        exports.CONTAS_QUARTO.set(key, {
            roomId,
            stayCheckinId,
            guestName,
            lancamentos: [],
            totalDiarias: 0,
            totalPago: 0,
            saldoDevedor: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        });
    }
    return exports.CONTAS_QUARTO.get(key);
}
async function caixaRoutes(server) {
    // -----------------------------------------------------------
    // GET /api/caixa/sessao - Get current open caixa session
    // -----------------------------------------------------------
    server.get("/api/caixa/sessao", async (request, reply) => {
        const { operatorId } = request.query;
        const opId = operatorId || "USR-001";
        const caixaId = exports.CAIXA_ATIVO.get(opId);
        if (!caixaId) {
            return reply.status(404).send({
                success: false,
                message: "Nenhuma sessão de caixa aberta para este operador.",
            });
        }
        const sessao = exports.CAIXA_SESSOES.get(caixaId);
        return reply.send({ success: true, sessao });
    });
    // -----------------------------------------------------------
    // POST /api/caixa/abrir - Open cash register session
    // -----------------------------------------------------------
    server.post("/api/caixa/abrir", async (request, reply) => {
        const { operatorId, operatorName, fundoTroco } = request.body;
        const opId = operatorId || "USR-001";
        const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();
        if (exports.CAIXA_ATIVO.has(opId)) {
            return reply.status(400).send({
                success: false,
                message: "Já existe um caixa aberto para este operador. Feche o caixa anterior antes de abrir um novo.",
            });
        }
        const caixaId = `CX-${Math.floor(1000 + Math.random() * 9000)}`;
        const fundoVal = Number(fundoTroco) || 0;
        const novaSessao = {
            id: caixaId,
            operatorId: opId,
            operatorName: opName,
            dataAbertura: new Date().toISOString(),
            status: "ABERTO",
            totalEntradas: fundoVal,
            totalSaidas: 0,
            totalSangrias: 0,
            movimentos: fundoVal > 0
                ? [{
                        id: `MOV-${Date.now()}`,
                        caixaId,
                        operatorId: opId,
                        operatorName: opName,
                        tipo: "SUPRIMENTO",
                        valor: fundoVal,
                        formaPagamento: "DINHEIRO",
                        descricao: `Abertura do caixa — Fundo de troco: ${fmtBRL(fundoVal)}`,
                        createdAt: new Date().toISOString(),
                    }]
                : [],
        };
        exports.CAIXA_SESSOES.set(caixaId, novaSessao);
        exports.CAIXA_ATIVO.set(opId, caixaId);
        return reply.status(201).send({
            success: true,
            caixaId,
            operatorName: opName,
            dataAbertura: novaSessao.dataAbertura,
            fundoTroco: fundoVal,
            message: `Caixa ${caixaId} aberto com sucesso para ${opName}!`,
        });
    });
    // -----------------------------------------------------------
    // POST /api/caixa/pagamento-checkin - Payment at Check-in
    //   Posts to BOTH: room account + cash register
    // -----------------------------------------------------------
    server.post("/api/caixa/pagamento-checkin", async (request, reply) => {
        const { operatorId, operatorName, roomId, stayCheckinId, guestName, valor, formaPagamento, descricao, } = request.body;
        const opId = operatorId || "USR-001";
        const opName = (operatorName || "OPERADOR RECEPÇÃO").toUpperCase();
        if (!valor || Number(valor) <= 0) {
            return reply.status(400).send({
                success: false,
                message: "Valor do pagamento deve ser maior que zero.",
            });
        }
        if (!roomId || !stayCheckinId) {
            return reply.status(400).send({
                success: false,
                message: "roomId e stayCheckinId são obrigatórios para lançar pagamento.",
            });
        }
        const valorNum = Number(valor);
        const fpg = (formaPagamento || "DINHEIRO").toUpperCase();
        const desc = descricao || `Pagamento de diárias — Quarto ${roomId}`;
        const now = new Date().toISOString();
        const movId = `MOV-${Date.now()}`;
        const lancId = `LAN-${Date.now() + 1}`;
        // ---- 1. Get or open caixa session ----
        let caixaId = exports.CAIXA_ATIVO.get(opId);
        if (!caixaId) {
            // Auto-open a session if none exists
            caixaId = `CX-${Math.floor(1000 + Math.random() * 9000)}`;
            const sessao = {
                id: caixaId,
                operatorId: opId,
                operatorName: opName,
                dataAbertura: now,
                status: "ABERTO",
                totalEntradas: 0,
                totalSaidas: 0,
                totalSangrias: 0,
                movimentos: [],
            };
            exports.CAIXA_SESSOES.set(caixaId, sessao);
            exports.CAIXA_ATIVO.set(opId, caixaId);
        }
        // ---- 2. Post to CAIXA (cash register) ----
        const caixaMovimento = {
            id: movId,
            caixaId,
            operatorId: opId,
            operatorName: opName,
            tipo: "ENTRADA",
            valor: valorNum,
            formaPagamento: fpg,
            descricao: `${desc} (Hóspede: ${guestName || "—"})`,
            roomId,
            stayCheckinId,
            guestName: guestName || "",
            referencia: stayCheckinId,
            createdAt: now,
        };
        const sessao = exports.CAIXA_SESSOES.get(caixaId);
        sessao.movimentos.push(caixaMovimento);
        sessao.totalEntradas += valorNum;
        // ---- 3. Post to CONTA DO QUARTO (room account) ----
        const conta = getOrCreateContaQuarto(roomId, stayCheckinId, guestName || "HÓSPEDE");
        const lancamento = {
            id: lancId,
            data: new Date().toLocaleDateString("pt-BR") + " " + new Date().toLocaleTimeString("pt-BR"),
            descricao: `PAGTO: ${desc}`,
            tipo: "PAGAMENTO",
            valor: -valorNum, // negative = credit / payment
            formaPagamento: fpg,
            caixaMovimentoId: movId,
        };
        conta.lancamentos.push(lancamento);
        conta.totalPago += valorNum;
        conta.saldoDevedor = Math.max(0, conta.totalDiarias - conta.totalPago);
        conta.updatedAt = now;
        return reply.status(201).send({
            success: true,
            movimentoCaixaId: movId,
            lancamentoContaId: lancId,
            caixaId,
            roomId,
            stayCheckinId,
            guestName,
            valor: valorNum,
            formaPagamento: fpg,
            saldoContaQuarto: conta.saldoDevedor,
            totalPago: conta.totalPago,
            message: `Pagamento de ${fmtBRL(valorNum)} (${fpg}) lançado com sucesso na conta do Quarto ${roomId} e no Caixa ${caixaId}!`,
        });
    });
    // -----------------------------------------------------------
    // DELETE /api/caixa/remover-pagamento - Delete Launched Credit/Payment
    // -----------------------------------------------------------
    server.delete("/api/caixa/remover-pagamento", async (request, reply) => {
        const { roomId, stayCheckinId, lancamentoId, caixaMovimentoId, operatorId } = request.body;
        if (!roomId || !stayCheckinId || !lancamentoId) {
            return reply.status(400).send({
                success: false,
                message: "roomId, stayCheckinId e lancamentoId são obrigatórios.",
            });
        }
        const key = `${stayCheckinId}-${roomId}`;
        const conta = exports.CONTAS_QUARTO.get(key);
        if (conta) {
            const idx = conta.lancamentos.findIndex((l) => l.id === lancamentoId);
            if (idx !== -1) {
                const removed = conta.lancamentos[idx];
                conta.lancamentos.splice(idx, 1);
                if (removed.tipo === "PAGAMENTO" || removed.tipo === "ADIANTAMENTO") {
                    const removedVal = Math.abs(removed.valor);
                    conta.totalPago = Math.max(0, conta.totalPago - removedVal);
                    conta.saldoDevedor = Math.max(0, conta.totalDiarias - conta.totalPago);
                }
                conta.updatedAt = new Date().toISOString();
            }
        }
        // Also remove or post reversal in cash register if caixaMovimentoId provided
        const opId = operatorId || "USR-001";
        const caixaId = exports.CAIXA_ATIVO.get(opId);
        if (caixaId && exports.CAIXA_SESSOES.has(caixaId)) {
            const sessao = exports.CAIXA_SESSOES.get(caixaId);
            if (caixaMovimentoId) {
                const movIdx = sessao.movimentos.findIndex((m) => m.id === caixaMovimentoId);
                if (movIdx !== -1) {
                    const mov = sessao.movimentos[movIdx];
                    sessao.totalEntradas = Math.max(0, sessao.totalEntradas - mov.valor);
                    sessao.movimentos.splice(movIdx, 1);
                }
            }
        }
        return reply.send({
            success: true,
            message: `Lançamento ${lancamentoId} removido com sucesso da hospedagem e conferência do caixa!`,
        });
    });
    // -----------------------------------------------------------
    // POST /api/caixa/lancamento-diaria - Post Room Rate to Account
    //   Called when check-in is confirmed to register the total dailies
    // -----------------------------------------------------------
    server.post("/api/caixa/lancamento-diaria", async (request, reply) => {
        const { roomId, stayCheckinId, guestName, totalDiarias, nights, dailyRate, tariffName } = request.body;
        if (!roomId || !stayCheckinId || !totalDiarias) {
            return reply.status(400).send({
                success: false,
                message: "roomId, stayCheckinId e totalDiarias são obrigatórios.",
            });
        }
        const valorNum = Number(totalDiarias);
        const now = new Date();
        const lancId = `LAN-DIA-${Date.now()}`;
        const conta = getOrCreateContaQuarto(roomId, stayCheckinId, guestName || "HÓSPEDE");
        conta.lancamentos.push({
            id: lancId,
            data: now.toLocaleDateString("pt-BR") + " " + now.toLocaleTimeString("pt-BR"),
            descricao: `DIÁRIAS: ${nights || "?"} × ${fmtBRL(Number(dailyRate) || 0)} — ${tariffName || "TARIFA"}`,
            tipo: "DIARIA",
            valor: valorNum,
        });
        conta.totalDiarias += valorNum;
        conta.saldoDevedor = Math.max(0, conta.totalDiarias - conta.totalPago);
        conta.updatedAt = now.toISOString();
        return reply.status(201).send({
            success: true,
            lancamentoId: lancId,
            roomId,
            stayCheckinId,
            totalDiarias: conta.totalDiarias,
            totalPago: conta.totalPago,
            saldoDevedor: conta.saldoDevedor,
            message: `Diárias de ${fmtBRL(valorNum)} lançadas na conta do Quarto ${roomId} com sucesso!`,
        });
    });
    // -----------------------------------------------------------
    // GET /api/caixa/conta-quarto - Get room account balance
    // -----------------------------------------------------------
    server.get("/api/caixa/conta-quarto", async (request, reply) => {
        const { stayCheckinId, roomId } = request.query;
        if (!stayCheckinId || !roomId) {
            return reply.status(400).send({ success: false, message: "stayCheckinId e roomId são obrigatórios." });
        }
        const key = `${stayCheckinId}-${roomId}`;
        const conta = exports.CONTAS_QUARTO.get(key);
        if (!conta) {
            return reply.status(404).send({ success: false, message: "Conta do quarto não encontrada." });
        }
        return reply.send({ success: true, conta });
    });
    // -----------------------------------------------------------
    // GET /api/caixa/movimentos - List caixa movements for session
    // -----------------------------------------------------------
    server.get("/api/caixa/movimentos", async (request, reply) => {
        const { operatorId } = request.query;
        const opId = operatorId || "USR-001";
        const caixaId = exports.CAIXA_ATIVO.get(opId);
        if (!caixaId) {
            return reply.send({ success: true, movimentos: [], totalEntradas: 0 });
        }
        const sessao = exports.CAIXA_SESSOES.get(caixaId);
        return reply.send({
            success: true,
            caixaId,
            status: sessao?.status,
            dataAbertura: sessao?.dataAbertura,
            totalEntradas: sessao?.totalEntradas || 0,
            totalSaidas: sessao?.totalSaidas || 0,
            totalSangrias: sessao?.totalSangrias || 0,
            saldoAtual: (sessao?.totalEntradas || 0) - (sessao?.totalSaidas || 0) - (sessao?.totalSangrias || 0),
            movimentos: sessao?.movimentos || [],
        });
    });
    // -----------------------------------------------------------
    // POST /api/caixa/fechar - Close cash register session
    // -----------------------------------------------------------
    server.post("/api/caixa/fechar", async (request, reply) => {
        const { operatorId, saldoInformado } = request.body;
        const opId = operatorId || "USR-001";
        const caixaId = exports.CAIXA_ATIVO.get(opId);
        if (!caixaId) {
            return reply.status(404).send({ success: false, message: "Nenhum caixa aberto para este operador." });
        }
        const sessao = exports.CAIXA_SESSOES.get(caixaId);
        const saldoCalculado = sessao.totalEntradas - sessao.totalSaidas - sessao.totalSangrias;
        const diferenca = Number(saldoInformado || 0) - saldoCalculado;
        sessao.status = "FECHADO";
        sessao.dataFechamento = new Date().toISOString();
        sessao.saldoFinal = saldoCalculado;
        exports.CAIXA_ATIVO.delete(opId);
        return reply.send({
            success: true,
            caixaId,
            dataFechamento: sessao.dataFechamento,
            totalEntradas: sessao.totalEntradas,
            totalSaidas: sessao.totalSaidas,
            totalSangrias: sessao.totalSangrias,
            saldoCalculado,
            saldoInformado: Number(saldoInformado || 0),
            diferenca,
            status: diferenca === 0 ? "CAIXA_CONFERIDO" : diferenca > 0 ? "SOBRA" : "FALTA",
            message: `Caixa ${caixaId} fechado. Saldo: ${fmtBRL(saldoCalculado)}. ${diferenca !== 0 ? `Diferença: ${fmtBRL(Math.abs(diferenca))} (${diferenca > 0 ? "Sobra" : "Falta"})` : "Caixa conferido sem diferença!"}`,
        });
    });
    // -----------------------------------------------------------
    // POST /api/caixa/sangria - Cash bleed (remove cash from drawer)
    // -----------------------------------------------------------
    server.post("/api/caixa/sangria", async (request, reply) => {
        const { operatorId, operatorName, valor, motivo } = request.body;
        const opId = operatorId || "USR-001";
        const caixaId = exports.CAIXA_ATIVO.get(opId);
        if (!caixaId) {
            return reply.status(404).send({ success: false, message: "Nenhum caixa aberto para este operador." });
        }
        const valorNum = Number(valor);
        if (valorNum <= 0) {
            return reply.status(400).send({ success: false, message: "Valor da sangria deve ser maior que zero." });
        }
        const sessao = exports.CAIXA_SESSOES.get(caixaId);
        const movId = `MOV-SNG-${Date.now()}`;
        const sangriaMovimento = {
            id: movId,
            caixaId,
            operatorId: opId,
            operatorName: (operatorName || "OPERADOR RECEPÇÃO").toUpperCase(),
            tipo: "SANGRIA",
            valor: valorNum,
            formaPagamento: "DINHEIRO",
            descricao: motivo || `Sangria de caixa — ${fmtBRL(valorNum)}`,
            createdAt: new Date().toISOString(),
        };
        sessao.movimentos.push(sangriaMovimento);
        sessao.totalSangrias += valorNum;
        return reply.send({
            success: true,
            sangriaId: movId,
            caixaId,
            valor: valorNum,
            totalSangrias: sessao.totalSangrias,
            message: `Sangria de ${fmtBRL(valorNum)} executada no caixa ${caixaId} com sucesso!`,
        });
    });
}

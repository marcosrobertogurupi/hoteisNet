import type { SessionPayload } from "@/lib/sessionToken";

// Operador dos lançamentos financeiros (caixa, adiantamento, hospedagem) — equivalente ao
// Cai_LanPor / HosP_IDOperador / gIdUsuario do sistema WinDev original.
//
// Regra: o operador é SEMPRE o usuário autenticado da sessão. Antes, cada rota lia `operatorId`
// (e `operatorName`) do corpo da requisição, com fallback para a constante `"USR-001"` — quer dizer
// que um terminal podia mandar qualquer id e lançar pagamentos (ou empurrar quebra/estorno) no
// caixa aberto de OUTRO operador do mesmo hotel, sem nenhuma checagem (o `operatorId` é um id
// estrangeiro nunca revalidado — ver regra 4 do CLAUDE.md). O `OperatorContext` do front já
// definia o operador ativo como o próprio usuário logado (`app/layout.tsx`), então derivar da
// sessão no servidor é a fonte de verdade correta, não uma regressão.
//
// Se um dia existir "trocar operador de caixa" (um caixa operado por terceiro sob a supervisão de
// outro login), isso precisa de um fluxo de autorização próprio — não de um campo livre no body.
export function resolveOperator(session: SessionPayload): { operatorId: string; operatorName: string } {
  return {
    operatorId: session.userId,
    operatorName: (session.name || "OPERADOR").toUpperCase(),
  };
}

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashTerminalToken } from "@/lib/pdvTerminalToken";

// Autenticação do agente fiscal .NET nas rotas /api/pdv/agente/*. O agente manda
// `Authorization: Bearer <token do caixa>`; resolvemos o PdvTerminal pelo hash SHA-256 do token
// (só o hash fica no banco). Sem sessão de usuário — é um "cliente de máquina" escopado a um
// único caixa de um único tenant. Regenerar o token no cadastro do caixa invalida o anterior
// (o hash antigo deixa de existir).

export type AgentContext = { tenantId: string; terminalId: string; terminalName: string; nfceSeries: number; nfeSeries: number };

export async function getAgentContext(req: NextRequest): Promise<AgentContext | null> {
  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!token || !token.startsWith("pdvt_")) return null;

  const terminal = await prisma.pdvTerminal.findFirst({
    where: { apiTokenHash: hashTerminalToken(token), active: true },
    select: { id: true, name: true, tenantId: true, nfceSeries: true, nfeSeries: true },
  });
  if (!terminal) return null;

  return {
    tenantId: terminal.tenantId,
    terminalId: terminal.id,
    terminalName: terminal.name,
    nfceSeries: terminal.nfceSeries,
    nfeSeries: terminal.nfeSeries,
  };
}

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getHousekeeperSession, type HousekeeperSessionPayload } from "@/lib/housekeeperAuth";

// Lê a sessão do app de governança (cookie JWT) e revalida contra o banco que a governanta ainda
// existe, está ativa e pertence ao mesmo tenant do token — desativar ou excluir a governanta
// derruba a sessão na hora. Mesmo padrão de lib/stockCountSession.ts (app de contagem de estoque).
//
// Sem esta revalidação, `getHousekeeperSession` devolvia o payload assim que o JWT validava: como o
// token dura 16 horas, desativar a governanta, trocar a senha ou removê-la do cadastro não
// invalidava a sessão já emitida (CLAUDE.md, Segurança §9). Route Handlers de /api/housekeeping/**
// devem usar isto no lugar de ler o cookie direto; retorna null quando a sessão não vale mais
// (o handler responde 401).
export async function getHousekeeperUser(req: NextRequest): Promise<HousekeeperSessionPayload | null> {
  const session = await getHousekeeperSession(req);
  if (!session?.housekeeperId || !session.tenantId) return null;

  const housekeeper = await prisma.housekeeper.findFirst({
    where: { id: session.housekeeperId, tenantId: session.tenantId, active: true },
    select: { id: true, name: true },
  });
  if (!housekeeper) return null;

  // O nome vem do cadastro atual, não do que estava no token quando ele foi emitido.
  return { ...session, name: housekeeper.name };
}

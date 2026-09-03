import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStockCountSession, type StockCountSessionPayload } from "@/lib/stockCountAuth";

// Lê a sessão do app de contagem (cookie JWT) e revalida contra o banco que o colaborador ainda
// está ativo e com senha — desativar o colaborador ou tirar a senha derruba a sessão na hora.
// Route Handlers do app de contagem devem usar isto no lugar de ler o cookie direto.
// Retorna null quando a sessão não vale (o handler responde 401).
export async function getStockCountUser(req: NextRequest): Promise<StockCountSessionPayload | null> {
  const session = await getStockCountSession(req);
  if (!session?.employeeId || !session.tenantId) return null;

  const employee = await prisma.employee.findFirst({
    where: { id: session.employeeId, tenantId: session.tenantId, active: true, passwordHash: { not: null } },
    select: { id: true },
  });
  if (!employee) return null;

  return session;
}

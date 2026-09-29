import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET /api/autorizacoes/autorizadores — lista os autorizadores ativos do hotel da sessão, para a
// janela de autorização (o operador escolhe quem autoriza). Só id + nome + se tem WhatsApp.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    where: { tenantId: session.tenantId, active: true, isAuthorizer: true },
    select: { id: true, name: true, phone: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({
    success: true,
    autorizadores: users.map((u) => ({ id: u.id, nome: u.name, temWhatsapp: !!u.phone?.replace(/\D/g, "") })),
  });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole } from "@/lib/auth";

// GET /api/admin/tenants/[id]/users — usuários ativos de um assinante, para o seletor de
// destinatário em Mensagens. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const users = await prisma.user.findMany({
    where: { tenantId: id, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, role: true, phone: true },
  });
  return NextResponse.json({ success: true, users });
}

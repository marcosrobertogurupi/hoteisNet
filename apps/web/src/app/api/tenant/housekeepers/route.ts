import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, hashPassword } from "@/lib/auth";

// GET /api/tenant/housekeepers — lista as governantas cadastradas pelo tenant da sessão,
// usado no cadastro (app/cadastros/governantas) e na tela de atribuição manual de limpeza.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const housekeepers = await prisma.housekeeper.findMany({
      where: { tenantId: resolvedTenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true, whatsapp: true, photoUrl: true, active: true, createdAt: true },
    });

    return NextResponse.json({ success: true, housekeepers });
  } catch (error: any) {
    console.error("[GET /api/tenant/housekeepers] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar governantas." },
      { status: 500 }
    );
  }
}

// POST /api/tenant/housekeepers — cadastra uma nova governanta (nome, WhatsApp, foto e senha de
// acesso ao app mobile de governança).
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId!;

    const body = await req.json();
    const { name, whatsapp, photoUrl, password } = body;

    if (!name?.trim() || !whatsapp?.trim() || !password?.trim()) {
      return NextResponse.json(
        { success: false, error: "Nome, WhatsApp e senha são obrigatórios." },
        { status: 400 }
      );
    }

    const existing = await prisma.housekeeper.findUnique({
      where: { tenantId_whatsapp: { tenantId: resolvedTenantId, whatsapp: whatsapp.trim() } },
    });
    if (existing) {
      return NextResponse.json(
        { success: false, error: "Já existe uma governanta cadastrada com esse WhatsApp." },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password.trim());

    const housekeeper = await prisma.housekeeper.create({
      data: {
        tenantId: resolvedTenantId,
        name: name.trim(),
        whatsapp: whatsapp.trim(),
        photoUrl: photoUrl || null,
        passwordHash,
      },
      select: { id: true, name: true, whatsapp: true, photoUrl: true, active: true, createdAt: true },
    });

    return NextResponse.json({ success: true, housekeeper });
  } catch (error: any) {
    console.error("[POST /api/tenant/housekeepers] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao cadastrar governanta." },
      { status: 500 }
    );
  }
}

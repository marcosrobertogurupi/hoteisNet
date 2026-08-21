import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// PATCH /api/tenant/housekeepers/[id] — edita dados da governanta; senha só é alterada quando
// o campo `password` é enviado preenchido (evita sobrescrever a senha atual com vazio).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { tenantId, name, whatsapp, photoUrl, password, active } = body;

    const resolvedTenantId = await resolveTenantId(tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const housekeeper = await prisma.housekeeper.findFirst({ where: { id, tenantId: resolvedTenantId } });
    if (!housekeeper) {
      return NextResponse.json({ success: false, error: "Governanta não encontrada." }, { status: 404 });
    }

    if (whatsapp?.trim() && whatsapp.trim() !== housekeeper.whatsapp) {
      const existing = await prisma.housekeeper.findUnique({
        where: { tenantId_whatsapp: { tenantId: resolvedTenantId, whatsapp: whatsapp.trim() } },
      });
      if (existing) {
        return NextResponse.json(
          { success: false, error: "Já existe uma governanta cadastrada com esse WhatsApp." },
          { status: 409 }
        );
      }
    }

    const data: Record<string, any> = {};
    if (name !== undefined) data.name = name.trim();
    if (whatsapp !== undefined) data.whatsapp = whatsapp.trim();
    if (photoUrl !== undefined) data.photoUrl = photoUrl || null;
    if (active !== undefined) data.active = !!active;
    if (password?.trim()) data.passwordHash = await hashPassword(password.trim());

    const updated = await prisma.housekeeper.update({
      where: { id },
      data,
      select: { id: true, name: true, whatsapp: true, photoUrl: true, active: true, createdAt: true },
    });

    return NextResponse.json({ success: true, housekeeper: updated });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/housekeepers/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao atualizar governanta." },
      { status: 500 }
    );
  }
}

// DELETE /api/tenant/housekeepers/[id]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const housekeeper = await prisma.housekeeper.findFirst({ where: { id, tenantId: resolvedTenantId } });
    if (!housekeeper) {
      return NextResponse.json({ success: false, error: "Governanta não encontrada." }, { status: 404 });
    }

    await prisma.housekeeper.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/tenant/housekeepers/[id]] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao excluir governanta." },
      { status: 500 }
    );
  }
}

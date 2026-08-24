import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, hashPassword } from "@/lib/auth";

// PATCH /api/tenant/housekeepers/[id] — edita dados da governanta; senha só é alterada quando
// o campo `password` é enviado preenchido (evita sobrescrever a senha atual com vazio). Só admin.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const { id } = await params;
    const body = await req.json();
    const { name, whatsapp, photoUrl, password, active } = body;

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

// DELETE /api/tenant/housekeepers/[id] — só admin.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const { id } = await params;
    const housekeeper = await prisma.housekeeper.findFirst({ where: { id, tenantId: resolvedTenantId } });
    if (!housekeeper) {
      return NextResponse.json({ success: false, error: "Governanta não encontrada." }, { status: 404 });
    }

    // Bloqueia a exclusão com tarefa ativa: sem isso, uma limpeza IN_PROGRESS ficaria órfã
    // (housekeeperId nulo) e o selo "em limpeza" nunca sumiria do Mapa de Quartos/Reservas.
    const activeTask = await prisma.housekeepingTask.findFirst({
      where: { housekeeperId: id, status: { in: ["PENDING", "IN_PROGRESS"] } },
    });
    if (activeTask) {
      return NextResponse.json(
        { success: false, error: "Esta governanta tem uma limpeza pendente ou em andamento. Cancele ou aguarde a conclusão antes de excluir." },
        { status: 409 }
      );
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

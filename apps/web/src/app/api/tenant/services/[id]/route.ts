import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

// PATCH /api/tenant/services/:id — atualiza um serviço existente.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;
    const body = await req.json();
    const { code, description, category, price, active } = body;

    const data: Record<string, any> = {};
    if (code !== undefined) data.code = code || null;
    if (description !== undefined) data.description = description;
    if (category !== undefined) data.category = category || null;
    if (price !== undefined) data.price = price;
    if (active !== undefined) data.active = !!active;

    const service = await prisma.hotelService.update({ where: { id }, data });

    await logActivity({
      tenantId: service.tenantId,
      userId: session?.userId,
      userName: session?.name,
      action: "SERVICE_UPDATE",
      description: `${session?.name || "Usuário"} atualizou o serviço "${service.description}".`,
      entityType: "HOTEL_SERVICE",
      entityId: service.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, service });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/services/:id] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Serviço não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: error.message || "Erro ao atualizar serviço." }, { status: 500 });
  }
}

// DELETE /api/tenant/services/:id — remove um serviço.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;
    const service = await prisma.hotelService.delete({ where: { id } });

    await logActivity({
      tenantId: service.tenantId,
      userId: session?.userId,
      userName: session?.name,
      action: "SERVICE_DELETE",
      description: `${session?.name || "Usuário"} excluiu o serviço "${service.description}".`,
      entityType: "HOTEL_SERVICE",
      entityId: service.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/tenant/services/:id] Erro:", error);
    if (error?.code === "P2025") {
      return NextResponse.json({ success: false, error: "Serviço não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ success: false, error: error.message || "Erro ao excluir serviço." }, { status: 500 });
  }
}

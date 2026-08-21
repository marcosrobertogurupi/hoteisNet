import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

// PUT /api/cadastros/municipios/[id] — restrito a administradores.
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(request);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.municipality.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Município não encontrado." }, { status: 404 });
    }

    if (body.ibgeCode !== undefined && !/^\d{7}$/.test(String(body.ibgeCode).trim())) {
      return NextResponse.json({ success: false, error: "Código IBGE deve ter 7 dígitos." }, { status: 400 });
    }
    if (body.uf !== undefined && !/^[A-Z]{2}$/.test(String(body.uf).trim().toUpperCase())) {
      return NextResponse.json({ success: false, error: "UF inválida (use a sigla de 2 letras)." }, { status: 400 });
    }

    const municipality = await prisma.municipality.update({
      where: { id },
      data: {
        name: body.name !== undefined ? String(body.name).trim().toUpperCase() : existing.name,
        ibgeCode: body.ibgeCode !== undefined ? String(body.ibgeCode).trim() : existing.ibgeCode,
        uf: body.uf !== undefined ? String(body.uf).trim().toUpperCase() : existing.uf,
        dddCode: body.dddCode !== undefined ? (body.dddCode ? String(body.dddCode).trim() : null) : existing.dddCode,
      },
    });

    await logActivity({
      tenantId: session!.tenantId || "PLATFORM",
      userId: session!.userId,
      userName: session!.name,
      action: "MUNICIPALITY_UPDATE",
      description: `${session!.name} atualizou o município ${municipality.name}/${municipality.uf}.`,
      entityType: "Municipality",
      entityId: municipality.id,
      terminal: getTerminalName(request),
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, municipality });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/municipios/[id]] Erro:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um município com esse código IBGE." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Erro ao atualizar município." }, { status: 500 });
  }
}

// DELETE /api/cadastros/municipios/[id] — restrito a administradores.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(request);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { id } = await params;
    const existing = await prisma.municipality.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Município não encontrado." }, { status: 404 });
    }

    await prisma.municipality.delete({ where: { id } });

    await logActivity({
      tenantId: session!.tenantId || "PLATFORM",
      userId: session!.userId,
      userName: session!.name,
      action: "MUNICIPALITY_DELETE",
      description: `${session!.name} excluiu o município ${existing.name}/${existing.uf}.`,
      entityType: "Municipality",
      entityId: id,
      terminal: getTerminalName(request),
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, message: "Município excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/municipios/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao excluir município." }, { status: 500 });
  }
}

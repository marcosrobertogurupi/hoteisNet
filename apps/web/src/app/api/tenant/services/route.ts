import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

// GET /api/tenant/services — lista os serviços prestados pelo hotel da sessão (lavanderia,
// traslado, cama extra, etc). Também usado pelo agente de IA (tool list_services, que resolve o
// tenant internamente, não via HTTP).
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const resolvedTenantId = session.tenantId;

    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("onlyActive") === "true";

    const services = await prisma.hotelService.findMany({
      where: { tenantId: resolvedTenantId, ...(onlyActive ? { active: true } : {}) },
      orderBy: { description: "asc" },
    });

    return NextResponse.json({ success: true, services });
  } catch (error: any) {
    console.error("[GET /api/tenant/services] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar serviços." }, { status: 500 });
  }
}

// POST /api/tenant/services — cria um novo serviço.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { code, description, category, price } = body;
    if (!description) {
      return NextResponse.json({ success: false, error: "Descrição é obrigatória." }, { status: 400 });
    }

    const resolvedTenantId = session!.tenantId!;

    const service = await prisma.hotelService.create({
      data: {
        tenantId: resolvedTenantId,
        code: code || null,
        description,
        category: category || null,
        price: price || 0,
      },
    });

    await logActivity({
      tenantId: resolvedTenantId,
      userId: session?.userId,
      userName: session?.name,
      action: "SERVICE_CREATE",
      description: `${session?.name || "Usuário"} cadastrou o serviço "${description}".`,
      entityType: "HOTEL_SERVICE",
      entityId: service.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, service });
  } catch (error: any) {
    console.error("[POST /api/tenant/services] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao criar serviço." }, { status: 500 });
  }
}

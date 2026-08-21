import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// GET /api/tenant/services?tenantId=... — lista os serviços prestados pelo hotel (lavanderia,
// traslado, cama extra, etc). Substitui a tela mock anterior. Também usado pelo agente de IA
// (tool list_services).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const onlyActive = searchParams.get("onlyActive") === "true";
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

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
    const { tenantId, code, description, category, price } = body;
    if (!description) {
      return NextResponse.json({ success: false, error: "Descrição é obrigatória." }, { status: 400 });
    }

    const resolvedTenantId = await resolveTenantId(tenantId || session!.tenantId);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

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

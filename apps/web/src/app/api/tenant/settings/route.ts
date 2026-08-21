import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// GET /api/tenant/settings?tenantId=... — devolve as configurações do assinante (ex: horário de virada de diária)
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId");

    const tenant = await prisma.tenant.findFirst({
      where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
      select: { id: true, dailyRolloverTime: true, allowNegativeStock: true, breakfastHours: true },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      settings: {
        dailyRolloverTime: tenant.dailyRolloverTime,
        allowNegativeStock: tenant.allowNegativeStock,
        breakfastHours: tenant.breakfastHours,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar configurações." }, { status: 500 });
  }
}

// PATCH /api/tenant/settings — atualiza configurações do assinante (ex: horário de virada de diária)
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, dailyRolloverTime, allowNegativeStock, breakfastHours } = body;

    if (dailyRolloverTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyRolloverTime)) {
      return NextResponse.json(
        { success: false, error: "Horário de virada de diária inválido (use HH:MM)." },
        { status: 400 }
      );
    }

    const tenant = await prisma.tenant.findFirst({
      where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
      select: { id: true },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        ...(dailyRolloverTime !== undefined ? { dailyRolloverTime } : {}),
        ...(allowNegativeStock !== undefined ? { allowNegativeStock: Boolean(allowNegativeStock) } : {}),
        ...(breakfastHours !== undefined ? { breakfastHours: breakfastHours || null } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar configurações." }, { status: 500 });
  }
}

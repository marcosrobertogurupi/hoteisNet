import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/tenant/settings — devolve as configurações do tenant da sessão (ex: horário de virada de diária)
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: session.tenantId },
      select: {
        id: true,
        dailyRolloverTime: true,
        allowNegativeStock: true,
        breakfastHours: true,
        maxDiscountPercent: true,
        fnrhMandatoryBeforeCheckin: true,
      },
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
        maxDiscountPercent: Number(tenant.maxDiscountPercent),
        fnrhMandatoryBeforeCheckin: tenant.fnrhMandatoryBeforeCheckin,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar configurações." }, { status: 500 });
  }
}

// PATCH /api/tenant/settings — atualiza configurações do tenant da sessão (ex: horário de virada de diária). Só admin.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const { dailyRolloverTime, allowNegativeStock, breakfastHours, maxDiscountPercent, fnrhMandatoryBeforeCheckin } = body;

    if (dailyRolloverTime !== undefined && !/^([01]\d|2[0-3]):[0-5]\d$/.test(dailyRolloverTime)) {
      return NextResponse.json(
        { success: false, error: "Horário de virada de diária inválido (use HH:MM)." },
        { status: 400 }
      );
    }

    if (maxDiscountPercent !== undefined) {
      const parsed = Number(maxDiscountPercent);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return NextResponse.json(
          { success: false, error: "Desconto máximo deve ser um percentual entre 0 e 100." },
          { status: 400 }
        );
      }
    }

    await prisma.tenant.update({
      where: { id: session!.tenantId },
      data: {
        ...(dailyRolloverTime !== undefined ? { dailyRolloverTime } : {}),
        ...(allowNegativeStock !== undefined ? { allowNegativeStock: Boolean(allowNegativeStock) } : {}),
        ...(breakfastHours !== undefined ? { breakfastHours: breakfastHours || null } : {}),
        ...(maxDiscountPercent !== undefined ? { maxDiscountPercent: Number(maxDiscountPercent) } : {}),
        ...(fnrhMandatoryBeforeCheckin !== undefined ? { fnrhMandatoryBeforeCheckin: Boolean(fnrhMandatoryBeforeCheckin) } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar configurações." }, { status: 500 });
  }
}

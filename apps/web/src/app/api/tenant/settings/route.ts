import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import type { TaxRegime } from "@prisma/client";

const TAX_REGIMES: TaxRegime[] = ["SIMPLES_NACIONAL", "LUCRO_PRESUMIDO", "LUCRO_REAL", "MEI"];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const EARLY_ARRIVAL_CHARGES = ["EXTRA_NIGHT", "HALF_NIGHT", "FIXED_FEE"] as const;

// GET /api/tenant/settings — configurações do tenant da sessão, incluindo os "Dados do Hotel"
// (equivalente à tabela Hotel.fic do sistema legado WinDev — ver memória
// tenant-is-the-windev-hotel-cadastro). `cnpj` e `city`/`state` são somente-leitura para o
// assinante (o PATCH abaixo não os altera a partir da tela dele).
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
        // Dados do Hotel
        name: true,
        tradeName: true,
        cnpj: true,
        email: true,
        phone: true,
        street: true,
        number: true,
        neighborhood: true,
        city: true,
        state: true,
        zipCode: true,
        stateRegistration: true,
        taxRegime: true,
        website: true,
        interestRate: true,
        logoUrl: true,
        // Operacionais
        dailyRolloverTime: true,
        allowNegativeStock: true,
        breakfastHours: true,
        breakfastHoursHoliday: true,
        maxDiscountPercent: true,
        fnrhMandatoryBeforeCheckin: true,
        screenLockMinutes: true,
        standardCheckInTime: true,
        standardCheckOutTime: true,
        earlyCheckinToleranceMinutes: true,
        earlyArrivalDefaultCharge: true,
        overnightArrivalDefaultCharge: true,
        earlyCheckinFixedFeeAmount: true,
        earlyCheckinPolicyText: true,
      },
    });

    if (!tenant) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      settings: {
        name: tenant.name,
        tradeName: tenant.tradeName,
        cnpj: tenant.cnpj,
        email: tenant.email,
        phone: tenant.phone,
        street: tenant.street,
        number: tenant.number,
        neighborhood: tenant.neighborhood,
        city: tenant.city,
        state: tenant.state,
        zipCode: tenant.zipCode,
        stateRegistration: tenant.stateRegistration,
        taxRegime: tenant.taxRegime,
        website: tenant.website,
        interestRate: tenant.interestRate != null ? Number(tenant.interestRate) : null,
        logoUrl: tenant.logoUrl,
        dailyRolloverTime: tenant.dailyRolloverTime,
        allowNegativeStock: tenant.allowNegativeStock,
        breakfastHours: tenant.breakfastHours,
        breakfastHoursHoliday: tenant.breakfastHoursHoliday,
        maxDiscountPercent: Number(tenant.maxDiscountPercent),
        fnrhMandatoryBeforeCheckin: tenant.fnrhMandatoryBeforeCheckin,
        screenLockMinutes: tenant.screenLockMinutes,
        standardCheckInTime: tenant.standardCheckInTime,
        standardCheckOutTime: tenant.standardCheckOutTime,
        earlyCheckinToleranceMinutes: tenant.earlyCheckinToleranceMinutes,
        earlyArrivalDefaultCharge: tenant.earlyArrivalDefaultCharge,
        overnightArrivalDefaultCharge: tenant.overnightArrivalDefaultCharge,
        earlyCheckinFixedFeeAmount: Number(tenant.earlyCheckinFixedFeeAmount),
        earlyCheckinPolicyText: tenant.earlyCheckinPolicyText,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar configurações." }, { status: 500 });
  }
}

// PATCH /api/tenant/settings — atualiza as configurações do tenant da sessão. Só admin.
// O assinante pode editar todos os "Dados do Hotel" EXCETO o CNPJ; cidade/UF chegam preenchidos
// pela busca de CEP na tela, não digitados livremente. CNPJ e a criação do assinante são do
// Painel do admin master (/api/admin/tenants).
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    if (!session!.tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const data: Record<string, any> = {};

    // --- Dados do Hotel (editáveis pelo assinante) ---
    const strField = (key: string, max: number) => {
      if (body[key] === undefined) return;
      const v = typeof body[key] === "string" ? body[key].trim() : "";
      data[key] = v ? v.slice(0, max) : null;
    };

    if (body.name !== undefined) {
      const v = String(body.name || "").trim();
      if (!v) return NextResponse.json({ success: false, error: "A razão social não pode ficar em branco." }, { status: 400 });
      data.name = v.slice(0, 200);
    }
    strField("tradeName", 200);
    strField("phone", 30);
    strField("street", 150);
    strField("number", 10);
    strField("neighborhood", 80);
    strField("city", 80);
    strField("state", 2);
    strField("zipCode", 12);
    strField("stateRegistration", 30);
    strField("website", 200);
    strField("logoUrl", 5000);

    if (body.email !== undefined) {
      const v = String(body.email || "").trim();
      if (v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
        return NextResponse.json({ success: false, error: "E-mail inválido." }, { status: 400 });
      }
      data.email = v.slice(0, 120);
    }

    if (body.taxRegime !== undefined) {
      if (body.taxRegime === null || body.taxRegime === "") data.taxRegime = null;
      else if (TAX_REGIMES.includes(body.taxRegime)) data.taxRegime = body.taxRegime;
      else return NextResponse.json({ success: false, error: "Regime tributário inválido." }, { status: 400 });
    }

    if (body.interestRate !== undefined) {
      if (body.interestRate === null || body.interestRate === "") {
        data.interestRate = null;
      } else {
        const n = Number(body.interestRate);
        if (!Number.isFinite(n) || n < 0 || n > 100) {
          return NextResponse.json({ success: false, error: "Juros de mora deve ser um percentual entre 0 e 100." }, { status: 400 });
        }
        data.interestRate = n;
      }
    }

    // CNPJ nunca é alterado por esta rota (identidade comercial — só o admin master).
    if (body.cnpj !== undefined) {
      return NextResponse.json(
        { success: false, error: "O CNPJ do estabelecimento só pode ser alterado pela administração do sistema." },
        { status: 403 }
      );
    }

    // --- Operacionais ---
    if (body.dailyRolloverTime !== undefined) {
      if (!HHMM.test(body.dailyRolloverTime)) {
        return NextResponse.json({ success: false, error: "Horário de virada de diária inválido (use HH:MM)." }, { status: 400 });
      }
      data.dailyRolloverTime = body.dailyRolloverTime;
    }
    if (body.standardCheckInTime !== undefined) {
      if (!HHMM.test(body.standardCheckInTime)) {
        return NextResponse.json({ success: false, error: "Horário padrão de check-in inválido (use HH:MM)." }, { status: 400 });
      }
      data.standardCheckInTime = body.standardCheckInTime;
    }
    if (body.standardCheckOutTime !== undefined) {
      if (!HHMM.test(body.standardCheckOutTime)) {
        return NextResponse.json({ success: false, error: "Horário padrão de check-out inválido (use HH:MM)." }, { status: 400 });
      }
      data.standardCheckOutTime = body.standardCheckOutTime;
    }
    if (body.earlyCheckinToleranceMinutes !== undefined) {
      const parsed = Number(body.earlyCheckinToleranceMinutes);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 240) {
        return NextResponse.json(
          { success: false, error: "Tolerância de chegada antecipada deve ser um número de minutos entre 0 e 240." },
          { status: 400 }
        );
      }
      data.earlyCheckinToleranceMinutes = parsed;
    }
    if (body.earlyArrivalDefaultCharge !== undefined) {
      if (!EARLY_ARRIVAL_CHARGES.includes(body.earlyArrivalDefaultCharge)) {
        return NextResponse.json({ success: false, error: "Cobrança padrão de chegada antecipada inválida." }, { status: 400 });
      }
      data.earlyArrivalDefaultCharge = body.earlyArrivalDefaultCharge;
    }
    if (body.overnightArrivalDefaultCharge !== undefined) {
      if (!EARLY_ARRIVAL_CHARGES.includes(body.overnightArrivalDefaultCharge)) {
        return NextResponse.json({ success: false, error: "Cobrança padrão de chegada de madrugada inválida." }, { status: 400 });
      }
      data.overnightArrivalDefaultCharge = body.overnightArrivalDefaultCharge;
    }
    if (body.earlyCheckinFixedFeeAmount !== undefined) {
      const parsed = Number(body.earlyCheckinFixedFeeAmount);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json({ success: false, error: "Valor da taxa fixa de chegada antecipada inválido." }, { status: 400 });
      }
      data.earlyCheckinFixedFeeAmount = parsed;
    }
    if (body.earlyCheckinPolicyText !== undefined) {
      const v = typeof body.earlyCheckinPolicyText === "string" ? body.earlyCheckinPolicyText.trim() : "";
      data.earlyCheckinPolicyText = v ? v.slice(0, 2000) : null;
    }

    if (body.allowNegativeStock !== undefined) data.allowNegativeStock = Boolean(body.allowNegativeStock);
    if (body.breakfastHours !== undefined) data.breakfastHours = body.breakfastHours || null;
    if (body.breakfastHoursHoliday !== undefined) data.breakfastHoursHoliday = body.breakfastHoursHoliday || null;
    if (body.fnrhMandatoryBeforeCheckin !== undefined) data.fnrhMandatoryBeforeCheckin = Boolean(body.fnrhMandatoryBeforeCheckin);

    if (body.maxDiscountPercent !== undefined) {
      const parsed = Number(body.maxDiscountPercent);
      if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
        return NextResponse.json({ success: false, error: "Desconto máximo deve ser um percentual entre 0 e 100." }, { status: 400 });
      }
      data.maxDiscountPercent = parsed;
    }

    if (body.screenLockMinutes !== undefined) {
      const parsed = Number(body.screenLockMinutes);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 240) {
        return NextResponse.json(
          { success: false, error: "Bloqueio de tela deve ser um número de minutos entre 0 e 240 (0 = desativado)." },
          { status: 400 }
        );
      }
      data.screenLockMinutes = parsed;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nada para atualizar." }, { status: 400 });
    }

    await prisma.tenant.update({ where: { id: session!.tenantId }, data });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/settings] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao salvar configurações." }, { status: 500 });
  }
}

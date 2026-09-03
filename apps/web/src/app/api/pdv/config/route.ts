import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { getClientIp, getTerminalName } from "@/lib/auth";

// Configuração fiscal do tenant para o PDV do restaurante (NFC-e / NF-e). Fase 0 do plano do
// PDV Fiscal. O regime tributário NÃO é editado aqui — vem de Tenant.taxRegime (Configurações
// > Dados do Hotel). O certificado A1 fica na máquina do caixa, nunca aqui.

const AMBIENTES = ["HOMOLOGACAO", "PRODUCAO"] as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const [config, tenant] = await Promise.all([
      prisma.fiscalConfig.findUnique({
        where: { tenantId: session.tenantId },
        select: {
          environment: true,
          nfceCscId: true,
          nfceCsc: true,
          defaultNfceSeries: true,
          defaultNfeSeries: true,
          additionalInfo: true,
          certificateExpiresAt: true,
          certificateHolder: true,
          updatedAt: true,
        },
      }),
      prisma.tenant.findUnique({
        where: { id: session.tenantId },
        select: { taxRegime: true, cnpj: true, stateRegistration: true, name: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      config,
      // Contexto fiscal só-leitura para a tela (o regime é editado em Configurações).
      tenant: {
        taxRegime: tenant?.taxRegime ?? null,
        cnpj: tenant?.cnpj ?? null,
        stateRegistration: tenant?.stateRegistration ?? null,
        razaoSocial: tenant?.name ?? null,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/config] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const {
      ambiente,
      cscId,
      csc,
      serieNfcePadrao,
      serieNfePadrao,
      informacoesComplementares,
    } = body;

    const environment = AMBIENTES.includes(ambiente) ? ambiente : "HOMOLOGACAO";
    const nfceSeries = Math.max(1, Math.trunc(Number(serieNfcePadrao) || 1));
    const nfeSeries = Math.max(1, Math.trunc(Number(serieNfePadrao) || 1));

    const data = {
      environment,
      nfceCscId: cscId ? String(cscId).trim() : null,
      nfceCsc: csc ? String(csc).trim() : null,
      defaultNfceSeries: nfceSeries,
      defaultNfeSeries: nfeSeries,
      additionalInfo: informacoesComplementares ? String(informacoesComplementares).trim() : null,
    };

    const config = await prisma.fiscalConfig.upsert({
      where: { tenantId: session!.tenantId! },
      create: { tenantId: session!.tenantId!, ...data },
      update: data,
      select: {
        environment: true,
        nfceCscId: true,
        nfceCsc: true,
        defaultNfceSeries: true,
        defaultNfeSeries: true,
        additionalInfo: true,
        updatedAt: true,
      },
    });

    await logActivity({
      tenantId: session!.tenantId!,
      userId: session!.userId,
      userName: session!.name,
      action: "PDV_FISCAL_CONFIG_UPDATE",
      description: `${session!.name} atualizou a configuração fiscal do PDV (ambiente: ${environment}).`,
      entityType: "FISCAL_CONFIG",
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, config });
  } catch (error: any) {
    console.error("[PUT /api/pdv/config] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

async function resolveTenantId(tenantId: string | null) {
  const tenant = await prisma.tenant.findFirst({
    where: { id: { in: [tenantId, DEFAULT_TENANT_ID, "TNT-01"].filter(Boolean) as string[] } },
    select: { id: true },
  });
  return tenant?.id || null;
}

// POST /api/uazapi/instance/disconnect — encerra a sessão WhatsApp da instância do assinante.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const resolvedTenantId = await resolveTenantId(body.tenantId || null);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId: resolvedTenantId } });
    if (!setting?.serverUrl || !setting?.instanceToken) {
      return NextResponse.json(
        { success: false, error: "Nenhuma instância uazapi configurada para este assinante." },
        { status: 400 }
      );
    }

    const response = await fetch(`${setting.serverUrl}/instance/disconnect`, {
      method: "POST",
      headers: { token: setting.instanceToken },
    });

    const resText = await response.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { text: resText };
    }

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: resJson?.error || resJson?.text || "Falha ao desconectar instância.",
      });
    }

    await prisma.uazapiSetting.update({
      where: { tenantId: resolvedTenantId },
      data: { status: "disconnected", connected: false, qrCodeUrl: null, pairCode: null },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/uazapi/instance/disconnect] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao desconectar instância." },
      { status: 500 }
    );
  }
}

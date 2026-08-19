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

// GET /api/uazapi/instance/status?tenantId=... — consulta o status atual da instância na uazapi
// (usado para polling durante a leitura do QR code e para o badge de conexão da tela).
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const resolvedTenantId = await resolveTenantId(searchParams.get("tenantId"));
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId: resolvedTenantId } });
    if (!setting?.serverUrl || !setting?.instanceToken) {
      return NextResponse.json({ success: true, settings: null });
    }

    const response = await fetch(`${setting.serverUrl}/instance/status`, {
      method: "GET",
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
        error: resJson?.error || resJson?.text || "Falha ao consultar status da instância.",
      });
    }

    const connected = !!resJson.status?.connected;
    const status: string = resJson.instance?.status || (connected ? "connected" : "disconnected");
    const qrCodeUrl: string | null = connected ? null : resJson.instance?.qrcode || setting.qrCodeUrl || null;

    const updated = await prisma.uazapiSetting.update({
      where: { tenantId: resolvedTenantId },
      data: { status, connected, qrCodeUrl },
    });

    return NextResponse.json({
      success: true,
      settings: {
        status: updated.status,
        connected: updated.connected,
        qrCodeUrl: updated.qrCodeUrl,
        profileName: resJson.instance?.profileName || null,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/uazapi/instance/status] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao consultar status." },
      { status: 500 }
    );
  }
}

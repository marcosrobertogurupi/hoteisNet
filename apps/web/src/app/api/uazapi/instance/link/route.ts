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

// POST /api/uazapi/instance/link — vincula uma instância uazapi JÁ EXISTENTE (criada fora do
// HoteisNet, ex.: direto no painel da uazapi) ao assinante, usando apenas servidor + token da
// própria instância (sem precisar do admin token, que só é exigido para CRIAR uma instância nova).
// Valida a instância via GET /instance/status antes de salvar.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, serverUrl, instanceToken } = body;

    if (!serverUrl || !instanceToken) {
      return NextResponse.json(
        { success: false, error: "Servidor e token da instância são obrigatórios." },
        { status: 400 }
      );
    }

    const resolvedTenantId = await resolveTenantId(tenantId || null);
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    }

    const targetServer = String(serverUrl).trim().replace(/\/$/, "");
    const targetToken = String(instanceToken).trim();

    const response = await fetch(`${targetServer}/instance/status`, {
      method: "GET",
      headers: { token: targetToken },
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
        error: resJson?.error || resJson?.text || "Não foi possível validar essa instância. Confira o servidor e o token.",
      });
    }

    const connected = !!resJson.status?.connected;
    const status: string = resJson.instance?.status || (connected ? "connected" : "disconnected");

    const setting = await prisma.uazapiSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: {
        tenantId: resolvedTenantId,
        serverUrl: targetServer,
        instanceId: resJson.instance?.id || "",
        instanceName: resJson.instance?.name || "",
        instanceToken: targetToken,
        status,
        connected,
      },
      update: {
        serverUrl: targetServer,
        instanceId: resJson.instance?.id || "",
        instanceName: resJson.instance?.name || "",
        instanceToken: targetToken,
        status,
        connected,
        qrCodeUrl: null,
        pairCode: null,
      },
    });

    return NextResponse.json({ success: true, settings: setting });
  } catch (error: any) {
    console.error("[POST /api/uazapi/instance/link] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao vincular instância." },
      { status: 500 }
    );
  }
}

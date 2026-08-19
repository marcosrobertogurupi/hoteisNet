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

// POST /api/uazapi/instance/webhook — configura (modo simples) o webhook da instância na uazapi
// para receber eventos de mensagens/conexão. excludeMessages: ["wasSentByApi"] evita loop com o
// próprio envio feito pelo HoteisNet.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantId, url } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL do webhook é obrigatória." }, { status: 400 });
    }

    const resolvedTenantId = await resolveTenantId(tenantId || null);
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

    const response = await fetch(`${setting.serverUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: setting.instanceToken },
      body: JSON.stringify({
        url,
        events: ["messages", "connection"],
        excludeMessages: ["wasSentByApi"],
      }),
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
        error: resJson?.error || resJson?.text || "Falha ao configurar webhook.",
      });
    }

    await prisma.uazapiSetting.update({
      where: { tenantId: resolvedTenantId },
      data: { webhookUrl: url },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[POST /api/uazapi/instance/webhook] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao configurar webhook." },
      { status: 500 }
    );
  }
}

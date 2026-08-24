import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// POST /api/uazapi/instance/webhook — configura (modo simples) o webhook da instância do tenant
// da sessão na uazapi, para receber eventos de mensagens/conexão. excludeMessages:
// ["wasSentByApi"] evita loop com o próprio envio feito pelo HoteisNet.
//
// Gera (ou reaproveita) um segredo por tenant e o anexa como query param na URL registrada na
// uazapi — POST /api/uazapi/webhook/[tenantId] exige esse segredo antes de processar qualquer
// evento recebido, para que não seja possível forjar mensagens de hóspede sabendo só o tenantId.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ success: false, error: "URL do webhook é obrigatória." }, { status: 400 });
    }

    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId: resolvedTenantId } });
    if (!setting?.serverUrl || !setting?.instanceToken) {
      return NextResponse.json(
        { success: false, error: "Nenhuma instância uazapi configurada para este assinante." },
        { status: 400 }
      );
    }

    const webhookSecret = setting.webhookSecret || randomBytes(24).toString("hex");
    const baseUrl = String(url).split("?")[0];
    const signedUrl = `${baseUrl}?secret=${webhookSecret}`;

    const response = await fetch(`${setting.serverUrl}/webhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: setting.instanceToken },
      body: JSON.stringify({
        url: signedUrl,
        enabled: true,
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
      data: { webhookUrl: baseUrl, webhookSecret },
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

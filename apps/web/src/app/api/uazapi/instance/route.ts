import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// GET /api/uazapi/instance — devolve a configuração salva da instância uazapi do tenant da sessão
// (servidor, nome/token da instância, status de conexão, QR code pendente, webhook). Só admin: os
// campos retornados incluem segredos de API (adminToken/instanceToken) que permitem controlar
// totalmente o WhatsApp do hotel.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId: resolvedTenantId } });

    return NextResponse.json({
      success: true,
      settings: setting
        ? {
            serverUrl: setting.serverUrl,
            adminToken: setting.adminToken,
            instanceId: setting.instanceId,
            instanceName: setting.instanceName,
            instanceToken: setting.instanceToken,
            status: setting.status,
            connected: setting.connected,
            qrCodeUrl: setting.qrCodeUrl,
            pairCode: setting.pairCode,
            webhookUrl: setting.webhookUrl,
          }
        : null,
    });
  } catch (error: any) {
    console.error("[GET /api/uazapi/instance] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao buscar configuração da instância." },
      { status: 500 }
    );
  }
}

// POST /api/uazapi/instance — cria (ou re-cria) a instância uazapi do tenant da sessão na
// uazapiGO, usando o servidor + admin token informados, e salva o token da instância retornado.
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
    const { serverUrl, adminToken, instanceName } = body;

    if (!serverUrl || !adminToken || !instanceName) {
      return NextResponse.json(
        { success: false, error: "Servidor, chave/token admin e nome da instância são obrigatórios." },
        { status: 400 }
      );
    }

    const targetServer = String(serverUrl).trim().replace(/\/$/, "");

    const response = await fetch(`${targetServer}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", admintoken: String(adminToken).trim() },
      body: JSON.stringify({ name: instanceName }),
    });

    const resText = await response.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { text: resText };
    }

    if (!response.ok || !resJson?.token) {
      return NextResponse.json({
        success: false,
        error: resJson?.error || resJson?.text || "Falha ao criar instância na uazapi.",
      });
    }

    const setting = await prisma.uazapiSetting.upsert({
      where: { tenantId: resolvedTenantId },
      create: {
        tenantId: resolvedTenantId,
        serverUrl: targetServer,
        adminToken: String(adminToken).trim(),
        instanceId: resJson.instance?.id || "",
        instanceName,
        instanceToken: resJson.token,
        status: "disconnected",
        connected: false,
      },
      update: {
        serverUrl: targetServer,
        adminToken: String(adminToken).trim(),
        instanceId: resJson.instance?.id || "",
        instanceName,
        instanceToken: resJson.token,
        status: "disconnected",
        connected: false,
        qrCodeUrl: null,
        pairCode: null,
      },
    });

    return NextResponse.json({ success: true, settings: setting });
  } catch (error: any) {
    console.error("[POST /api/uazapi/instance] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao criar instância." },
      { status: 500 }
    );
  }
}

// DELETE /api/uazapi/instance — remove a configuração local da instância do tenant da sessão (não
// afeta a instância criada na uazapi, apenas desvincula o assinante dela no HoteisNet).
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    await prisma.uazapiSetting.deleteMany({ where: { tenantId: resolvedTenantId } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[DELETE /api/uazapi/instance] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro ao remover instância." },
      { status: 500 }
    );
  }
}

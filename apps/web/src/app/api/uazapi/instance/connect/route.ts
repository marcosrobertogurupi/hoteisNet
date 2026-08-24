import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// POST /api/uazapi/instance/connect — inicia a conexão da instância do tenant da sessão ao
// WhatsApp (gera QR code). Use GET /api/uazapi/instance/status em seguida (com polling) para
// saber quando foi escaneado.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const resolvedTenantId = session!.tenantId;
    if (!resolvedTenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const setting = await prisma.uazapiSetting.findUnique({ where: { tenantId: resolvedTenantId } });
    if (!setting?.serverUrl || !setting?.instanceToken) {
      return NextResponse.json(
        { success: false, error: "Nenhuma instância uazapi configurada para este assinante." },
        { status: 400 }
      );
    }

    const response = await fetch(`${setting.serverUrl}/instance/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: setting.instanceToken },
      body: JSON.stringify({}),
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
        error: resJson?.error || resJson?.text || "Falha ao conectar instância.",
      });
    }

    const qrCodeUrl: string | null = resJson.instance?.qrcode || resJson.qrcode || null;
    const pairCode: string | null = resJson.instance?.paircode || resJson.paircode || null;

    await prisma.uazapiSetting.update({
      where: { tenantId: resolvedTenantId },
      data: { status: "connecting", connected: false, qrCodeUrl, pairCode },
    });

    return NextResponse.json({ success: true, qrCodeUrl, pairCode, status: "connecting" });
  } catch (error: any) {
    console.error("[POST /api/uazapi/instance/connect] Erro:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Erro interno ao conectar instância." },
      { status: 500 }
    );
  }
}

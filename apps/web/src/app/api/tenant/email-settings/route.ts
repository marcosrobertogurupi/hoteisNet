import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireTenantAdmin } from "@/lib/auth";
import { isBlockedSmtpHost } from "@/lib/htmlEscape";

const SMTP_SECURE = ["tls", "ssl", "none"] as const;

// Configurações de SMTP do assinante (EmailSetting). Antes viviam apenas no localStorage do
// navegador e eram reenviadas ao servidor a cada disparo — a senha do e-mail do hotel ficava
// legível em qualquer DevTools/extensão e a rota de envio virava relay aberto. Agora são
// autoritativas no banco: o navegador nunca recebe a senha de volta, só se ela está preenchida.
//
// GET/PATCH exigem administrador (é configuração mestre do hotel — CLAUDE.md, Segurança §1).

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const setting = await prisma.emailSetting.findUnique({
      where: { tenantId: session!.tenantId! },
      select: {
        smtpHost: true,
        smtpPort: true,
        smtpSecure: true,
        smtpUser: true,
        smtpPass: true,
        fromName: true,
        fromEmail: true,
        footerText: true,
        sendVoucherEnabled: true,
        sendReceiptEnabled: true,
        sendPaymentConfirmEnabled: true,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        smtpHost: setting?.smtpHost ?? "smtp.gmail.com",
        smtpPort: setting?.smtpPort ?? 587,
        smtpSecure: setting?.smtpSecure ?? "tls",
        smtpUser: setting?.smtpUser ?? "",
        fromName: setting?.fromName ?? "",
        fromEmail: setting?.fromEmail ?? "",
        footerText: setting?.footerText ?? "",
        sendVoucherEnabled: setting?.sendVoucherEnabled ?? true,
        sendReceiptEnabled: setting?.sendReceiptEnabled ?? true,
        sendPaymentConfirmEnabled: setting?.sendPaymentConfirmEnabled ?? true,
        // A senha nunca volta ao navegador — a tela só precisa saber se já existe uma salva.
        senhaConfigurada: (setting?.smtpPass ?? "").trim().length > 0,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/tenant/email-settings]", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar as configurações de e-mail." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const data: Record<string, any> = {};

    if (typeof body.smtpHost === "string") {
      const host = body.smtpHost.trim();
      if (!host) {
        return NextResponse.json({ success: false, error: "O servidor de e-mail é obrigatório." }, { status: 400 });
      }
      if (isBlockedSmtpHost(host)) {
        return NextResponse.json({ success: false, error: "Servidor de e-mail inválido." }, { status: 400 });
      }
      data.smtpHost = host;
    }
    if (body.smtpPort !== undefined) {
      const port = Number(body.smtpPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return NextResponse.json({ success: false, error: "Porta de e-mail inválida." }, { status: 400 });
      }
      data.smtpPort = port;
    }
    if (typeof body.smtpSecure === "string") {
      if (!SMTP_SECURE.includes(body.smtpSecure as any)) {
        return NextResponse.json({ success: false, error: "Tipo de segurança inválido." }, { status: 400 });
      }
      data.smtpSecure = body.smtpSecure;
    }
    if (typeof body.smtpUser === "string") data.smtpUser = body.smtpUser.trim();
    // Campo de senha em branco significa "manter a senha já salva" — a tela nunca recebe a atual
    // de volta, então não teria como reenviá-la.
    if (typeof body.smtpPass === "string" && body.smtpPass.trim()) data.smtpPass = body.smtpPass.trim();
    if (typeof body.fromName === "string") data.fromName = body.fromName.trim();
    if (typeof body.fromEmail === "string") data.fromEmail = body.fromEmail.trim();
    if (typeof body.footerText === "string") data.footerText = body.footerText;
    if (typeof body.sendVoucherEnabled === "boolean") data.sendVoucherEnabled = body.sendVoucherEnabled;
    if (typeof body.sendReceiptEnabled === "boolean") data.sendReceiptEnabled = body.sendReceiptEnabled;
    if (typeof body.sendPaymentConfirmEnabled === "boolean") data.sendPaymentConfirmEnabled = body.sendPaymentConfirmEnabled;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: "Nenhum campo para atualizar." }, { status: 400 });
    }

    await prisma.emailSetting.upsert({
      where: { tenantId: session!.tenantId! },
      create: { tenantId: session!.tenantId!, ...data },
      update: data,
      select: { id: true },
    });

    return NextResponse.json({ success: true, message: "Configurações de e-mail salvas." });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/email-settings]", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar as configurações de e-mail." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireTenantAdmin } from "@/lib/auth";
import { escapeHtml } from "@/lib/htmlEscape";
import { isBlockedSmtpHostResolved } from "@/lib/smtpHostGuard";

// POST /api/email/test — só admin: usada exclusivamente para validar as próprias credenciais SMTP
// do tenant a partir da tela de Configurações, nunca para envio arbitrário.
//
// Os campos SMTP continuam vindo do corpo porque a tela precisa testar credenciais ANTES de
// salvá-las. Duas travas garantem que isso não vire relay (CLAUDE.md, Segurança §7):
//   1. O e-mail de teste só é enviado para o próprio usuário SMTP / remetente informado — nunca
//      para um destinatário livre escolhido por quem chama.
//   2. Senha em branco significa "usar a que já está salva no banco", para que a tela consiga
//      retestar sem que a senha atual precise trafegar de volta ao navegador.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await request.json();
    const {
      smtpHost = "smtp.gmail.com",
      smtpPort = 587,
      smtpSecure = "tls",
      smtpUser = "",
      smtpPass = "",
      fromEmail = "",
      fromName = "Hoteis.Net SaaS",
    } = body;

    if (!smtpHost || !smtpPort) {
      return NextResponse.json(
        { success: false, error: "Servidor e porta de e-mail são obrigatórios." },
        { status: 400 }
      );
    }

    if (await isBlockedSmtpHostResolved(String(smtpHost))) {
      return NextResponse.json({ success: false, error: "Servidor de e-mail inválido." }, { status: 400 });
    }

    const user = String(smtpUser).trim();
    let pass = String(smtpPass).trim();
    if (user && !pass) {
      const saved = await prisma.emailSetting.findUnique({
        where: { tenantId: session!.tenantId! },
        select: { smtpPass: true },
      });
      pass = (saved?.smtpPass || "").trim();
      if (!pass) {
        return NextResponse.json(
          { success: false, error: "Informe a senha de aplicativo do e-mail para testar a conexão." },
          { status: 400 }
        );
      }
    }

    const isSecure = smtpSecure === "ssl" || Number(smtpPort) === 465;

    const transporter = nodemailer.createTransport({
      host: String(smtpHost).trim(),
      port: Number(smtpPort),
      secure: isSecure,
      auth: user ? { user, pass } : undefined,
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
    });

    // 1. Verifica autenticação e transporte com o servidor de e-mail
    await transporter.verify();

    // 2. O teste sempre vai para a própria caixa configurada — nunca para um destinatário livre.
    const testTarget = (user || String(fromEmail).trim()).trim();
    if (!testTarget) {
      return NextResponse.json({
        success: true,
        message: "Conexão validada com sucesso. Nenhum e-mail de teste foi enviado (sem usuário configurado).",
      });
    }

    const safeFromName = escapeHtml(String(fromName) || "Hoteis.Net SaaS");
    await transporter.sendMail({
      from: `"${safeFromName}" <${String(fromEmail).trim() || user}>`,
      to: testTarget,
      subject: "Teste de conexão de e-mail - Hoteis.Net SaaS",
      html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="color: #0284c7; margin: 0;">Hoteis.Net PMS SaaS</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Validação de Configuração de E-mail</p>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Olá! Este é um <strong>e-mail de teste</strong> enviado com sucesso a partir das configurações de e-mail salvas no <strong>Hoteis.Net SaaS</strong>.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #475569;">
              <p style="margin: 0 0 8px 0;"><strong>Servidor:</strong> ${escapeHtml(String(smtpHost))}:${escapeHtml(String(smtpPort))} (${escapeHtml(String(smtpSecure).toUpperCase())})</p>
              <p style="margin: 0 0 8px 0;"><strong>Usuário:</strong> ${escapeHtml(user || "Sem autenticação")}</p>
              <p style="margin: 0;"><strong>Remetente configurado:</strong> ${safeFromName} &lt;${escapeHtml(String(fromEmail) || user)}&gt;</p>
            </div>
            <p style="color: #10b981; font-weight: bold; font-size: 14px; text-align: center;">
              Seu e-mail está pronto para enviar Vouchers, Recibos e Confirmações de Pagamento.
            </p>
            <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
              Hoteis.Net PMS - Sistema de Gestão Hoteleira SaaS
            </div>
          </div>
        `,
    });

    return NextResponse.json({
      success: true,
      message: `Conexão validada com sucesso! E-mail de teste enviado para ${testTarget}.`,
    });
  } catch (error: any) {
    console.error("[Email SMTP Test Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Falha ao conectar ou autenticar no servidor de e-mail.",
      },
      { status: 500 }
    );
  }
}

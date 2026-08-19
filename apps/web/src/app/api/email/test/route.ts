import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      smtpHost = "smtp.gmail.com",
      smtpPort = 587,
      smtpSecure = "tls",
      smtpUser = "",
      smtpPass = "",
      fromEmail = "reserva@pousada.com.br",
      fromName = "Pousada Sol & Mar - Reservas",
      recipientEmail,
    } = body;

    if (!smtpHost || !smtpPort) {
      return NextResponse.json(
        { success: false, error: "Servidor Host e Porta SMTP são obrigatórios." },
        { status: 400 }
      );
    }

    const isSecure = smtpSecure === "ssl" || Number(smtpPort) === 465;

    // Configura a conexão SMTP com Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtpHost.trim(),
      port: Number(smtpPort),
      secure: isSecure,
      auth: smtpUser.trim() ? { user: smtpUser.trim(), pass: smtpPass.trim() } : undefined,
      tls: {
        rejectUnauthorized: false, // Permite certificados autoassinados em servidores privados
      },
      connectionTimeout: 10000, // 10s timeout
    });

    // 1. Verifica autenticação e transporte com o servidor SMTP
    await transporter.verify();

    // 2. Se for solicitado um e-mail de teste específico ou usar o próprio remetente/usuário
    const testTarget = (recipientEmail || smtpUser || fromEmail).trim();

    if (testTarget) {
      await transporter.sendMail({
        from: `"${fromName || "Hoteis.Net SaaS"}" <${fromEmail || smtpUser}>`,
        to: testTarget,
        subject: "🎉 Teste de Conexão SMTP - Hoteis.Net SaaS",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background-color: #ffffff;">
            <div style="text-align: center; border-bottom: 2px solid #0284c7; padding-bottom: 16px; margin-bottom: 20px;">
              <h2 style="color: #0284c7; margin: 0;">Hoteis.Net PMS SaaS</h2>
              <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Validação de Configuração de E-mail</p>
            </div>
            <p style="color: #334155; font-size: 15px; line-height: 1.6;">
              Olá! Este é um <strong>e-mail de teste</strong> enviado com sucesso a partir das suas configurações de SMTP salvas no <strong>Hoteis.Net SaaS</strong>.
            </p>
            <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px; color: #475569;">
              <p style="margin: 0 0 8px 0;"><strong>Servidor SMTP:</strong> ${smtpHost}:${smtpPort} (${smtpSecure.toUpperCase()})</p>
              <p style="margin: 0 0 8px 0;"><strong>Usuário SMTP:</strong> ${smtpUser || "Sem autenticação"}</p>
              <p style="margin: 0;"><strong>Remetente Configurado:</strong> ${fromName} &lt;${fromEmail}&gt;</p>
            </div>
            <p style="color: #10b981; font-weight: bold; font-size: 14px; text-align: center;">
              ✅ Seu servidor de e-mail está pronto para enviar Vouchers, Recibos e Confirmações de Pagamento!
            </p>
            <div style="border-top: 1px solid #e2e8f0; margin-top: 24px; padding-top: 16px; text-align: center; font-size: 12px; color: #94a3b8;">
              Hoteis.Net PMS - Sistema de Gestão Hoteleira SaaS
            </div>
          </div>
        `,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Conexão SMTP validada com sucesso! E-mail de teste enviado para ${testTarget}.`,
    });
  } catch (error: any) {
    console.error("[Email SMTP Test Error]", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Falha ao conectar ou autenticar no servidor SMTP.",
      },
      { status: 500 }
    );
  }
}

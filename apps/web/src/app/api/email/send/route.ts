import { NextRequest, NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { getSessionUser } from "@/lib/auth";
import { escapeHtml, isBlockedSmtpHost } from "@/lib/htmlEscape";

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const {
      recipientEmail,
      recipientName,
      subject,
      documentType = "voucher", // "voucher" | "receipt" | "payment_confirmation"
      message,
      pdfBase64,
      filename,
      // Configurações SMTP
      smtpHost = "smtp.gmail.com",
      smtpPort = 587,
      smtpSecure = "tls",
      smtpUser = "",
      smtpPass = "",
      fromEmail = "reserva@pousada.com.br",
      fromName = "Pousada Sol & Mar - Reservas",
      footerText = "Obrigado por escolher nossa pousada! Em caso de dúvidas, entre em contato conosco.",
    } = body;

    if (!recipientEmail) {
      return NextResponse.json(
        { success: false, error: "O e-mail de destino é obrigatório." },
        { status: 400 }
      );
    }

    // Valida se as credenciais SMTP foram preenchidas no assinante
    if (!smtpUser?.trim() || !smtpPass?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error: "As credenciais de e-mail (Usuário e Senha SMTP) não estão configuradas. Por favor, acesse a Área do Assinante > Configurações para preencher seu Usuário e Senha de App de E-mail.",
        },
        { status: 400 }
      );
    }

    if (isBlockedSmtpHost(smtpHost)) {
      return NextResponse.json({ success: false, error: "Servidor SMTP inválido." }, { status: 400 });
    }

    const isSecure = smtpSecure === "ssl" || Number(smtpPort) === 465;

    // Configura Nodemailer
    const transporter = nodemailer.createTransport({
      host: (smtpHost || "smtp.gmail.com").trim(),
      port: Number(smtpPort || 587),
      secure: isSecure,
      auth: { user: smtpUser.trim(), pass: smtpPass.trim() },
      tls: {
        rejectUnauthorized: true,
      },
      connectionTimeout: 12000,
    });

    let docTitle = "Voucher de Reserva";
    let defaultFilename = "Voucher_Reserva.pdf";
    let badgeColor = "#0284c7";

    if (documentType === "receipt") {
      docTitle = "Recibo & Extrato de Hospedagem";
      defaultFilename = "Recibo_Hospedagem.pdf";
      badgeColor = "#10b981";
    } else if (documentType === "payment_confirmation") {
      docTitle = "Comprovante / Confirmação de Pagamento";
      defaultFilename = "Confirmacao_Pagamento.pdf";
      badgeColor = "#8b5cf6";
    }

    const emailSubject = subject || `${docTitle} - ${fromName}`;
    const docFilename = filename || defaultFilename;

    // Extrai e limpa a string Base64 do PDF (removendo qualquer prefixo de Data URI)
    let attachments: any[] = [];
    if (pdfBase64) {
      // Extrai o conteúdo base64 puro após a vírgula, se presente
      const rawBase64 = pdfBase64.includes(",")
        ? pdfBase64.split(",")[1]
        : pdfBase64;

      const cleanBase64 = rawBase64.replace(/[\r\n\s]/g, "").trim();
      const pdfBuffer = Buffer.from(cleanBase64, "base64");

      // Garante extensão .pdf válida para visualizadores de PDF de qualquer SO
      const safeFilename = docFilename.toLowerCase().endsWith(".pdf")
        ? docFilename
        : `${docFilename.replace(/\.[^/.]+$/, "")}.pdf`;

      attachments.push({
        filename: safeFilename,
        content: pdfBuffer,
        contentType: "application/pdf",
        contentDisposition: "attachment",
      });
    }

    const safeFromName = escapeHtml(fromName);
    const safeRecipientName = escapeHtml(recipientName || "Prezado(a) Hóspede");
    const safeMessage = message ? escapeHtml(message) : `Segue em anexo o seu <strong>${escapeHtml(docTitle.toLowerCase())}</strong> gerado pelo nosso sistema.`;
    const safeFooterText = escapeHtml(footerText);
    const safeDocFilename = escapeHtml(docFilename.endsWith(".pdf") ? docFilename : `${docFilename}.pdf`);

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <!-- Top Header Banner -->
        <div style="background-color: ${badgeColor}; padding: 24px 32px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase;">${safeFromName}</h1>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">${docTitle}</p>
        </div>

        <!-- Body Content -->
        <div style="padding: 32px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: 600; margin-top: 0; color: #0f172a;">
            Olá, ${safeRecipientName}!
          </p>

          <p style="font-size: 14px; color: #475569;">
            ${safeMessage}
          </p>

          ${
            pdfBase64
              ? `
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
                <p style="margin: 0 0 6px 0; font-weight: bold; font-size: 13px; color: #0f172a;">
                  📎 Arquivo em Anexo (PDF):
                </p>
                <span style="font-family: monospace; font-size: 12px; color: ${badgeColor}; font-weight: bold;">
                  ${safeDocFilename}
                </span>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b;">
                  Você pode abrir e salvar este arquivo PDF diretamente no seu dispositivo.
                </p>
              </div>
              `
              : ""
          }

          <div style="background-color: #f1f5f9; border-left: 4px solid ${badgeColor}; padding: 12px 16px; margin-top: 24px; border-radius: 0 8px 8px 0; font-size: 13px; color: #475569;">
            ${safeFooterText}
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0;">Enviado por <strong>${safeFromName}</strong> via Hoteis.Net PMS SaaS.</p>
        </div>
      </div>
    `;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail || smtpUser}>`,
      to: recipientEmail,
      subject: emailSubject,
      html: htmlContent,
      attachments,
    });

    console.log(`[Email Send] Message sent to ${recipientEmail}, MessageId: ${info.messageId}`);

    return NextResponse.json({
      success: true,
      message: `${docTitle} enviado com sucesso para ${recipientEmail}!`,
      messageId: info.messageId,
    });
  } catch (error: any) {
    console.error("[Email Send Error]", error);

    let userFriendlyError = error.message || "Erro ao enviar e-mail.";
    if (
      error.message?.includes("530-5.7.0") ||
      error.message?.includes("Authentication Required") ||
      error.message?.includes("535 5.7.8")
    ) {
      userFriendlyError =
        "Falha de Autenticação no servidor de e-mail (530/535). Por favor, acesse Área do Assinante > Configurações e verifique se o Usuário e a Senha de App SMTP estão configurados corretamente.";
    } else if (
      error.message?.includes("ECONNREFUSED") ||
      error.message?.includes("ETIMEDOUT")
    ) {
      userFriendlyError =
        "Não foi possível conectar ao servidor SMTP. Verifique o Servidor Host e a Porta informados nas Configurações.";
    }

    return NextResponse.json(
      {
        success: false,
        error: userFriendlyError,
      },
      { status: 500 }
    );
  }
}

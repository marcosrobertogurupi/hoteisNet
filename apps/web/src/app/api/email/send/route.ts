import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { escapeHtml } from "@/lib/htmlEscape";
import { getTenantEmailSettings, sendTenantEmail, type TenantEmailAttachment } from "@/lib/tenantEmail";

// POST /api/email/send — envia voucher/recibo/confirmação de pagamento para o hóspede usando
// EXCLUSIVAMENTE as credenciais SMTP do tenant da sessão (EmailSetting).
//
// Antes esta rota aceitava smtpHost/smtpUser/smtpPass/fromEmail do corpo da requisição: qualquer
// sessão válida fazia o servidor abrir conexão SMTP para o host que quisesse e enviar e-mail com
// remetente e anexo arbitrários — relay de spam/phishing saindo do IP da plataforma
// (CLAUDE.md, Segurança §7). O corpo agora só descreve o destinatário e o documento.

const DOC_TYPES = {
  voucher: {
    title: "Voucher de Reserva",
    defaultFilename: "Voucher_Reserva.pdf",
    badgeColor: "#0284c7",
    settingKey: "sendVoucherEnabled",
    disabledMessage: "O envio de Vouchers por e-mail está desativado nas Configurações do assinante.",
  },
  receipt: {
    title: "Recibo & Extrato de Hospedagem",
    defaultFilename: "Recibo_Hospedagem.pdf",
    badgeColor: "#10b981",
    settingKey: "sendReceiptEnabled",
    disabledMessage: "O envio de Recibos/Extratos por e-mail está desativado nas Configurações do assinante.",
  },
  payment_confirmation: {
    title: "Comprovante / Confirmação de Pagamento",
    defaultFilename: "Confirmacao_Pagamento.pdf",
    badgeColor: "#8b5cf6",
    settingKey: "sendPaymentConfirmEnabled",
    disabledMessage: "O envio de Confirmações de Pagamento por e-mail está desativado nas Configurações do assinante.",
  },
} as const;

// Anexo montado pelo cliente: limitado para que a rota não vire canal de exfiltração de arquivos
// grandes nem estoure a memória da função.
const MAX_PDF_BYTES = 8 * 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { recipientEmail, recipientName, subject, documentType = "voucher", message, pdfBase64, filename } = body;

    const doc = DOC_TYPES[documentType as keyof typeof DOC_TYPES];
    if (!doc) {
      return NextResponse.json({ success: false, error: "Tipo de documento inválido." }, { status: 400 });
    }

    const to = String(recipientEmail || "").trim();
    if (!to || !to.includes("@")) {
      return NextResponse.json({ success: false, error: "O e-mail de destino é obrigatório." }, { status: 400 });
    }

    const setting = await getTenantEmailSettings(session.tenantId);
    if (!setting?.smtpUser?.trim()) {
      return NextResponse.json(
        {
          success: false,
          error:
            "As credenciais de e-mail (Usuário e Senha) não estão configuradas. Acesse Configurações > E-mail para preenchê-las.",
        },
        { status: 400 }
      );
    }
    if (!setting[doc.settingKey]) {
      return NextResponse.json({ success: false, error: doc.disabledMessage }, { status: 400 });
    }

    const fromName = setting.fromName || "Reservas";
    const footerText =
      setting.footerText || "Obrigado por escolher nossa pousada! Em caso de dúvidas, entre em contato conosco.";
    const docFilename = String(filename || doc.defaultFilename);
    const emailSubject = String(subject || `${doc.title} - ${fromName}`).slice(0, 250);

    const attachments: TenantEmailAttachment[] = [];
    if (pdfBase64) {
      const asString = String(pdfBase64);
      const rawBase64 = asString.includes(",") ? asString.split(",")[1] : asString;
      const cleanBase64 = rawBase64.replace(/[\r\n\s]/g, "").trim();
      const pdfBuffer = Buffer.from(cleanBase64, "base64");
      if (pdfBuffer.length > MAX_PDF_BYTES) {
        return NextResponse.json(
          { success: false, error: "O documento em anexo é grande demais para envio." },
          { status: 400 }
        );
      }
      // Garante extensão .pdf válida para visualizadores de PDF de qualquer SO
      const safeFilename = docFilename.toLowerCase().endsWith(".pdf")
        ? docFilename
        : `${docFilename.replace(/\.[^/.]+$/, "")}.pdf`;
      attachments.push({
        filename: safeFilename.replace(/[\\/\r\n]/g, "_"),
        content: pdfBuffer,
        contentType: "application/pdf",
      });
    }

    const safeFromName = escapeHtml(fromName);
    const safeRecipientName = escapeHtml(recipientName || "Prezado(a) Hóspede");
    const safeMessage = message
      ? escapeHtml(String(message))
      : `Segue em anexo o seu <strong>${escapeHtml(doc.title.toLowerCase())}</strong> gerado pelo nosso sistema.`;
    const safeFooterText = escapeHtml(footerText);
    const safeDocFilename = escapeHtml(docFilename.endsWith(".pdf") ? docFilename : `${docFilename}.pdf`);
    const badgeColor = doc.badgeColor;

    const anexoBloco = attachments.length
      ? `
              <div style="background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; margin: 24px 0; text-align: center;">
                <p style="margin: 0 0 6px 0; font-weight: bold; font-size: 13px; color: #0f172a;">
                  Arquivo em anexo (PDF):
                </p>
                <span style="font-family: monospace; font-size: 12px; color: ${badgeColor}; font-weight: bold;">
                  ${safeDocFilename}
                </span>
                <p style="margin: 6px 0 0 0; font-size: 12px; color: #64748b;">
                  Você pode abrir e salvar este arquivo PDF diretamente no seu dispositivo.
                </p>
              </div>
              `
      : "";

    const htmlContent = `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        <div style="background-color: ${badgeColor}; padding: 24px 32px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700; text-transform: uppercase;">${safeFromName}</h1>
          <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.9;">${doc.title}</p>
        </div>

        <div style="padding: 32px; color: #334155; line-height: 1.6;">
          <p style="font-size: 16px; font-weight: 600; margin-top: 0; color: #0f172a;">
            Olá, ${safeRecipientName}!
          </p>

          <p style="font-size: 14px; color: #475569;">
            ${safeMessage}
          </p>

          ${anexoBloco}

          <div style="background-color: #f1f5f9; border-left: 4px solid ${badgeColor}; padding: 12px 16px; margin-top: 24px; border-radius: 0 8px 8px 0; font-size: 13px; color: #475569;">
            ${safeFooterText}
          </div>
        </div>

        <div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px 32px; text-align: center; font-size: 12px; color: #94a3b8;">
          <p style="margin: 0;">Enviado por <strong>${safeFromName}</strong> via Hoteis.Net PMS SaaS.</p>
        </div>
      </div>
    `;

    const result = await sendTenantEmail({
      tenantId: session.tenantId,
      to,
      toName: recipientName || null,
      subject: emailSubject,
      html: htmlContent,
      attachments,
    });

    if (!result.ok) {
      const status = result.reason === "send_error" ? 502 : 400;
      let userFriendlyError = result.message;
      if (
        result.message.includes("530-5.7.0") ||
        result.message.includes("Authentication Required") ||
        result.message.includes("535 5.7.8")
      ) {
        userFriendlyError =
          "Falha de autenticação no servidor de e-mail. Verifique em Configurações > E-mail se o usuário e a senha de aplicativo estão corretos.";
      } else if (result.message.includes("ECONNREFUSED") || result.message.includes("ETIMEDOUT")) {
        userFriendlyError =
          "Não foi possível conectar ao servidor de e-mail. Verifique o servidor e a porta informados em Configurações > E-mail.";
      }
      return NextResponse.json({ success: false, error: userFriendlyError }, { status });
    }

    return NextResponse.json({
      success: true,
      message: `${doc.title} enviado com sucesso para ${to}!`,
    });
  } catch (error: any) {
    console.error("[Email Send Error]", error);
    return NextResponse.json({ success: false, error: "Erro ao enviar e-mail." }, { status: 500 });
  }
}

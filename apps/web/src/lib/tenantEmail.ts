// Envio server-to-server de e-mail usando as credenciais SMTP do próprio tenant (EmailSetting),
// no mesmo espírito de lib/uazapi.ts para o WhatsApp: a rota resolve o destinatário e o assunto,
// e este helper cuida de carregar as credenciais do banco (nunca do body — CLAUDE.md, Segurança §7)
// e disparar via nodemailer.
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { isBlockedSmtpHost } from "@/lib/htmlEscape";

export type TenantEmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "not_configured" | "blocked_host" | "send_error"; message: string };

interface SendTenantEmailArgs {
  tenantId: string;
  to: string;
  toName?: string | null;
  subject: string;
  /** Corpo HTML já montado e com todo texto livre de usuário/hóspede escapado pelo chamador. */
  html: string;
}

export async function sendTenantEmail({ tenantId, to, toName, subject, html }: SendTenantEmailArgs): Promise<TenantEmailResult> {
  if (!to?.trim()) {
    return { ok: false, reason: "not_configured", message: "Sem e-mail de destino." };
  }

  const setting = await prisma.emailSetting.findUnique({
    where: { tenantId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpPass: true,
      fromName: true,
      fromEmail: true,
    },
  });

  if (!setting?.smtpUser?.trim() || !setting?.smtpPass?.trim()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "As credenciais de e-mail (SMTP) do hotel não estão configuradas em Configurações.",
    };
  }

  const host = (setting.smtpHost || "smtp.gmail.com").trim();
  if (isBlockedSmtpHost(host)) {
    return { ok: false, reason: "blocked_host", message: "Servidor SMTP inválido." };
  }

  const isSecure = setting.smtpSecure === "ssl" || Number(setting.smtpPort) === 465;
  const transporter = nodemailer.createTransport({
    host,
    port: Number(setting.smtpPort || 587),
    secure: isSecure,
    auth: { user: setting.smtpUser.trim(), pass: setting.smtpPass.trim() },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 12000,
  });

  try {
    const fromName = setting.fromName || "Reservas";
    const fromEmail = setting.fromEmail || setting.smtpUser;
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to: toName?.trim() ? `"${toName.trim()}" <${to.trim()}>` : to.trim(),
      subject,
      html,
    });
    return { ok: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("[sendTenantEmail] Falha no envio:", error?.message || error);
    return { ok: false, reason: "send_error", message: error?.message || "Falha ao enviar o e-mail." };
  }
}

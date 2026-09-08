import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { sendPlatformText, sendPlatformMedia, platformWhatsAppConfigured } from "@/lib/platformWhatsApp";

const KINDS = ["TEXT", "DOCUMENT", "AUDIO"] as const;
const TENANT_STATUSES = ["TRIAL", "ACTIVE", "OVERDUE", "SUSPENDED", "CANCELLED"];
const MAX_RECIPIENTS = 300;

interface Recipient { phone: string; label: string; tenantId: string | null; userId: string | null; }

// GET /api/admin/messages — histórico de envios. ?tenantId= ?page=. Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { searchParams } = new URL(req.url);
  const tenantId = searchParams.get("tenantId") || undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 30;
  const where = tenantId ? { tenantId } : {};

  const [total, logs] = await Promise.all([
    prisma.platformMessageLog.count({ where }),
    prisma.platformMessageLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, tenantId: true, targetPhone: true, targetLabel: true, kind: true, body: true,
        mediaFilename: true, batchId: true, status: true, error: true, sentByName: true, createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ success: true, page, pageSize, total, configured: platformWhatsAppConfigured(), logs });
}

// POST /api/admin/messages — envia WhatsApp a assinante(s). Edição: PLATFORM_ADMIN / SUPER_ADMIN.
// body: { scope: "user"|"tenant"|"segment", userId?, tenantId?, segment?: { plan?, status? },
//         kind, text?, mediaBase64?, mediaFilename? }
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const kind = (KINDS as readonly string[]).includes(body.kind) ? (body.kind as (typeof KINDS)[number]) : "TEXT";
  const text = String(body.text || "").trim();
  const mediaBase64 = typeof body.mediaBase64 === "string" ? body.mediaBase64 : "";
  const mediaFilename = String(body.mediaFilename || "").trim() || undefined;

  if (kind === "TEXT" && !text) return NextResponse.json({ success: false, error: "Mensagem vazia." }, { status: 400 });
  if (kind !== "TEXT" && !mediaBase64.startsWith("data:")) {
    return NextResponse.json({ success: false, error: "Anexo obrigatório (envie um arquivo)." }, { status: 400 });
  }

  // --- Resolve destinatários ---
  const recipients: Recipient[] = [];
  const scope = body.scope;

  if (scope === "user") {
    const user = await prisma.user.findFirst({
      where: { id: String(body.userId || ""), active: true, tenantId: { not: null } },
      select: { id: true, name: true, phone: true, tenantId: true, tenant: { select: { phone: true, name: true, tradeName: true } } },
    });
    if (!user) return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });
    const phone = (user.phone || user.tenant?.phone || "").replace(/\D/g, "");
    if (!phone) return NextResponse.json({ success: false, error: "Nem o usuário nem o hotel têm telefone cadastrado." }, { status: 400 });
    recipients.push({ phone, label: `${user.name} (${user.tenant?.tradeName || user.tenant?.name})`, tenantId: user.tenantId, userId: user.id });
  } else if (scope === "tenant") {
    const t = await prisma.tenant.findUnique({ where: { id: String(body.tenantId || "") }, select: { id: true, name: true, tradeName: true, phone: true } });
    if (!t) return NextResponse.json({ success: false, error: "Assinante não encontrado." }, { status: 404 });
    const phone = (t.phone || "").replace(/\D/g, "");
    if (!phone) return NextResponse.json({ success: false, error: "Este assinante não tem telefone cadastrado." }, { status: 400 });
    recipients.push({ phone, label: t.tradeName || t.name, tenantId: t.id, userId: null });
  } else if (scope === "segment") {
    const seg = body.segment || {};
    const where: Record<string, unknown> = { phone: { not: null } };
    if (seg.status && TENANT_STATUSES.includes(String(seg.status))) where.status = seg.status;
    if (seg.plan) where.subscriptions = { some: { active: true, plan: { name: String(seg.plan) } } };
    const list = await prisma.tenant.findMany({
      where,
      select: { id: true, name: true, tradeName: true, phone: true },
      take: MAX_RECIPIENTS + 1,
    });
    if (list.length > MAX_RECIPIENTS) {
      return NextResponse.json({ success: false, error: `Segmento tem mais de ${MAX_RECIPIENTS} destinatários. Refine o filtro.` }, { status: 400 });
    }
    for (const t of list) {
      const phone = (t.phone || "").replace(/\D/g, "");
      if (phone) recipients.push({ phone, label: t.tradeName || t.name, tenantId: t.id, userId: null });
    }
  } else {
    return NextResponse.json({ success: false, error: "Escopo inválido." }, { status: 400 });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ success: false, error: "Nenhum destinatário com telefone." }, { status: 400 });
  }

  // Prévia: só devolve quem receberia, sem enviar nada.
  if (body.dryRun) {
    return NextResponse.json({
      success: true,
      dryRun: true,
      configured: platformWhatsAppConfigured(),
      count: recipients.length,
      sample: recipients.slice(0, 20).map((r) => r.label),
    });
  }

  if (!platformWhatsAppConfigured()) {
    return NextResponse.json({ success: false, error: "Instância WhatsApp da plataforma não configurada (UAZAPI_FALLBACK_*)." }, { status: 400 });
  }

  // --- Envia + registra ---
  const batchId = recipients.length > 1 ? randomUUID() : null;
  let sent = 0;
  let failed = 0;

  for (const r of recipients) {
    const res =
      kind === "TEXT"
        ? await sendPlatformText(r.phone, text)
        : await sendPlatformMedia(r.phone, mediaBase64, kind === "DOCUMENT" ? "document" : "audio", { filename: mediaFilename, caption: text || undefined });

    if (res.ok) sent++;
    else failed++;

    await prisma.platformMessageLog.create({
      data: {
        tenantId: r.tenantId,
        targetUserId: r.userId,
        targetPhone: r.phone,
        targetLabel: r.label,
        kind,
        body: text || null,
        mediaFilename: mediaFilename || null,
        batchId,
        status: res.ok ? "SENT" : "FAILED",
        error: res.ok ? null : (res.error || "").slice(0, 300),
        sentById: session!.userId,
        sentByName: session!.name,
      },
    });

    if (recipients.length > 1) await new Promise((rr) => setTimeout(rr, 350)); // não martelar a uazapi
  }

  await logPlatformAction({
    req,
    session: session!,
    action: recipients.length > 1 ? "MESSAGE_BROADCAST" : "MESSAGE_DIRECT",
    description: `Mensagem ${kind} — ${sent} enviada(s), ${failed} falha(s) (escopo ${scope}).`,
    targetTenantId: recipients.length === 1 ? recipients[0].tenantId : null,
    entityType: "PlatformMessageLog",
    details: { scope, kind, sent, failed, batchId },
  });

  return NextResponse.json({ success: true, sent, failed, total: recipients.length, batchId });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

// PATCH /api/admin/support/docs/[id] — edita/ativa/desativa. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: { title?: string; category?: string; content?: string; active?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const data: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return NextResponse.json({ success: false, error: "Título não pode ficar vazio." }, { status: 400 });
    data.title = t.slice(0, 200);
  }
  if (body.category !== undefined) data.category = String(body.category).trim() || "Geral";
  if (body.content !== undefined) {
    const co = String(body.content).trim();
    if (!co) return NextResponse.json({ success: false, error: "Conteúdo não pode ficar vazio." }, { status: 400 });
    data.content = co;
  }
  if (body.active !== undefined) data.active = !!body.active;

  const updated = await prisma.platformSupportDoc.update({ where: { id }, data, select: { title: true } }).catch(() => null);
  if (!updated) return NextResponse.json({ success: false, error: "Artigo não encontrado." }, { status: 404 });

  await logPlatformAction({
    req,
    session: session!,
    action: "SUPPORT_DOC_UPDATE",
    description: `Artigo de suporte "${updated.title}": ${Object.keys(data).join(", ")}`,
    entityType: "PlatformSupportDoc",
    entityId: id,
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const doc = await prisma.platformSupportDoc.delete({ where: { id }, select: { title: true } }).catch(() => null);
  if (!doc) return NextResponse.json({ success: false, error: "Artigo não encontrado." }, { status: 404 });

  await logPlatformAction({
    req,
    session: session!,
    action: "SUPPORT_DOC_DELETE",
    description: `Artigo de suporte excluído: ${doc.title}`,
    entityType: "PlatformSupportDoc",
    entityId: id,
  });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";

// GET /api/admin/support/docs — base de conhecimento global do produto (o agente de IA de suporte
// lê os artigos ACTIVE). Leitura: qualquer papel de plataforma.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const docs = await prisma.platformSupportDoc.findMany({
    orderBy: [{ active: "desc" }, { category: "asc" }, { title: "asc" }],
    select: { id: true, title: true, category: true, content: true, active: true, source: true, updatedAt: true },
  });
  return NextResponse.json({ success: true, docs });
}

// POST /api/admin/support/docs — cria um artigo. Edição: PLATFORM_ADMIN / SUPER_ADMIN.
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: { title?: string; category?: string; content?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }
  const title = String(body.title || "").trim();
  const content = String(body.content || "").trim();
  if (!title || !content) {
    return NextResponse.json({ success: false, error: "Título e conteúdo são obrigatórios." }, { status: 400 });
  }

  const doc = await prisma.platformSupportDoc.create({
    data: { title: title.slice(0, 200), category: String(body.category || "Geral").trim() || "Geral", content },
    select: { id: true, title: true },
  });
  await logPlatformAction({
    req,
    session: session!,
    action: "SUPPORT_DOC_CREATE",
    description: `Artigo de suporte criado: ${doc.title}`,
    entityType: "PlatformSupportDoc",
    entityId: doc.id,
  });
  return NextResponse.json({ success: true, id: doc.id });
}

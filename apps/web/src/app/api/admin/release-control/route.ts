import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

// GET/POST /api/admin/release-control — restrito a SUPER_ADMIN (painel do admin master).
//
// Permite forçar que a versão que já está no ar seja tratada como CRÍTICA em todos os terminais
// (tela bloqueante após inatividade — ver components/AppVersionGate.tsx), sem precisar de um novo
// deploy. É a segunda forma de marcar "crítico"; a primeira é a flag `critical` do
// apps/web/src/release.json, decidida no commit.
//
// AppReleaseControl é uma linha única (id fixo "singleton"). `forceCriticalBuildId` guarda o
// build id que todos devem alcançar: enquanto o navegador do operador estiver numa versão
// diferente dessa, GET /api/version devolve critical=true. Auditoria fica no próprio registro
// (updatedByName / updatedAt) — a tabela AuditLog é sempre por-tenant e esta ação é global.

export const dynamic = "force-dynamic";

const SINGLETON_ID = "singleton";

function currentBuildId(): string {
  return (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || process.env.NEXT_PUBLIC_BUILD_ID || "dev";
}

async function requireSuperAdmin(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session || session.role !== "SUPER_ADMIN") {
    return { error: NextResponse.json({ success: false, error: "Ação restrita ao SuperAdmin." }, { status: 403 }) };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  const row = await prisma.appReleaseControl.findUnique({
    where: { id: SINGLETON_ID },
    select: { forceCriticalBuildId: true, criticalMessage: true, updatedByName: true, updatedAt: true },
  });

  const buildId = currentBuildId();
  return NextResponse.json({
    success: true,
    buildId,
    forceActive: !!row?.forceCriticalBuildId,
    // "Ativo e alinhado" = o override aponta para a versão que está no ar agora.
    forceMatchesCurrent: !!row?.forceCriticalBuildId && row.forceCriticalBuildId === buildId,
    forceCriticalBuildId: row?.forceCriticalBuildId ?? null,
    criticalMessage: row?.criticalMessage ?? "",
    updatedByName: row?.updatedByName ?? null,
    updatedAt: row?.updatedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin(req);
  if (auth.error) return auth.error;

  let body: { action?: string; message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const action = body.action;
  if (action !== "force" && action !== "clear") {
    return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
  }

  const updatedByName = auth.session.name || "SuperAdmin";

  if (action === "force") {
    const buildId = currentBuildId();
    const message = (body.message || "").trim().slice(0, 300) || null;
    await prisma.appReleaseControl.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, forceCriticalBuildId: buildId, criticalMessage: message, updatedByName },
      update: { forceCriticalBuildId: buildId, criticalMessage: message, updatedByName },
    });
    return NextResponse.json({ success: true, forceCriticalBuildId: buildId });
  }

  // clear
  await prisma.appReleaseControl.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID, forceCriticalBuildId: null, criticalMessage: null, updatedByName },
    update: { forceCriticalBuildId: null, criticalMessage: null, updatedByName },
  });
  return NextResponse.json({ success: true });
}

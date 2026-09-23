import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformRole, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { municipalitySelect, parseMunicipalityInput } from "@/lib/municipality";

// GET /api/admin/municipios — lista paginada da tabela GLOBAL de municípios (IBGE), compartilhada
// por todos os assinantes (FNRH/SNRHos, NFC-e). Leitura: qualquer papel da plataforma.
// Filtros: q (nome ou código IBGE), uf, page, pageSize (máx. 100). Nunca devolve a tabela inteira
// (~5.570 linhas) — CLAUDE.md, ⚡ Performance §5.
export async function GET(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = requirePlatformRole(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  const uf = (searchParams.get("uf") || "").trim().toUpperCase();
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10) || 50));

  const where: Record<string, unknown> = {};
  if (/^[A-Z]{2}$/.test(uf)) where.uf = uf;
  if (q) {
    where.OR = /^\d+$/.test(q)
      ? [{ ibgeCode: { startsWith: q } }]
      : [{ name: { contains: q, mode: "insensitive" } }];
  }

  const [municipalities, total] = await Promise.all([
    prisma.municipality.findMany({
      where,
      orderBy: [{ uf: "asc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: municipalitySelect,
    }),
    prisma.municipality.count({ where }),
  ]);

  return NextResponse.json({
    success: true,
    municipalities,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}

// POST /api/admin/municipios — inclui um município. Edição: PLATFORM_ADMIN / SUPER_ADMIN (com 2FA).
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const parsed = parseMunicipalityInput(body, { partial: false });
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  try {
    const municipality = await prisma.municipality.create({
      data: parsed.data as { name: string; ibgeCode: string; uf: string; dddCode: string | null },
      select: municipalitySelect,
    });
    await logPlatformAction({
      req,
      session: session!,
      action: "MUNICIPALITY_CREATE",
      description: `${session!.name} incluiu o município ${municipality.name}/${municipality.uf} (IBGE ${municipality.ibgeCode}).`,
      entityType: "Municipality",
      entityId: municipality.id,
    });
    return NextResponse.json({ success: true, municipality }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um município com esse código IBGE." }, { status: 409 });
    }
    console.error("[POST /api/admin/municipios] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao incluir município." }, { status: 500 });
  }
}

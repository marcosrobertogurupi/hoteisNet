import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";

// GET /api/cadastros/municipios
// Suporta: q (busca por nome, UF ou código IBGE), page, pageSize.
// Lista global (não isolada por tenant) — todo assinante consulta a mesma tabela de referência.
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get("pageSize") || "50", 10)));
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (q.trim()) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { uf: { contains: q, mode: "insensitive" } },
        { ibgeCode: { contains: q, mode: "insensitive" } },
      ];
    }

    const [municipalities, total] = await Promise.all([
      prisma.municipality.findMany({ where, orderBy: { name: "asc" }, skip, take: pageSize }),
      prisma.municipality.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      municipalities,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error: any) {
    console.error("[GET /api/cadastros/municipios] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao buscar municípios." }, { status: 500 });
  }
}

// POST /api/cadastros/municipios — restrito a administradores, pois altera uma tabela de
// referência compartilhada por todos os assinantes.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await request.json();
    const { name, ibgeCode, uf, dddCode } = body;

    if (!name || !String(name).trim()) {
      return NextResponse.json({ success: false, error: "Nome do município é obrigatório." }, { status: 400 });
    }
    if (!ibgeCode || !/^\d{7}$/.test(String(ibgeCode).trim())) {
      return NextResponse.json({ success: false, error: "Código IBGE deve ter 7 dígitos." }, { status: 400 });
    }
    if (!uf || !/^[A-Z]{2}$/.test(String(uf).trim().toUpperCase())) {
      return NextResponse.json({ success: false, error: "UF inválida (use a sigla de 2 letras)." }, { status: 400 });
    }

    const municipality = await prisma.municipality.create({
      data: {
        name: String(name).trim().toUpperCase(),
        ibgeCode: String(ibgeCode).trim(),
        uf: String(uf).trim().toUpperCase(),
        dddCode: dddCode ? String(dddCode).trim() : null,
      },
    });

    await logActivity({
      tenantId: session!.tenantId || "PLATFORM",
      userId: session!.userId,
      userName: session!.name,
      action: "MUNICIPALITY_CREATE",
      description: `${session!.name} cadastrou o município ${municipality.name}/${municipality.uf}.`,
      entityType: "Municipality",
      entityId: municipality.id,
      terminal: getTerminalName(request),
      ipAddress: getClientIp(request),
    });

    return NextResponse.json({ success: true, municipality }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/municipios] Erro:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um município com esse código IBGE." }, { status: 409 });
    }
    return NextResponse.json({ success: false, error: "Erro ao cadastrar município." }, { status: 500 });
  }
}

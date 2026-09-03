import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, getClientIp, getTerminalName } from "@/lib/auth";
import { logActivity } from "@/lib/audit";
import { generateTerminalToken } from "@/lib/pdvTerminalToken";

// Cadastro de caixas do restaurante (PdvTerminal). Cada caixa = um PC Windows com o agente
// fiscal .NET e uma impressora térmica. O token de autenticação do agente é gerado na criação
// e devolvido UMA ÚNICA VEZ (depois só o hash fica no banco). Regenerar: POST /[id]/token.

function serializeTerminal(t: {
  id: string;
  name: string;
  nfceSeries: number;
  nfeSeries: number;
  active: boolean;
  printerModel: string | null;
  printerPort: string | null;
  lastHeartbeat: Date | null;
  agentVersion: string | null;
  sefazStatus: string | null;
  tokenVersion: number;
  apiTokenHash: string | null;
  createdAt: Date;
}) {
  return {
    id: t.id,
    nome: t.name,
    serieNfce: t.nfceSeries,
    serieNfe: t.nfeSeries,
    ativo: t.active,
    impressoraModelo: t.printerModel,
    impressoraPorta: t.printerPort,
    ultimoHeartbeat: t.lastHeartbeat,
    versaoAgente: t.agentVersion,
    statusSefaz: t.sefazStatus,
    tokenConfigurado: !!t.apiTokenHash,
    tokenVersion: t.tokenVersion,
    criadoEm: t.createdAt,
  };
}

const TERMINAL_SELECT = {
  id: true,
  name: true,
  nfceSeries: true,
  nfeSeries: true,
  active: true,
  printerModel: true,
  printerPort: true,
  lastHeartbeat: true,
  agentVersion: true,
  sefazStatus: true,
  tokenVersion: true,
  apiTokenHash: true,
  createdAt: true,
} as const;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const terminals = await prisma.pdvTerminal.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: TERMINAL_SELECT,
    });

    return NextResponse.json({ success: true, terminais: terminals.map(serializeTerminal) });
  } catch (error: any) {
    console.error("[GET /api/pdv/terminais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { nome, serieNfce, serieNfe, impressoraModelo, impressoraPorta } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do caixa é obrigatório." }, { status: 400 });
    }

    // Série padrão sugerida pela configuração fiscal, se o cadastro não informar.
    const fiscalConfig = await prisma.fiscalConfig.findUnique({
      where: { tenantId: session!.tenantId! },
      select: { defaultNfceSeries: true, defaultNfeSeries: true },
    });

    const { token, tokenHash } = generateTerminalToken();

    const created = await prisma.pdvTerminal.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        nfceSeries: Math.max(1, Math.trunc(Number(serieNfce) || fiscalConfig?.defaultNfceSeries || 1)),
        nfeSeries: Math.max(1, Math.trunc(Number(serieNfe) || fiscalConfig?.defaultNfeSeries || 1)),
        printerModel: impressoraModelo ? String(impressoraModelo).trim() : null,
        printerPort: impressoraPorta ? String(impressoraPorta).trim() : null,
        apiTokenHash: tokenHash,
      },
      select: TERMINAL_SELECT,
    });

    await logActivity({
      tenantId: session!.tenantId!,
      userId: session!.userId,
      userName: session!.name,
      action: "PDV_TERMINAL_CREATE",
      description: `${session!.name} cadastrou o caixa "${created.name}" no PDV do restaurante.`,
      entityType: "PDV_TERMINAL",
      entityId: created.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json(
      // token em claro só nesta resposta — nunca mais é recuperável
      { success: true, terminal: serializeTerminal(created), token },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("[POST /api/pdv/terminais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nome, serieNfce, serieNfe, impressoraModelo, impressoraPorta, ativo } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do caixa é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do caixa é obrigatório." }, { status: 400 });
    }

    const updated = await prisma.pdvTerminal.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data: {
        name: String(nome).trim(),
        nfceSeries: Math.max(1, Math.trunc(Number(serieNfce) || 1)),
        nfeSeries: Math.max(1, Math.trunc(Number(serieNfe) || 1)),
        printerModel: impressoraModelo ? String(impressoraModelo).trim() : null,
        printerPort: impressoraPorta ? String(impressoraPorta).trim() : null,
        active: ativo !== false,
      },
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Caixa não encontrado." }, { status: 404 });
    }

    const terminal = await prisma.pdvTerminal.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: TERMINAL_SELECT,
    });

    return NextResponse.json({ success: true, terminal: terminal ? serializeTerminal(terminal) : null });
  } catch (error: any) {
    console.error("[PUT /api/pdv/terminais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "ID do caixa é obrigatório." }, { status: 400 });
    }

    // Não deixa apagar um caixa que já tem atendimento/documento vinculado — só desativar.
    const linked = await prisma.pdvTerminal.findFirst({
      where: { id, tenantId: session!.tenantId! },
      select: { _count: { select: { comandaSessions: true, fiscalDocuments: true } } },
    });
    if (!linked) {
      return NextResponse.json({ success: false, error: "Caixa não encontrado." }, { status: 404 });
    }
    if (linked._count.comandaSessions > 0 || linked._count.fiscalDocuments > 0) {
      return NextResponse.json(
        { success: false, error: "Este caixa já tem movimento e não pode ser excluído. Desative-o." },
        { status: 409 }
      );
    }

    const deleted = await prisma.pdvTerminal.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Caixa não encontrado." }, { status: 404 });
    }

    await logActivity({
      tenantId: session!.tenantId!,
      userId: session!.userId,
      userName: session!.name,
      action: "PDV_TERMINAL_DELETE",
      description: `${session!.name} excluiu um caixa do PDV do restaurante.`,
      entityType: "PDV_TERMINAL",
      entityId: id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({ success: true, message: "Caixa excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/pdv/terminais] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

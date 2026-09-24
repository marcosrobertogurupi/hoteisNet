import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireTenantAdmin } from "@/lib/auth";
import { ensureMaintenanceDefaults } from "@/lib/maintenance";

// Listas cadastradas da manutenção de quartos, por hotel:
//   /api/cadastros/manutencao/tipos   → tipos de problema (MaintenanceProblemType)
//   /api/cadastros/manutencao/motivos → motivos da etapa "Aguardando" (MaintenanceWaitReason)
// As duas têm a mesma forma (nome + ativo), por isso uma rota só. Leitura para qualquer sessão do
// hotel; inclusão/alteração/exclusão só admin (cadastro mestre).

type Lista = "tipos" | "motivos";

const LABEL: Record<Lista, { singular: string; delegate: "maintenanceProblemType" | "maintenanceWaitReason" }> = {
  tipos: { singular: "tipo de problema", delegate: "maintenanceProblemType" },
  motivos: { singular: "motivo de espera", delegate: "maintenanceWaitReason" },
};

const ITEM_SELECT = { id: true, name: true, active: true } as const;

function parseLista(value: string): Lista | null {
  return value === "tipos" || value === "motivos" ? value : null;
}

// Os dois models têm os mesmos campos — o `any` fica restrito a este ponto de despacho.
function delegateFor(lista: Lista): any {
  return (prisma as any)[LABEL[lista].delegate];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const lista = parseLista((await params).lista);
    if (!lista) return NextResponse.json({ success: false, error: "Lista inválida." }, { status: 404 });

    await ensureMaintenanceDefaults(session.tenantId);
    const items = await delegateFor(lista).findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: ITEM_SELECT,
    });
    return NextResponse.json({ success: true, items });
  } catch (error: any) {
    console.error("[GET /api/cadastros/manutencao] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao carregar a lista." }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const lista = parseLista((await params).lista);
    if (!lista) return NextResponse.json({ success: false, error: "Lista inválida." }, { status: 404 });

    const { name } = await req.json();
    const nome = String(name || "").trim();
    if (!nome) {
      return NextResponse.json({ success: false, error: `Informe o nome do ${LABEL[lista].singular}.` }, { status: 400 });
    }

    const item = await delegateFor(lista).create({
      data: { tenantId: session!.tenantId!, name: nome },
      select: ITEM_SELECT,
    });
    return NextResponse.json({ success: true, item }, { status: 201 });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um item com esse nome." }, { status: 409 });
    }
    console.error("[POST /api/cadastros/manutencao] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const lista = parseLista((await params).lista);
    if (!lista) return NextResponse.json({ success: false, error: "Lista inválida." }, { status: 404 });

    const { id, name, active } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "ID é obrigatório." }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (name !== undefined) {
      const nome = String(name).trim();
      if (!nome) {
        return NextResponse.json({ success: false, error: `Informe o nome do ${LABEL[lista].singular}.` }, { status: 400 });
      }
      data.name = nome;
    }
    if (active !== undefined) data.active = !!active;

    const updated = await delegateFor(lista).updateMany({ where: { id, tenantId: session!.tenantId! }, data });
    if (updated.count === 0) return NextResponse.json({ success: false, error: "Item não encontrado." }, { status: 404 });

    const item = await delegateFor(lista).findFirst({ where: { id, tenantId: session!.tenantId! }, select: ITEM_SELECT });
    return NextResponse.json({ success: true, item });
  } catch (error: any) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um item com esse nome." }, { status: 409 });
    }
    console.error("[PATCH /api/cadastros/manutencao] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao salvar." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lista: string }> }) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireTenantAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const lista = parseLista((await params).lista);
    if (!lista) return NextResponse.json({ success: false, error: "Lista inválida." }, { status: 404 });

    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ success: false, error: "ID é obrigatório." }, { status: 400 });

    const deleted = await delegateFor(lista).deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) return NextResponse.json({ success: false, error: "Item não encontrado." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    // Já usado em alguma OS (FK RESTRICT): o histórico precisa do item — desativar em vez de excluir.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { success: false, error: "Este item já foi usado em ordens de serviço. Desative-o em vez de excluir." },
        { status: 409 },
      );
    }
    console.error("[DELETE /api/cadastros/manutencao] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao excluir." }, { status: 500 });
  }
}

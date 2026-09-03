import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, hashPassword } from "@/lib/auth";

// `select` explícito — nunca traz passwordHash (senha do app de contagem de estoque) para o
// cliente; expõe só `temSenha` para a tela indicar se o colaborador tem acesso ao app.
const EMPLOYEE_SELECT = {
  id: true,
  name: true,
  role: true,
  cpf: true,
  phone: true,
  email: true,
  active: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
} as const;

function serialize(e: {
  id: string;
  name: string;
  role: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  passwordHash: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  const { passwordHash, ...rest } = e;
  return { ...rest, temSenha: !!passwordHash };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const employees = await prisma.employee.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { name: "asc" },
      select: EMPLOYEE_SELECT,
    });
    return NextResponse.json({ success: true, employees: employees.map(serialize) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { nome, cargo, cpf, telefone, email, status, senha } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do colaborador é obrigatório." }, { status: 400 });
    }

    // Senha opcional — só quem tem senha acessa o app de contagem de estoque (login por telefone).
    const senhaTrim = senha ? String(senha).trim() : "";
    if (senhaTrim && senhaTrim.length < 4) {
      return NextResponse.json({ success: false, error: "A senha deve ter ao menos 4 caracteres." }, { status: 400 });
    }
    if (senhaTrim && !String(telefone || "").trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o telefone do colaborador para dar acesso ao app de contagem." },
        { status: 400 }
      );
    }

    const employee = await prisma.employee.create({
      data: {
        tenantId: session!.tenantId!,
        name: String(nome).trim(),
        role: cargo || null,
        cpf: cpf || null,
        phone: telefone || null,
        email: email || null,
        active: status !== "INATIVO",
        passwordHash: senhaTrim ? await hashPassword(senhaTrim) : null,
      },
      select: EMPLOYEE_SELECT,
    });

    return NextResponse.json({ success: true, employee: serialize(employee) }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/colaboradores] Erro ao criar colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const { id, nome, cargo, cpf, telefone, email, status, senha, removerSenha } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID do colaborador é obrigatório." }, { status: 400 });
    }
    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do colaborador é obrigatório." }, { status: 400 });
    }

    const telefoneTrim = String(telefone || "").trim();
    const data: Record<string, unknown> = {
      name: String(nome).trim(),
      role: cargo || null,
      cpf: cpf || null,
      phone: telefone || null,
      email: email || null,
      active: status !== "INATIVO",
    };

    // Senha do app de contagem: `removerSenha` tira o acesso; `senha` (não vazia) define/troca.
    // Trocar a senha zera o bloqueio por tentativas. Sessões já emitidas continuam válidas até
    // expirar (12h) — desativar o colaborador é o corte imediato de acesso (getStockCountUser
    // revalida `active` a cada requisição).
    if (removerSenha === true) {
      data.passwordHash = null;
      data.failedLoginAttempts = 0;
      data.lockedUntil = null;
    } else if (senha !== undefined && senha !== null && String(senha).trim() !== "") {
      const senhaTrim = String(senha).trim();
      if (senhaTrim.length < 4) {
        return NextResponse.json({ success: false, error: "A senha deve ter ao menos 4 caracteres." }, { status: 400 });
      }
      if (!telefoneTrim) {
        return NextResponse.json(
          { success: false, error: "Informe o telefone do colaborador para dar acesso ao app de contagem." },
          { status: 400 }
        );
      }
      data.passwordHash = await hashPassword(senhaTrim);
      data.failedLoginAttempts = 0;
      data.lockedUntil = null;
    }

    const updated = await prisma.employee.updateMany({
      where: { id, tenantId: session!.tenantId! },
      data,
    });
    if (updated.count === 0) {
      return NextResponse.json({ success: false, error: "Colaborador não encontrado." }, { status: 404 });
    }
    const employee = await prisma.employee.findFirst({ where: { id, tenantId: session!.tenantId! }, select: EMPLOYEE_SELECT });

    return NextResponse.json({ success: true, employee: employee ? serialize(employee) : null });
  } catch (error: any) {
    console.error("[PUT /api/cadastros/colaboradores] Erro ao atualizar colaborador:", error);
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
      return NextResponse.json({ success: false, error: "ID do colaborador é obrigatório." }, { status: 400 });
    }

    const deleted = await prisma.employee.deleteMany({ where: { id, tenantId: session!.tenantId! } });
    if (deleted.count === 0) {
      return NextResponse.json({ success: false, error: "Colaborador não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Colaborador excluído com sucesso." });
  } catch (error: any) {
    console.error("[DELETE /api/cadastros/colaboradores] Erro ao excluir colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { OPEN_MAINTENANCE_STAGES } from "@/lib/maintenance";
import { validatePasswordStrength } from "@/lib/passwordPolicy";
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
  maintenanceTech: true,
  passwordHash: true,
  createdAt: true,
  updatedAt: true,
} as const;

const MSG_MANUTENCAO_SEM_SENHA =
  "Defina uma senha para o colaborador de manutenção — é com o telefone e essa senha que ele entra no app de manutenção.";

const MSG_MANUTENCAO_SEM_TELEFONE =
  "Informe o WhatsApp do colaborador de manutenção — é por ele que chega o aviso das ordens de serviço.";

function serialize(e: {
  id: string;
  name: string;
  role: string | null;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  active: boolean;
  maintenanceTech: boolean;
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
    const { nome, cargo, cpf, telefone, email, status, senha, manutencao } = body;

    if (!nome || !String(nome).trim()) {
      return NextResponse.json({ success: false, error: "O nome do colaborador é obrigatório." }, { status: 400 });
    }
    if (manutencao === true && !String(telefone || "").trim()) {
      return NextResponse.json({ success: false, error: MSG_MANUTENCAO_SEM_TELEFONE }, { status: 400 });
    }

    // Senha opcional — só quem tem senha acessa o app de contagem de estoque (login por telefone).
    const senhaTrim = senha ? String(senha).trim() : "";
    const senhaFraca = senhaTrim ? validatePasswordStrength(senhaTrim) : null;
    if (senhaFraca) {
      return NextResponse.json({ success: false, error: senhaFraca }, { status: 400 });
    }
    if (senhaTrim && !String(telefone || "").trim()) {
      return NextResponse.json(
        { success: false, error: "Informe o telefone do colaborador para dar acesso ao app de contagem." },
        { status: 400 }
      );
    }
    if (manutencao === true && !senhaTrim) {
      return NextResponse.json({ success: false, error: MSG_MANUTENCAO_SEM_SENHA }, { status: 400 });
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
        maintenanceTech: manutencao === true,
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
    const { id, nome, cargo, cpf, telefone, email, status, senha, removerSenha, manutencao } = body;

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

    // Colaborador de manutenção: precisa de WhatsApp (é por ele que recebe o aviso da OS). Não pode
    // deixar de atender manutenção, ser desativado nem perder o telefone com OS aberta no nome dele —
    // a OS ficaria sem ninguém para dar continuidade. O admin reatribui antes.
    if (manutencao !== undefined) data.maintenanceTech = manutencao === true;
    if (manutencao === true && !telefoneTrim) {
      return NextResponse.json({ success: false, error: MSG_MANUTENCAO_SEM_TELEFONE }, { status: 400 });
    }
    if (manutencao === false || status === "INATIVO" || !telefoneTrim) {
      const openTicket = await prisma.maintenanceTicket.findFirst({
        where: { tenantId: session!.tenantId!, assignedEmployeeId: String(id), stage: { in: OPEN_MAINTENANCE_STAGES } },
        select: { number: true },
      });
      if (openTicket) {
        return NextResponse.json(
          {
            success: false,
            error: `Este colaborador está com a OS de manutenção nº ${openTicket.number} aberta. Passe a OS para outro colaborador antes de desativá-lo, tirar a manutenção ou remover o telefone.`,
          },
          { status: 409 }
        );
      }
    }

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
      const senhaFraca = validatePasswordStrength(senhaTrim);
      if (senhaFraca) {
        return NextResponse.json({ success: false, error: senhaFraca }, { status: 400 });
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

    // Colaborador de manutenção precisa de senha: é com ela que ele entra no app /manutencao para
    // dar andamento às OS. Vale a senha nova ou a que já existe (sem remover).
    if (manutencao === true) {
      const current = await prisma.employee.findFirst({
        where: { id: String(id), tenantId: session!.tenantId! },
        select: { passwordHash: true },
      });
      const willHavePassword = removerSenha === true ? false : !!data.passwordHash || !!current?.passwordHash;
      if (!willHavePassword) {
        return NextResponse.json({ success: false, error: MSG_MANUTENCAO_SEM_SENHA }, { status: 400 });
      }
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
    // Colaborador com OS de manutenção no histórico (FK RESTRICT): o registro de quem atendeu cada
    // OS precisa ficar — desativar em vez de excluir.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return NextResponse.json(
        { success: false, error: "Este colaborador tem histórico de manutenção. Desative-o em vez de excluir." },
        { status: 409 }
      );
    }
    console.error("[DELETE /api/cadastros/colaboradores] Erro ao excluir colaborador:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

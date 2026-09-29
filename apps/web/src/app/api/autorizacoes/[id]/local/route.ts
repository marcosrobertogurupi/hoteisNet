import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUser,
  getClientIp,
  verifyPasswordTimingSafe,
  isAccountLocked,
  nextFailedLoginState,
} from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";
import { logAuthorizationDecision } from "@/lib/criticalAuth";

const GENERIC_AUTH_ERROR = "Autorizador ou senha inválidos.";
const NOT_PENDING_ERROR = "Esta solicitação não está mais aguardando autorização. Refaça a operação.";

// POST /api/autorizacoes/[id]/local — "Autorizar aqui": o autorizador escolhido digita a senha no
// próprio terminal. Marca a solicitação como APROVADA; a tela então reenvia a ação com o id, e a
// rota da ação consome a autorização (lib/criticalAuth.ts). A senha NUNCA volta para a tela.
//
// Anti-força-bruta (CLAUDE.md §8): rate limit por IP, comparação timing-safe e bloqueio da conta
// após tentativas repetidas — os mesmos helpers do login. O autorizador é buscado já filtrado por
// session.tenantId e isAuthorizer (§2/§4): um usuário de outro hotel nunca autoriza nada aqui.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;
    const { id } = await params;
    const body = await req.json();
    const authorizerId = String(body.autorizadorId || "");
    const password = String(body.senha || "");
    const justification = String(body.justificativa || "").trim().slice(0, 500);

    if (!authorizerId || !password) {
      return NextResponse.json({ success: false, error: "Escolha o autorizador e informe a senha." }, { status: 400 });
    }
    if (justification.length < 3) {
      return NextResponse.json({ success: false, error: "Informe a justificativa do pedido." }, { status: 400 });
    }

    const rate = await checkRateLimit(`critical-auth:${getClientIp(req)}`, { max: 5, windowMs: 60_000 });
    if (!rate.allowed) {
      return NextResponse.json(
        { success: false, error: `Muitas tentativas. Tente novamente em ${rate.retryAfterSeconds}s.` },
        { status: 429 }
      );
    }

    const request = await prisma.criticalAuthorization.findFirst({
      where: { id, tenantId, requestedById: session.userId },
      select: { status: true, expiresAt: true, summary: true },
    });
    if (!request) return NextResponse.json({ success: false, error: "Solicitação não encontrada." }, { status: 404 });
    if (request.status !== "PENDENTE" || request.expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ success: false, error: NOT_PENDING_ERROR }, { status: 409 });
    }

    const user = await prisma.user.findFirst({
      where: { id: authorizerId, tenantId },
      select: {
        id: true,
        name: true,
        active: true,
        isAuthorizer: true,
        passwordHash: true,
        failedLoginAttempts: true,
        lockedUntil: true,
      },
    });
    // Sempre compara a senha, mesmo sem usuário, para o tempo de resposta não denunciar nada.
    const validPassword = await verifyPasswordTimingSafe(password, user?.passwordHash);
    if (!user || !user.active || !user.isAuthorizer || isAccountLocked(user.lockedUntil)) {
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (!validPassword) {
      await prisma.user.update({
        where: { id: user.id },
        data: nextFailedLoginState(user.failedLoginAttempts),
        select: { id: true },
      });
      return NextResponse.json({ success: false, error: GENERIC_AUTH_ERROR }, { status: 401 });
    }
    if (user.failedLoginAttempts > 0) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
        select: { id: true },
      });
    }

    const approved = await prisma.criticalAuthorization.updateMany({
      where: { id, tenantId, status: "PENDENTE", expiresAt: { gt: new Date() } },
      data: {
        status: "APROVADA",
        justification,
        decidedById: user.id,
        decidedByName: user.name,
        decisionChannel: "LOCAL",
        decidedAt: new Date(),
        decidedIp: getClientIp(req),
      },
    });
    if (approved.count === 0) {
      return NextResponse.json({ success: false, error: NOT_PENDING_ERROR }, { status: 409 });
    }

    await logAuthorizationDecision(req, tenantId, {
      id,
      decidedBy: { id: user.id, name: user.name },
      action: "CRITICAL_AUTH_APPROVE",
      description: `${user.name} autorizou no terminal (pedido de ${session.name}): ${request.summary}`,
    });

    return NextResponse.json({ success: true, autorizadoPor: user.name });
  } catch (error) {
    console.error("[POST /api/autorizacoes/[id]/local] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao autorizar." }, { status: 500 });
  }
}

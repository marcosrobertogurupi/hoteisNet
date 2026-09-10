import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession } from "@/lib/auth";
import { generateTotpSecret, totpUri, verifyTotp } from "@/lib/totp";
import { logPlatformAction } from "@/lib/platformAudit";
import { encryptSecret, decryptSecret } from "@/lib/secretBox";

// POST /api/admin/auth/mfa — 2FA da própria conta no painel.
//   { action: "setup" }          → gera um segredo pendente e devolve { secret, uri }
//   { action: "enable", code }   → confirma o segredo pendente com um código válido → mfaEnabled
//   { action: "disable", code }  → desliga o 2FA (exige um código válido)
export async function POST(req: NextRequest) {
  const session = await getPlatformSession(req);
  if (!session) return NextResponse.json({ success: false, error: "Sessão inválida." }, { status: 401 });

  let body: { action?: string; code?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, mfaSecret: true, mfaEnabled: true },
  });
  if (!user) return NextResponse.json({ success: false, error: "Usuário não encontrado." }, { status: 404 });

  if (body.action === "setup") {
    if (user.mfaEnabled) return NextResponse.json({ success: false, error: "2FA já está ativo." }, { status: 409 });
    const secret = generateTotpSecret();
    await prisma.user.update({ where: { id: user.id }, data: { mfaSecret: encryptSecret(secret) } });
    return NextResponse.json({ success: true, secret, uri: totpUri(secret, user.email) });
  }

  if (body.action === "enable") {
    const pendingSecret = decryptSecret(user.mfaSecret);
    if (!pendingSecret) return NextResponse.json({ success: false, error: "Gere o segredo primeiro (setup)." }, { status: 400 });
    if (!verifyTotp(pendingSecret, String(body.code || ""))) {
      return NextResponse.json({ success: false, error: "Código inválido — confira o horário do celular e tente de novo." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true } });
    await logPlatformAction({ req, session, action: "MFA_ENABLED", description: `${session.name} ativou o 2FA.`, entityType: "User", entityId: user.id });
    return NextResponse.json({ success: true });
  }

  if (body.action === "disable") {
    if (!user.mfaEnabled) return NextResponse.json({ success: false, error: "2FA não está ativo." }, { status: 409 });
    const activeSecret = decryptSecret(user.mfaSecret);
    if (!activeSecret || !verifyTotp(activeSecret, String(body.code || ""))) {
      return NextResponse.json({ success: false, error: "Código inválido." }, { status: 400 });
    }
    await prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: false, mfaSecret: null } });
    await logPlatformAction({ req, session, action: "MFA_DISABLED", description: `${session.name} desativou o 2FA.`, entityType: "User", entityId: user.id });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: false, error: "Ação inválida." }, { status: 400 });
}

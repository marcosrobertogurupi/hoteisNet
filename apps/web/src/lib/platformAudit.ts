import { prisma } from "@/lib/prisma";
import { getClientIp } from "@/lib/auth";
import type { NextRequest } from "next/server";

// Ator da ação — funciona tanto com a sessão do painel (PlatformSessionPayload) quanto com a
// sessão do app (SessionPayload); ambas têm userId/name/role.
type AuditActor = { userId: string; name: string; role: string };

// Grava uma linha na trilha de auditoria GLOBAL da plataforma (painel /admin). Distinta do
// AuditLog por-tenant — aqui fica o que a equipe do SaaS faz no back-office (trocar plano,
// editar prompt de IA, suspender/impersonar assinante, enviar broadcast).
//
// Nunca lança: uma falha de auditoria não pode derrubar a ação em si. O caller passa a sessão
// já validada (getSessionUser) e a request, para capturarmos ator e IP.
export async function logPlatformAction(params: {
  req: NextRequest;
  session: AuditActor;
  action: string;
  description?: string;
  targetTenantId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  details?: unknown;
}): Promise<void> {
  try {
    await prisma.platformAuditLog.create({
      data: {
        actorId: params.session.userId,
        actorName: params.session.name,
        actorRole: params.session.role,
        action: params.action,
        description: params.description ?? null,
        targetTenantId: params.targetTenantId ?? null,
        entityType: params.entityType ?? null,
        entityId: params.entityId ?? null,
        ipAddress: getClientIp(params.req),
        details: (params.details ?? undefined) as never,
      },
    });
  } catch (err) {
    console.error("[platformAudit] falha ao registrar ação:", params.action, err);
  }
}

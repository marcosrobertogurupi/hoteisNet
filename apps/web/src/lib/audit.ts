import { prisma } from "@/lib/prisma";

export interface LogActivityInput {
  tenantId: string;
  userId?: string | null;
  userName?: string | null;
  action: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  terminal?: string;
  ipAddress?: string;
  details?: Record<string, unknown>;
}

// Registra uma entrada na trilha de auditoria (tabela tenant_activity_logs / model AuditLog).
// Nunca deve derrubar a operação principal — uma falha aqui só é logada no console.
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId || null,
        userName: input.userName || null,
        action: input.action,
        description: input.description || null,
        entityType: input.entityType || null,
        entityId: input.entityId || null,
        terminal: input.terminal || null,
        ipAddress: input.ipAddress || null,
        details: input.details ? (input.details as any) : undefined,
      },
    });
  } catch (error) {
    console.error("[logActivity] Falha ao gravar auditoria:", error);
  }
}

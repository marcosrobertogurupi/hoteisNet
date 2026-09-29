import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getClientIp, getTerminalName, type SessionPayload } from "@/lib/auth";

// Autorização de eventos críticos (desconto acima do limite, anulação de lançamento no caixa…).
//
// Fluxo:
//  1. A rota que executa a ação chama gateCriticalEvent ANTES de gravar, passando a "impressão
//     digital" (fingerprint) com os parâmetros exatos da ação (ids, valores).
//  2. Se o próprio operador é autorizador (User.isAuthorizer), passa direto — e fica registrado
//     (decisionChannel PROPRIO).
//  3. Senão, sem authorizationId, a rota NÃO executa: cria uma CriticalAuthorization PENDENTE e
//     responde 403 { precisaAutorizacao, autorizacao }. A tela abre a janela de autorização
//     (autorizar aqui com senha / enviar para um autorizador / cancelar o evento).
//  4. Aprovada, a tela reenvia a MESMA ação com authorizationId. A rota só aceita se a impressão
//     digital bater com a aprovada e consome a autorização uma única vez (APROVADA -> EXECUTADA,
//     updateMany condicional = atômico). Aprovar "desconto de R$ 50" nunca libera um de R$ 500.
//
// A senha do autorizador nunca volta para a tela nem é reenviada na requisição da ação.

export type CriticalEventType = "DESCONTO_ACIMA_LIMITE" | "ANULAR_LANCAMENTO_CAIXA";

export const CRITICAL_EVENT_LABELS: Record<CriticalEventType, string> = {
  DESCONTO_ACIMA_LIMITE: "Desconto acima do limite",
  ANULAR_LANCAMENTO_CAIXA: "Anulação de lançamento no caixa",
};

/** Validade de uma solicitação (e do link enviado ao autorizador). */
export const AUTHORIZATION_TTL_MS = 15 * 60_000;
/** Folga para consumir uma autorização aprovada perto do fim da validade. */
const CONSUME_GRACE_MS = 5 * 60_000;

export interface CriticalEventInput {
  eventType: CriticalEventType;
  /** Parâmetros exatos da ação — qualquer diferença exige nova autorização. */
  fingerprint: Record<string, unknown>;
  /** Frase curta do que está sendo autorizado (aparece para o autorizador e na auditoria). */
  summary: string;
  /** Dados exibidos ao autorizador: rótulo -> valor já formatado. */
  details: Record<string, string>;
  /** Id devolvido pela tela depois da aprovação. */
  authorizationId?: string | null;
}

export interface AuthorizationPayload {
  id: string;
  evento: string;
  resumo: string;
  detalhes: Record<string, string>;
  expiraEm: string;
}

export type GateResult =
  | { ok: true; authorizationId: string; authorizedBy: { id: string; name: string }; channel: string; justification: string | null }
  | {
      ok: false;
      status: number;
      body: { success: false; error: string; precisaAutorizacao?: true; autorizacao?: AuthorizationPayload };
    };

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])])
    );
  }
  if (typeof value === "number") return Math.round(value * 100) / 100;
  if (value instanceof Date) return value.toISOString();
  return value ?? null;
}

export function fingerprintHash(eventType: string, fingerprint: Record<string, unknown>): string {
  return createHash("sha256").update(JSON.stringify(canonical({ eventType, ...fingerprint }))).digest("hex");
}

export function formatBRL(value: number): string {
  return `R$ ${(Number(value) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toPayload(row: {
  id: string;
  eventType: string;
  summary: string;
  details: unknown;
  expiresAt: Date;
}): AuthorizationPayload {
  return {
    id: row.id,
    evento: CRITICAL_EVENT_LABELS[row.eventType as CriticalEventType] || row.eventType,
    resumo: row.summary,
    // Gravado como lista de pares [rótulo, valor]: o jsonb do Postgres reordena as chaves de um
    // objeto (por tamanho), o que embaralhava a ordem em que o autorizador lê os dados.
    detalhes: Array.isArray(row.details)
      ? Object.fromEntries(row.details as [string, string][])
      : (row.details as Record<string, string>) || {},
    expiraEm: row.expiresAt.toISOString(),
  };
}

export async function gateCriticalEvent(
  req: NextRequest,
  session: SessionPayload,
  input: CriticalEventInput
): Promise<GateResult> {
  const tenantId = session.tenantId;
  if (!tenantId) return { ok: false, status: 401, body: { success: false, error: "Sessão inválida ou expirada." } };

  const hash = fingerprintHash(input.eventType, input.fingerprint);
  const terminal = getTerminalName(req);
  const ip = getClientIp(req);
  const now = new Date();

  // 1. Operador que já é autorizador passa direto — registrado como PROPRIO.
  const me = await prisma.user.findFirst({
    where: { id: session.userId, tenantId, active: true },
    select: { id: true, name: true, isAuthorizer: true },
  });
  if (me?.isAuthorizer) {
    const row = await prisma.criticalAuthorization.create({
      data: {
        tenantId,
        eventType: input.eventType,
        status: "EXECUTADA",
        fingerprintHash: hash,
        summary: input.summary,
        details: Object.entries(input.details),
        requestedById: me.id,
        requestedByName: me.name,
        requestedTerminal: terminal,
        requestedIp: ip,
        decidedById: me.id,
        decidedByName: me.name,
        decisionChannel: "PROPRIO",
        decidedAt: now,
        decidedIp: ip,
        expiresAt: now,
        executedAt: now,
      },
      select: { id: true },
    });
    return { ok: true, authorizationId: row.id, authorizedBy: { id: me.id, name: me.name }, channel: "PROPRIO", justification: null };
  }

  // 2. Reenvio com autorização aprovada: consome uma única vez, só se a ação for a mesma.
  if (input.authorizationId) {
    const consumed = await prisma.criticalAuthorization.updateMany({
      where: {
        id: String(input.authorizationId),
        tenantId,
        eventType: input.eventType,
        requestedById: session.userId,
        fingerprintHash: hash,
        status: "APROVADA",
        expiresAt: { gt: new Date(now.getTime() - CONSUME_GRACE_MS) },
      },
      data: { status: "EXECUTADA", executedAt: now },
    });
    if (consumed.count === 1) {
      const row = await prisma.criticalAuthorization.findFirst({
        where: { id: String(input.authorizationId), tenantId },
        select: { id: true, decidedById: true, decidedByName: true, decisionChannel: true, justification: true },
      });
      return {
        ok: true,
        authorizationId: row!.id,
        authorizedBy: { id: row!.decidedById || "", name: row!.decidedByName || "" },
        channel: row!.decisionChannel || "LOCAL",
        justification: row!.justification,
      };
    }
    const prev = await prisma.criticalAuthorization.findFirst({
      where: { id: String(input.authorizationId), tenantId, requestedById: session.userId },
      select: { status: true, decidedByName: true, decisionNote: true, fingerprintHash: true },
    });
    if (prev?.status === "RECUSADA") {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          error: `Autorização recusada${prev.decidedByName ? ` por ${prev.decidedByName}` : ""}${prev.decisionNote ? `: ${prev.decisionNote}` : "."}`,
        },
      };
    }
    // Já usada, expirada, cancelada ou a ação mudou depois da aprovação: pede uma nova.
  }

  // 3. Precisa de autorização: reaproveita a solicitação pendente idêntica (retry/duplo clique).
  const existing = await prisma.criticalAuthorization.findFirst({
    where: {
      tenantId,
      requestedById: session.userId,
      eventType: input.eventType,
      fingerprintHash: hash,
      status: "PENDENTE",
      expiresAt: { gt: now },
    },
    select: { id: true, eventType: true, summary: true, details: true, expiresAt: true },
  });
  const row =
    existing ||
    (await prisma.criticalAuthorization.create({
      data: {
        tenantId,
        eventType: input.eventType,
        status: "PENDENTE",
        fingerprintHash: hash,
        summary: input.summary,
        details: Object.entries(input.details),
        requestedById: session.userId,
        requestedByName: session.name,
        requestedTerminal: terminal,
        requestedIp: ip,
        expiresAt: new Date(now.getTime() + AUTHORIZATION_TTL_MS),
      },
      select: { id: true, eventType: true, summary: true, details: true, expiresAt: true },
    }));

  return {
    ok: false,
    status: 403,
    body: {
      success: false,
      error: "Esta operação precisa de autorização.",
      precisaAutorizacao: true,
      autorizacao: toPayload(row),
    },
  };
}

/**
 * A gravação da ação falhou logo depois de consumir a autorização (ex.: conflito de transação):
 * devolve-a para APROVADA, para o operador tentar de novo sem pedir outra. A registrada como
 * PROPRIO (operador autorizador) vira NAO_EXECUTADA, para a auditoria não mostrar uma ação que
 * não aconteceu.
 */
export async function releaseCriticalAuthorization(tenantId: string, authorizationId: string | undefined, channel?: string) {
  if (!authorizationId) return;
  try {
    await prisma.criticalAuthorization.updateMany({
      where: { id: authorizationId, tenantId, status: "EXECUTADA" },
      data: channel === "PROPRIO" ? { status: "NAO_EXECUTADA" } : { status: "APROVADA", executedAt: null },
    });
  } catch (e) {
    console.error("[criticalAuth] Falha ao liberar autorização:", e);
  }
}

/** Marca como EXPIRADA uma solicitação pendente vencida (lazy, na consulta). */
export async function expireIfStale(tenantId: string, id: string) {
  await prisma.criticalAuthorization.updateMany({
    where: { id, tenantId, status: "PENDENTE", expiresAt: { lte: new Date() } },
    data: { status: "EXPIRADA" },
  });
}

/** Quarto + hóspede de uma hospedagem, para o autorizador saber do que se trata. */
export async function describeStay(tenantId: string, stayCheckinId: string | null | undefined): Promise<Record<string, string>> {
  if (!stayCheckinId) return {};
  const stay = await prisma.stayCheckin.findFirst({
    where: { id: stayCheckinId, tenantId },
    select: { room: { select: { number: true } }, primaryGuest: { select: { fullName: true } } },
  });
  if (!stay) return {};
  return { Quarto: String(stay.room?.number ?? "-"), Hóspede: stay.primaryGuest?.fullName || "-" };
}

/** Trilha geral (tenant_activity_logs) — complementa a CriticalAuthorization. */
export async function logAuthorizationDecision(
  req: NextRequest,
  tenantId: string,
  args: { id: string; decidedBy: { id: string; name: string }; action: string; description: string }
) {
  await logActivity({
    tenantId,
    userId: args.decidedBy.id,
    userName: args.decidedBy.name,
    action: args.action,
    description: args.description,
    entityType: "CRITICAL_AUTHORIZATION",
    entityId: args.id,
    terminal: getTerminalName(req),
    ipAddress: getClientIp(req),
  });
}

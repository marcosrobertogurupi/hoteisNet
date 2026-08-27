import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

/**
 * "Carimbo de versão" dos dados que o Mapa de Quartos e o Mapa de Reservas desenham.
 *
 * O polling de 3 s desses mapas manda um `If-None-Match` com o último carimbo que recebeu; se nada
 * mudou, a rota responde `304` sem corpo e o cliente não redesenha nada. Só quando o carimbo muda é
 * que o payload completo (que é o que pesa no egress do Supabase) volta a ser baixado.
 *
 * A regra de ouro: um falso "mudou" só custa um fetch desperdiçado (inofensivo); um falso "não
 * mudou" esconde uma reserva/check-in do operador e pode causar overbooking. Por isso cada consulta
 * abaixo é deliberadamente ampla (conta linhas + maior timestamp da tabela inteira do tenant), não
 * tenta ser cirúrgica.
 *
 * `count(*)` pega inserções e exclusões; `max(updatedAt/createdAt)` pega alterações in-place
 * (mudança de status de reserva, virada de diária, marcação de mensagem como lida, etc.).
 */

interface TableSig {
  c: bigint | number;
  ts: Date | null;
}

function hashParts(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex").slice(0, 16);
}

// Fallback quando o cálculo da versão falha — ex.: a migração que adiciona `updatedAt` a
// `reservations`/`stay_checkins`/`whatsapp_messages` ainda não rodou no banco (janela entre o
// deploy do código e o `prisma db push`). Retorna um valor sempre diferente, o que faz o ETag
// nunca casar e o cliente sempre baixar o payload completo — exatamente o comportamento atual,
// sem 304. Assim a feature pode ser publicada antes ou depois da migração, em qualquer ordem.
function volatileFallback(context: string, err: unknown): string {
  console.warn(`[mapVersion] ${context} — usando fallback sem 304:`, err);
  return `nover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Junta várias versões (ex.: reservas + quartos + governança) num único carimbo, para as rotas
// consolidadas /api/mapa/*-tick.
export function combineVersions(...versions: string[]): string {
  return hashParts(versions);
}

function sigToPart(label: string, rows: TableSig[]): string {
  const r = rows[0];
  const count = r ? Number(r.c) : 0;
  const ts = r?.ts ? new Date(r.ts).getTime() : 0;
  return `${label}:${count}:${ts}`;
}

// Mapa de Reservas — GET /api/reservations
export async function reservationsMapVersion(tenantId: string): Promise<string> {
  try {
    return await computeReservationsMapVersion(tenantId);
  } catch (err) {
    return volatileFallback("reservationsMapVersion", err);
  }
}

async function computeReservationsMapVersion(tenantId: string): Promise<string> {
  const [resv, stays, fnrh, rooms] = await Promise.all([
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("createdAt"), 'epoch')) AS ts FROM "reservations" WHERE "tenantId" = $1`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("checkInDate"), 'epoch')) AS ts FROM "stay_checkins" WHERE "tenantId" = $1`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX(fr."createdAt"), 'epoch') AS ts FROM "fnrh_records" fr JOIN "reservations" r ON fr."reservationId" = r.id WHERE r."tenantId" = $1`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX("updatedAt"), 'epoch') AS ts FROM "rooms" WHERE "tenantId" = $1`,
      tenantId,
    ),
  ]);
  return hashParts([
    sigToPart("resv", resv),
    sigToPart("stay", stays),
    sigToPart("fnrh", fnrh),
    sigToPart("room", rooms),
  ]);
}

// Mapa de Quartos — GET /api/reservations/rooms/status
export async function roomsStatusMapVersion(tenantId: string): Promise<string> {
  try {
    return await computeRoomsStatusMapVersion(tenantId);
  } catch (err) {
    return volatileFallback("roomsStatusMapVersion", err);
  }
}

async function computeRoomsStatusMapVersion(tenantId: string): Promise<string> {
  const [rooms, stays, msgs, resv] = await Promise.all([
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, COALESCE(MAX("updatedAt"), 'epoch') AS ts FROM "rooms" WHERE "tenantId" = $1`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("checkInDate"), 'epoch')) AS ts FROM "stay_checkins" WHERE "tenantId" = $1 AND "isClosed" = false`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("createdAt"), 'epoch')) AS ts FROM "whatsapp_messages" WHERE "tenantId" = $1 AND "direction" = 'IN'`,
      tenantId,
    ),
    prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("createdAt"), 'epoch')) AS ts FROM "reservations" WHERE "tenantId" = $1`,
      tenantId,
    ),
  ]);
  return hashParts([
    sigToPart("room", rooms),
    sigToPart("stay", stays),
    sigToPart("msg", msgs),
    sigToPart("resv", resv),
  ]);
}

// Selos de governança nos dois mapas — GET /api/tenant/housekeeping-tasks
export async function housekeepingTasksVersion(tenantId: string): Promise<string> {
  try {
    const rows = await prisma.$queryRawUnsafe<TableSig[]>(
      `SELECT COUNT(*)::int AS c, GREATEST(COALESCE(MAX("updatedAt"), 'epoch'), COALESCE(MAX("createdAt"), 'epoch')) AS ts FROM "housekeeping_tasks" WHERE "tenantId" = $1`,
      tenantId,
    );
    return hashParts([sigToPart("hk", rows)]);
  } catch (err) {
    return volatileFallback("housekeepingTasksVersion", err);
  }
}

/**
 * Helper comum às rotas: se o `If-None-Match` do cliente bate com a versão atual, devolve a
 * resposta 304 (sem corpo) a ser retornada; senão devolve null e a rota segue montando o payload.
 * O ETag calculado deve ser passado adiante para `NextResponse.json(..., { headers: { ETag } })`.
 */
export function notModifiedResponse(req: Request, etag: string): Response | null {
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  return null;
}

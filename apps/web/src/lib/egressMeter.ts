// Acumula em memória o egress (bytes de resultado de leitura) por tenant e descarrega no banco em
// lote — nunca uma escrita por query. Alimentado por `jsonForTenant` (lib/tenantResponse.ts);
// consumido pelo painel admin (métrica de volume por assinante).
//
// A escrita é UMA instrução SQL autocommit (`$executeRaw`), nunca `prisma.upsert`: o upsert do Prisma
// abre BEGIN/COMMIT, e numa função serverless congelada entre os dois a linha (tenantId, dia) ficava
// travada até o timeout do pooler (~120 s), enfileirando todos os demais flushes — o upsert chegou a
// responder por 94% do tempo total do banco. Uma instrução única é atômica no servidor mesmo que o
// cliente congele logo depois de enviá-la.

type Bucket = { bytes: number; count: number };
const buffer = new Map<string, Bucket>();
let lastFlush = Date.now();
let flushingSince = 0;
let intervalStarted = false;

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_MAX_TENANTS = 200;
// Um flush "em andamento" há mais que isto é considerado perdido (função congelada) e não bloqueia o próximo.
const FLUSH_STALE_MS = 60_000;

// Import tardio do prisma para evitar ciclo de módulos.
async function getPrisma() {
  const mod = await import("@/lib/prisma");
  return mod.prisma;
}

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

export function recordEgress(tenantId: string, bytes: number): void {
  if (!tenantId || bytes <= 0) return;
  const b = buffer.get(tenantId) ?? { bytes: 0, count: 0 };
  b.bytes += bytes;
  b.count += 1;
  buffer.set(tenantId, b);

  if (!intervalStarted) {
    intervalStarted = true;
    // Backstop para instâncias de longa duração (Fluid Compute quente).
    const t = setInterval(() => void flushEgress(), FLUSH_INTERVAL_MS);
    if (typeof t.unref === "function") t.unref();
  }
}

/** Há dados no buffer e já passou tempo (ou volume) suficiente para descarregar. */
export function egressFlushDue(): boolean {
  if (buffer.size === 0) return false;
  return buffer.size >= FLUSH_MAX_TENANTS || Date.now() - lastFlush > FLUSH_INTERVAL_MS;
}

function isForeignKeyViolation(err: unknown): boolean {
  const e = err as { code?: string; meta?: { code?: string; message?: string }; message?: string };
  return e?.code === "P2003" || e?.meta?.code === "23503" || /foreign key/i.test(e?.message ?? "");
}

export async function flushEgress(): Promise<void> {
  const now = Date.now();
  if (buffer.size === 0) return;
  if (flushingSince && now - flushingSince < FLUSH_STALE_MS) return;
  flushingSince = now;
  lastFlush = now;

  const snapshot = new Map(buffer);
  buffer.clear();

  try {
    const prisma = await getPrisma();
    const day = todayUtcDate();
    await Promise.all(
      Array.from(snapshot.entries()).map(async ([tenantId, b]) => {
        const bytes = BigInt(Math.round(b.bytes));
        try {
          await prisma.$executeRaw`
            INSERT INTO "tenant_egress_daily" ("id", "tenantId", "day", "responseBytes", "queryCount", "updatedAt")
            VALUES (${globalThis.crypto.randomUUID()}, ${tenantId}, ${day}::date, ${bytes}::bigint, ${b.count}::int, NOW())
            ON CONFLICT ("tenantId", "day") DO UPDATE SET
              "responseBytes" = "tenant_egress_daily"."responseBytes" + EXCLUDED."responseBytes",
              "queryCount" = "tenant_egress_daily"."queryCount" + EXCLUDED."queryCount",
              "updatedAt" = NOW()`;
        } catch (err) {
          // Tenant removido → descarta; qualquer outro erro re-coloca no buffer para o próximo flush.
          if (isForeignKeyViolation(err)) return;
          const back = buffer.get(tenantId) ?? { bytes: 0, count: 0 };
          back.bytes += b.bytes;
          back.count += b.count;
          buffer.set(tenantId, back);
        }
      })
    );
  } catch (err) {
    console.error("[egressMeter] falha no flush:", err);
  } finally {
    flushingSince = 0;
  }
}

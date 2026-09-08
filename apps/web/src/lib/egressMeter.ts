// Acumula em memória o egress (bytes de resultado de leitura) por tenant e descarrega no banco em
// lote — nunca uma escrita por query. Alimentado pela extensão do cliente Prisma
// (lib/prisma.ts); consumido pelo painel admin (métrica de volume por assinante).

type Bucket = { bytes: number; count: number };
const buffer = new Map<string, Bucket>();
let lastFlush = Date.now();
let flushing = false;
let intervalStarted = false;

const FLUSH_INTERVAL_MS = 30_000;
const FLUSH_MAX_TENANTS = 200;

// Import tardio do prisma para evitar ciclo (prisma.ts importa este módulo para a extensão).
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
    // Backstop para instâncias de longa duração (worker / Fluid Compute quente).
    const t = setInterval(() => void flushEgress(), FLUSH_INTERVAL_MS);
    if (typeof t.unref === "function") t.unref();
  }
  if (buffer.size >= FLUSH_MAX_TENANTS || Date.now() - lastFlush > FLUSH_INTERVAL_MS) {
    void flushEgress();
  }
}

export async function flushEgress(): Promise<void> {
  if (flushing || buffer.size === 0) return;
  flushing = true;
  lastFlush = Date.now();

  const snapshot = new Map(buffer);
  buffer.clear();

  try {
    const prisma = await getPrisma();
    const day = todayUtcDate();
    const id = () => `${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
    await Promise.all(
      Array.from(snapshot.entries()).map(([tenantId, b]) =>
        prisma.tenantEgressDaily
          .upsert({
            where: { tenantId_day: { tenantId, day } },
            create: { id: id(), tenantId, day, responseBytes: BigInt(Math.round(b.bytes)), queryCount: b.count },
            update: { responseBytes: { increment: BigInt(Math.round(b.bytes)) }, queryCount: { increment: b.count } },
          })
          .catch((err: unknown) => {
            // Re-coloca no buffer para tentar de novo no próximo flush (ex.: tenant já removido → descarta).
            const code = (err as { code?: string })?.code;
            if (code !== "P2003" && code !== "P2025") {
              const back = buffer.get(tenantId) ?? { bytes: 0, count: 0 };
              back.bytes += b.bytes;
              back.count += b.count;
              buffer.set(tenantId, back);
            }
          })
      )
    );
  } catch (err) {
    console.error("[egressMeter] falha no flush:", err);
  } finally {
    flushing = false;
  }
}

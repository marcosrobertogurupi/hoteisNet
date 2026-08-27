import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// O pooler do Supabase (Supavisor, porta 6543), sob carga ou quando o projeto está sendo limitado
// por cota, às vezes demora mais que os 2s padrão do Prisma só para ENTREGAR uma conexão — aí a
// transação nem começa e o Prisma devolve "Transaction API error: Unable to start a transaction in
// the given time" (P2028). Estes limites mais folgados dão margem para esse aperto de conexão.
// `timeout` é só um teto: as transações do sistema fazem poucas queries rápidas e terminam em <1s.
const DEFAULT_TX_OPTIONS = { maxWait: 10_000, timeout: 20_000 } as const;

// Só erros em que a transação comprovadamente NÃO chegou a rodar — seguro repetir sem risco de
// duplicar (ex.: criar duas reservas). Nunca repetir erro de negócio (conflito de overbooking) nem
// falha no meio da transação (o Prisma já faz rollback, mas repetir aí poderia duplicar se o commit
// tiver passado e só a resposta se perdido).
function isSafeToRetryStartError(e: unknown): boolean {
  const code = (e as any)?.code;
  if (code === "P2028" || code === "P1001" || code === "P1002") return true;
  return /Unable to start a transaction in the given time/i.test(String((e as any)?.message || ""));
}

/**
 * `prisma.$transaction` com timeouts mais folgados e UMA retentativa quando a transação sequer
 * conseguiu iniciar por aperto de conexão/pool (reconexão "fria" do pooler, pico de latência,
 * projeto limitado por cota). Use no lugar de `prisma.$transaction(fn)` nas rotas que gravam.
 */
export async function txWithRetry<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: { maxWait?: number; timeout?: number } = {},
): Promise<T> {
  const opts = { ...DEFAULT_TX_OPTIONS, ...options };
  try {
    return await prisma.$transaction(fn, opts);
  } catch (e) {
    if (!isSafeToRetryStartError(e)) throw e;
    await new Promise((r) => setTimeout(r, 600));
    return prisma.$transaction(fn, opts);
  }
}

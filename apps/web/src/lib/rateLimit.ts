import { prisma } from "@/lib/prisma";

// Rate limiting por IP para conter força-bruta nos endpoints que recebem senha (logins dos quatro
// apps e a autorização "step-up" de administrador).
//
// A contagem vive no BANCO, compartilhada por todas as instâncias. Enquanto era um Map em memória,
// na Vercel cada instância mantinha a própria contagem: "5 tentativas por minuto" virava
// 5 × número de instâncias, e a contagem caía a zero a cada cold start — exatamente o cenário em
// que um atacante distribui as tentativas. O contador em memória continua existindo como atalho:
// quando a instância local já sabe que o IP estourou o limite, nem chega a consultar o banco.
//
// Isto não substitui um rate limit na borda (regra do Vercel Firewall) para ataques distribuídos
// de larga escala — é a trava por-IP da aplicação, agora consistente entre instâncias.

interface Bucket {
  count: number;
  resetAt: number;
}

// Espelho local do que o banco respondeu, só para curto-circuitar quem já está bloqueado.
const blockedLocally = new Map<string, Bucket>();

function pruneLocal(now: number) {
  if (blockedLocally.size < 5000) return;
  for (const [key, bucket] of blockedLocally) {
    if (bucket.resetAt <= now) blockedLocally.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): Promise<RateLimitResult> {
  const now = Date.now();
  pruneLocal(now);

  const local = blockedLocally.get(key);
  if (local && local.resetAt > now && local.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((local.resetAt - now) / 1000) };
  }

  const resetAt = new Date(now + windowMs);

  try {
    // Incremento atômico: um único INSERT ... ON CONFLICT resolve "criar", "incrementar" e
    // "reiniciar a janela expirada" sem transação nem corrida entre instâncias.
    const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
      INSERT INTO "rate_limit_buckets" ("key", "count", "resetAt")
      VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "rate_limit_buckets"."resetAt" <= now() THEN 1 ELSE "rate_limit_buckets"."count" + 1 END,
        "resetAt" = CASE WHEN "rate_limit_buckets"."resetAt" <= now() THEN ${resetAt} ELSE "rate_limit_buckets"."resetAt" END
      RETURNING "count", "resetAt"
    `;

    const row = rows[0];
    if (!row) return { allowed: true, retryAfterSeconds: 0 };

    const bucketResetAt = new Date(row.resetAt).getTime();
    const count = Number(row.count);

    if (count > max) {
      blockedLocally.set(key, { count, resetAt: bucketResetAt });
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucketResetAt - now) / 1000)) };
    }

    // Limpeza oportunista das janelas já vencidas, para a tabela não crescer sem fim. Roda em
    // ~1% das chamadas e nunca derruba a requisição.
    if (Math.random() < 0.01) {
      prisma.$executeRaw`DELETE FROM "rate_limit_buckets" WHERE "resetAt" <= now() - interval '1 hour'`.catch(() => {});
    }

    return { allowed: true, retryAfterSeconds: 0 };
  } catch (error) {
    // Banco indisponível não pode derrubar o login: cai para a contagem local da instância, que é
    // o comportamento anterior a esta mudança (melhor que nenhum limite).
    console.error("[checkRateLimit] Falha ao consultar o contador compartilhado:", error);
    const bucket = blockedLocally.get(key);
    if (!bucket || bucket.resetAt <= now) {
      blockedLocally.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= max) {
      return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
    }
    bucket.count += 1;
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

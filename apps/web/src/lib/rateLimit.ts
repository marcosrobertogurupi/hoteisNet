// Rate limiting em memória por IP, para conter força-bruta em endpoints de login. É uma
// mitigação "best effort": em ambientes com múltiplas instâncias/cold starts (serverless) cada
// instância tem sua própria contagem, então isso não substitui um WAF/rate limit na borda (ex:
// Vercel Firewall) para proteção robusta contra ataques distribuídos — mas já barra o caso comum
// de um único atacante martelando o endpoint.

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Evita crescimento ilimitado do Map em processos de longa duração.
function pruneExpired(now: number) {
  if (buckets.size < 5000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function checkRateLimit(
  key: string,
  { max, windowMs }: { max: number; windowMs: number }
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  pruneExpired(now);

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  if (bucket.count >= max) {
    return { allowed: false, retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSeconds: 0 };
}

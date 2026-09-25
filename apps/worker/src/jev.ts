// Cliente HTTP do Jev (TypeSafe) via OpenRouter — espelho de apps/web/src/lib/jev/client.ts (o
// worker é CJS puro e não importa apps/web). Mude os dois juntos.
// Jev é um modelo de DECISÃO: não escreve texto; responde Choice/Score/Noul com probabilidades.
// Nunca lança: falha volta como { ok: false } para o chamador seguir o fluxo atual.

export const JEV_DEFAULT_MODEL = "typesafe/jev-1.13";
const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";

export type JevQuestion =
  | { type: "choice"; instructions: string; criteria: Record<string, string> }
  | { type: "score"; instructions: string; criteria: string[] }
  | { type: "noul"; instructions: string; criteria?: { true: string; false: string } };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence?: number; probabilities?: Record<string, number> }
  | { type: "score"; score: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, string> }
  | { type: "noul"; noul: number };

export type JevResult =
  | { ok: true; answers: Record<string, JevAnswer>; tokensInput: number; tokensOutput: number; costUsd: number; durationMs: number; model: string }
  | { ok: false; error: string; durationMs: number };

export async function callJev(params: {
  state: unknown;
  questions: Record<string, JevQuestion>;
  model?: string;
  timeoutMs?: number;
}): Promise<JevResult> {
  const startedAt = Date.now();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return { ok: false, error: "OPENROUTER_API_KEY não configurada.", durationMs: 0 };

  try {
    const response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-OpenRouter-Title": "HoteisNet",
      },
      body: JSON.stringify({
        model: params.model || JEV_DEFAULT_MODEL,
        state: params.state,
        questions: params.questions,
        provider: { zdr: true, data_collection: "deny" },
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 5000),
    });
    const durationMs = Date.now() - startedAt;
    const text = await response.text();
    if (!response.ok) return { ok: false, error: `Jev respondeu ${response.status}: ${text.slice(0, 500)}`, durationMs };

    const json: any = JSON.parse(text);
    if (!json?.answers || typeof json.answers !== "object") return { ok: false, error: "Resposta do Jev sem answers.", durationMs };
    return {
      ok: true,
      answers: json.answers,
      tokensInput: Math.max(0, Math.round(json.usage?.input_tokens ?? 0)),
      tokensOutput: Math.max(0, Math.round(json.usage?.output_tokens ?? 0)),
      costUsd: Number(json.usage?.cost ?? 0) || 0,
      durationMs,
      model: String(json.model || params.model || JEV_DEFAULT_MODEL),
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err), durationMs: Date.now() - startedAt };
  }
}

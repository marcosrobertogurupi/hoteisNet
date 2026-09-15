// Análise de sentimento de reviews com IA (Gemini) — roda no worker, junto da coleta
// (apps/worker/src/reviewsSync.ts chama analyzeReviewSentiment logo após normalizar um review novo
// ou alterado, antes de gravar). Chamada REST direta ao Gemini, sem o pacote "ai"/"@ai-sdk/google"
// — mesmo motivo já documentado em operationalAgent.ts: o worker compila para CommonJS puro via
// tsc, e esses pacotes são ESM-only.
//
// Nesta fase, o rascunho de resposta (`replyDraft`) SEMPRE fica como rascunho (`ReviewResponseStatus.DRAFT`,
// nunca publicado automaticamente) — publicar de fato exigiria integração de resposta própria por
// canal (API do Google Business Profile, TripAdvisor Partner API, etc.), que este módulo ainda não
// tem. O modo híbrido de publicação automática (nota alta + confiança alta) combinado com o
// assinante fica para quando essa integração existir.
import type { PrismaClient } from "@prisma/client";
import {
  WORKER_AI_FEATURES,
  resolveWorkerAiModel,
  readGeminiUsage,
  logWorkerAiUsage,
  AI_MODEL_FALLBACK,
} from "./aiUsage";

const GEMINI_TIMEOUT_MS = 45_000;

export interface ReviewSentimentResult {
  sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE" | "CRITICAL";
  dissatisfactionScore: number; // 0-100
  topics: string[];
  summary: string;
  replyDraft: string | null;
  replyConfidence: number; // 0-1
  method: "gemini" | "rating_only";
}

const SENTIMENT_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    sentiment: { type: "string", enum: ["positive", "neutral", "negative", "critical"] },
    dissatisfactionScore: { type: "number" },
    topics: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
    replyDraft: { type: "string" },
    replyConfidence: { type: "number" },
  },
  required: ["sentiment", "dissatisfactionScore", "topics", "summary", "replyDraft", "replyConfidence"],
};

const CHANNEL_LABELS: Record<string, string> = {
  GOOGLE_MAPS: "Google Maps",
  TRIPADVISOR: "TripAdvisor",
  BOOKING: "Booking.com",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram (comentário)",
  RECLAME_AQUI: "Reclame Aqui",
};

// Sem texto (só nota, ex.: algumas avaliações do Google Maps) — classificação determinística, sem
// custo de IA. Reclame Aqui nunca cai aqui (sempre tem texto); os demais canais podem.
function classifyByRatingOnly(rating: number | null): ReviewSentimentResult {
  let sentiment: ReviewSentimentResult["sentiment"] = "NEUTRAL";
  let score = 50;
  if (rating != null) {
    if (rating <= 2) {
      sentiment = "NEGATIVE";
      score = 75;
    } else if (rating >= 4) {
      sentiment = "POSITIVE";
      score = 15;
    }
  }
  return {
    sentiment,
    dissatisfactionScore: score,
    topics: [],
    summary: "Review sem texto — classificado só pela nota.",
    replyDraft: null,
    replyConfidence: 0,
    method: "rating_only",
  };
}

async function callGeminiStructured(prompt: string, model: string): Promise<{ data: any; usage: any }> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY não configurada.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", responseSchema: SENTIMENT_RESPONSE_SCHEMA },
      }),
      signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
    }
  );
  if (!response.ok) throw new Error(`Gemini respondeu ${response.status}: ${await response.text()}`);

  const json: any = await response.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
  if (!text) throw new Error("Gemini não retornou texto.");
  return { data: JSON.parse(text), usage: json?.usageMetadata };
}

/**
 * Analisa o sentimento de um review — com IA quando há texto, senão classificação determinística
 * pela nota (sem custo). Nunca lança: se a chamada de IA falhar, cai para o rating-only, para nunca
 * travar a sincronização de reviews por causa de um problema no provedor de IA.
 */
export async function analyzeReviewSentiment(
  prisma: PrismaClient,
  params: {
    tenantId: string;
    hotelName: string;
    channel: string;
    rating: number | null;
    body: string | null;
    authorName: string | null;
  }
): Promise<ReviewSentimentResult> {
  if (!params.body || !params.body.trim()) {
    return classifyByRatingOnly(params.rating);
  }

  const model = await resolveWorkerAiModel(prisma, WORKER_AI_FEATURES.REVIEW_SENTIMENT_ANALYSIS, params.tenantId).catch(
    () => AI_MODEL_FALLBACK
  );

  const channelLabel = CHANNEL_LABELS[params.channel] || params.channel;
  const prompt = [
    `Você analisa reviews de hóspedes para o sistema de gestão do hotel "${params.hotelName}".`,
    `Canal: ${channelLabel}. Nota informada: ${params.rating != null ? `${params.rating}/5` : "sem nota"}. Autor: ${params.authorName || "anônimo"}.`,
    ``,
    `Texto do review:`,
    `"""${params.body}"""`,
    ``,
    `Responda em JSON:`,
    `- sentiment: "positive" | "neutral" | "negative" | "critical" — "critical" só para problema grave (segurança, saúde, fraude, ameaça de ação legal/judicial, ou relato com potencial real de viralizar negativamente), não use para insatisfação comum.`,
    `- dissatisfactionScore: 0 a 100 (0 = extremamente satisfeito, 100 = extremamente insatisfeito).`,
    `- topics: lista curta de temas do review (ex.: limpeza, atendimento, localização, café da manhã, custo-benefício, infraestrutura, ruído, wifi, estacionamento, elogio). Português, minúsculas, sem acento incorreto.`,
    `- summary: um resumo de uma frase em português para a equipe do hotel ler rápido.`,
    `- replyDraft: rascunho de resposta pública em português, educada e profissional, no tom de um hotel brasileiro — nunca invente fatos, promessas ou detalhes que não estão no review; se o review for muito genérico, um agradecimento simples e sincero já basta.`,
    `- replyConfidence: 0 a 1 — sua confiança de que replyDraft poderia ser publicado sem revisão humana (leve em conta: reviews muito negativos ou reclamações específicas merecem confiança baixa, já que pedem uma resposta mais cuidadosa de um humano).`,
  ].join("\n");

  try {
    const { data, usage } = await callGeminiStructured(prompt, model);
    await logWorkerAiUsage(prisma, {
      tenantId: params.tenantId,
      feature: WORKER_AI_FEATURES.REVIEW_SENTIMENT_ANALYSIS,
      model,
      ...readGeminiUsage(usage),
    });

    const sentiment = String(data.sentiment || "neutral").toUpperCase() as ReviewSentimentResult["sentiment"];
    return {
      sentiment: ["POSITIVE", "NEUTRAL", "NEGATIVE", "CRITICAL"].includes(sentiment) ? sentiment : "NEUTRAL",
      dissatisfactionScore: Math.min(100, Math.max(0, Number(data.dissatisfactionScore) || 0)),
      topics: Array.isArray(data.topics) ? data.topics.slice(0, 8).map((t: unknown) => String(t)) : [],
      summary: String(data.summary || "").slice(0, 500),
      replyDraft: data.replyDraft ? String(data.replyDraft).slice(0, 2000) : null,
      replyConfidence: Math.min(1, Math.max(0, Number(data.replyConfidence) || 0)),
      method: "gemini",
    };
  } catch (err: any) {
    console.error(`[review-sentiment] falha na IA — tenant=${params.tenantId} canal=${params.channel}:`, err?.message || err);
    return classifyByRatingOnly(params.rating);
  }
}

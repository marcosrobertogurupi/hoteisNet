// Catálogo de modelos de IA oferecido ao admin master para escolher por recurso/assinante.
// Fonte: models.list da API Generative Language do Google (não tem preço — o preço vem de
// AiModelPrice). Cache em memória de 1h porque a lista quase não muda e não vale bater no Google
// a cada abertura da tela.
import { prisma } from "@/lib/prisma";
import { isKnownAiFeature, featureNeedsFunctionCalling } from "@/lib/aiAgent/features";

export interface CatalogModel {
  id: string; // ex: "gemini-2.5-flash"
  displayName: string;
  description: string;
  inputTokenLimit: number | null;
  outputTokenLimit: number | null;
  supportsFunctionCalling: boolean;
  // Preço vigente (USD por 1M) se o modelo estiver em AiModelPrice; null se ainda não cadastrado.
  price: { inputPerMTokenUsd: number; cachedInputPerMTokenUsd: number; outputPerMTokenUsd: number } | null;
}

// models.list não informa suporte a function calling. Regra prática: as famílias Gemini 1.5, 2.0 e
// 2.5 suportam function calling; a exceção conhecida é o gemini-1.5-flash-8b (suporte limitado) e
// as variantes que não são de geração de texto (já filtradas por supportedGenerationMethods).
function inferFunctionCalling(id: string): boolean {
  if (/-8b\b/.test(id)) return false;
  return /^gemini-(1\.5|2\.0|2\.5|3)/.test(id);
}

// models.list devolve também modelos de imagem, TTS, transcrição, computer-use etc. (todos com
// generateContent). Só queremos os de conversa/texto — descarta o resto por padrão de id/nome.
function isTextChatModel(id: string, displayName: string): boolean {
  const hay = `${id} ${displayName}`.toLowerCase();
  if (/(image|imagen|tts|audio|transcribe|speech|computer-use|live|realtime|nano.?banana|embedding|aqa|veo|learnlm)/.test(hay)) {
    return false;
  }
  // Só famílias Gemini numéricas (gemini-1.5, gemini-2.x, gemini-3.x…).
  return /^gemini-\d/.test(id);
}

// Fallback usado se a chamada ao Google falhar — os modelos que já sabemos que existem/usamos.
const FALLBACK_MODEL_IDS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
];

let cache: { at: number; models: Omit<CatalogModel, "price">[] } | null = null;
const CACHE_MS = 60 * 60 * 1000;

async function fetchGoogleModels(): Promise<Omit<CatalogModel, "price">[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.models;

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  let models: Omit<CatalogModel, "price">[] = [];

  if (apiKey) {
    try {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
        headers: { "x-goog-api-key": apiKey },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.ok) {
        const json: any = await res.json();
        models = (json?.models ?? [])
          .filter(
            (m: any) =>
              typeof m?.name === "string" &&
              m.name.startsWith("models/gemini") &&
              Array.isArray(m?.supportedGenerationMethods) &&
              m.supportedGenerationMethods.includes("generateContent")
          )
          .map((m: any) => {
            const id = String(m.name).replace(/^models\//, "");
            return {
              id,
              displayName: String(m.displayName || id),
              description: String(m.description || ""),
              inputTokenLimit: Number.isFinite(m.inputTokenLimit) ? m.inputTokenLimit : null,
              outputTokenLimit: Number.isFinite(m.outputTokenLimit) ? m.outputTokenLimit : null,
              supportsFunctionCalling: inferFunctionCalling(id),
            };
          })
          .filter((m: Omit<CatalogModel, "price">) => isTextChatModel(m.id, m.displayName));
      }
    } catch (err) {
      console.error("[modelCatalog] falha ao listar modelos do Google:", (err as Error)?.message || err);
    }
  }

  if (models.length === 0) {
    models = FALLBACK_MODEL_IDS.map((id) => ({
      id,
      displayName: id,
      description: "",
      inputTokenLimit: null,
      outputTokenLimit: null,
      supportsFunctionCalling: inferFunctionCalling(id),
    }));
  }

  // Ordena: flash antes de pro, mais novo antes de mais velho — heurística simples por nome.
  models.sort((a, b) => a.id.localeCompare(b.id));
  cache = { at: Date.now(), models };
  return models;
}

export async function getModelCatalog(): Promise<CatalogModel[]> {
  const [models, prices] = await Promise.all([
    fetchGoogleModels(),
    prisma.aiModelPrice.findMany({
      orderBy: { effectiveFrom: "desc" },
      select: { model: true, inputPerMTokenUsd: true, cachedInputPerMTokenUsd: true, outputPerMTokenUsd: true },
    }),
  ]);

  // Preço mais recente por modelo.
  const priceByModel = new Map<string, CatalogModel["price"]>();
  for (const p of prices) {
    if (!priceByModel.has(p.model)) {
      priceByModel.set(p.model, {
        inputPerMTokenUsd: Number(p.inputPerMTokenUsd),
        cachedInputPerMTokenUsd: Number(p.cachedInputPerMTokenUsd),
        outputPerMTokenUsd: Number(p.outputPerMTokenUsd),
      });
    }
  }

  const catalog = models.map((m) => ({ ...m, price: priceByModel.get(m.id) ?? null }));

  // Garante que todo modelo já usado em algum default/override apareça na lista, mesmo que o
  // models.list não o tenha retornado (modelo antigo, região, etc.).
  const known = new Set(catalog.map((m) => m.id));
  for (const [model, price] of priceByModel) {
    if (!known.has(model)) {
      catalog.push({
        id: model,
        displayName: model,
        description: "",
        inputTokenLimit: null,
        outputTokenLimit: null,
        supportsFunctionCalling: inferFunctionCalling(model),
        price,
      });
    }
  }

  return catalog;
}

// Valida um modelo escolhido pelo admin para um recurso: tem que existir no catálogo e, se o
// recurso faz tool-calling, suportar function calling. Devolve null quando ok, ou o erro pronto.
export async function validateModelForFeature(
  model: string,
  feature: string
): Promise<{ status: number; body: { success: false; error: string } } | null> {
  const catalog = await getModelCatalog();
  const entry = catalog.find((m) => m.id === model);
  if (!entry) {
    return { status: 400, body: { success: false, error: `Modelo "${model}" não está disponível no provedor.` } };
  }
  if (isKnownAiFeature(feature) && featureNeedsFunctionCalling(feature) && !entry.supportsFunctionCalling) {
    return {
      status: 400,
      body: { success: false, error: `O recurso exige function calling e "${model}" não suporta.` },
    };
  }
  return null;
}

// Contrato comum entre reviewsSync.ts e cada conector de canal (googleMaps.ts, e os que forem
// adicionados depois — tripadvisor.ts, booking.ts, facebook.ts, instagram.ts, reclameAqui.ts).
// Cada conector é responsável só por buscar e normalizar; deduplicação e persistência ficam em
// reviewsSync.ts (mesma separação de responsabilidade do projeto de referência que originou este
// módulo).
export interface NormalizedReviewInput {
  // Id do review no canal de origem — nunca gerado por nós, é a chave de deduplicação.
  externalId: string;
  rating?: number | null;
  title?: string | null;
  body?: string | null;
  authorName?: string | null;
  url?: string | null;
  publishedAt: Date;
  rawData: unknown;
}

export interface ReviewConnectorResult {
  reviewsFetched: number;
  reviews: NormalizedReviewInput[];
  // Preenchido quando a coleta falhou de forma tratada (credencial ausente, canal ainda não
  // implementado, erro reportado pelo serviço de scraping) — reviewsSync.ts trata isso como falha
  // do ciclo (mesmo efeito de uma exceção lançada), mas sem exigir try/catch em cada conector.
  errorMessage?: string;
  // A Apify recusou a chamada porque a conta da plataforma estourou a cota mensal (ver
  // apifyErrors.ts) — reviewsSync.ts pausa todas as coletas via Apify em vez de contar como erro
  // deste conector.
  apifyQuotaExceeded?: boolean;
}

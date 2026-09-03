import { supabaseAdmin } from "@/utils/supabaseClient";

// Armazenamento dos arquivos fiscais (XML autorizado, DANFE em PDF) no Supabase Storage —
// nunca no Postgres, pela regra de egress do projeto. Bucket privado `fiscal`, caminhos
// `fiscal/{tenantId}/{ano}/{arquivo}`. O banco guarda só o path; a rota que exibe gera uma
// URL assinada de curta duração.

const BUCKET = "fiscal";

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  try {
    await supabaseAdmin.storage.createBucket(BUCKET, { public: false });
  } catch {
    // já existe — ok
  }
  bucketEnsured = true;
}

export async function uploadFiscalFile(params: {
  tenantId: string;
  fileName: string;
  content: Buffer;
  contentType: string;
}): Promise<string> {
  await ensureBucket();
  const year = new Date().getFullYear();
  const path = `${params.tenantId}/${year}/${params.fileName}`;
  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, params.content, { contentType: params.contentType, upsert: true });
  if (error) throw new Error(`Falha ao guardar arquivo fiscal: ${error.message}`);
  return path;
}

export async function signedFiscalUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  return error ? null : data.signedUrl;
}

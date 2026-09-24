import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/utils/supabaseAdmin";
import { sniffImage } from "@/lib/roomPhotoStorage";

// Fotos do problema de uma OS de manutenção, no Supabase Storage — mesmo esquema das fotos dos
// quartos (lib/roomPhotoStorage.ts): o arquivo fica no Storage e o banco guarda só o caminho
// (MaintenanceTicketPhoto.storagePath), nunca a imagem, para não inchar o banco.
//
// Diferença: bucket PRIVADO `maintenance-photos`. São registro interno de defeito (não divulgação)
// e nunca vão para hóspede; quem vê recebe uma URL assinada de curta duração. Caminho
// `{tenantId}/{ticketId}/{uuid}.{ext}`.

export const MAINTENANCE_PHOTO_BUCKET = "maintenance-photos";
// O app reduz a foto no celular antes de enviar (lado maior ~1600px, JPEG); 3 MB é folga.
export const MAX_MAINTENANCE_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_MAINTENANCE_PHOTOS_PER_TICKET = 12;
const SIGNED_URL_SECONDS = 60 * 60;

export class MaintenancePhotoError extends Error {}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  try {
    // Já existindo, devolve erro (ignorado).
    await supabaseAdmin.storage.createBucket(MAINTENANCE_PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_MAINTENANCE_PHOTO_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  } catch {
    /* já existe — ok */
  }
  bucketEnsured = true;
}

// Sobe a foto e devolve o caminho no bucket. Confere a assinatura real dos bytes — o tipo
// declarado pelo cliente nunca é confiado.
export async function uploadMaintenancePhoto(tenantId: string, ticketId: string, buffer: Buffer): Promise<string> {
  if (buffer.length === 0) throw new MaintenancePhotoError("Foto vazia.");
  if (buffer.length > MAX_MAINTENANCE_PHOTO_BYTES) throw new MaintenancePhotoError("A foto passa do tamanho máximo de 3 MB.");
  const image = sniffImage(buffer);
  if (!image) throw new MaintenancePhotoError("Formato de foto inválido. Envie JPEG, PNG ou WEBP.");

  await ensureBucket();
  const path = `${tenantId}/${ticketId}/${randomUUID()}.${image.ext}`;
  const { error } = await supabaseAdmin.storage
    .from(MAINTENANCE_PHOTO_BUCKET)
    .upload(path, buffer, { contentType: image.mime, upsert: false });
  if (error) throw new Error(`Falha ao guardar a foto: ${error.message}`);
  return path;
}

// Remove um arquivo que subiu mas não chegou a ser gravado no banco. Nunca derruba a operação.
export async function removeMaintenancePhoto(path: string): Promise<void> {
  try {
    await supabaseAdmin.storage.from(MAINTENANCE_PHOTO_BUCKET).remove([path]);
  } catch (err) {
    console.error("[maintenancePhotoStorage] falha ao remover foto órfã:", err);
  }
}

// URLs assinadas (1h) para exibir as fotos, na mesma ordem dos caminhos; null se falhar.
export async function signedMaintenancePhotoUrls(paths: string[]): Promise<(string | null)[]> {
  if (paths.length === 0) return [];
  const { data, error } = await supabaseAdmin.storage
    .from(MAINTENANCE_PHOTO_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error || !data) return paths.map(() => null);
  const byPath = new Map(data.map((d) => [d.path, d.signedUrl]));
  return paths.map((p) => byPath.get(p) ?? null);
}

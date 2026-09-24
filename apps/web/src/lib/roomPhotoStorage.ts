import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/utils/supabaseAdmin";

// Fotos dos apartamentos no Supabase Storage — nunca dentro da linha de `rooms`. Guardadas como
// data URI base64 (164 KB por quarto, 62% do banco), toda leitura de "quarto inteiro" arrastava
// megabytes pelo Postgres/pooler/Node (ver PRD.md, Fase 30). Agora `Room.photos` guarda só a URL
// pública da foto.
//
// Bucket PÚBLICO `room-photos`: são fotos de divulgação do quarto, exibidas na tela de cadastro e
// enviadas ao hóspede por WhatsApp (o provedor precisa alcançar a URL). O caminho
// `{tenantId}/{roomId}/{uuid}.{ext}` não é listável sem a service role e o uuid não é adivinhável.

export const ROOM_PHOTO_BUCKET = "room-photos";
export const MAX_ROOM_PHOTOS = 12;
// Mesmos limites do modal de cadastro (CadastroApartamentoModal): 3 MB por foto, PNG/JPEG/WEBP.
export const MAX_ROOM_PHOTO_BYTES = 3 * 1024 * 1024;

export class RoomPhotoError extends Error {}

type SniffedImage = { mime: string; ext: string };

// Confere a assinatura de bytes real — o tipo declarado no data URI é controlado pelo cliente e
// nunca é confiado (evita gravar HTML/SVG rotulado como imagem num bucket público).
export function sniffImage(buf: Buffer): SniffedImage | null {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { mime: "image/png", ext: "png" };
  }
  if (buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { mime: "image/webp", ext: "webp" };
  }
  return null;
}

let bucketEnsured = false;
async function ensureBucket() {
  if (bucketEnsured) return;
  try {
    // Já existindo, devolve erro (ignorado) — a criação é idempotente do ponto de vista do app.
    await supabaseAdmin.storage.createBucket(ROOM_PHOTO_BUCKET, {
      public: true,
      fileSizeLimit: MAX_ROOM_PHOTO_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
  } catch {
    /* já existe — ok */
  }
  bucketEnsured = true;
}

function tenantUrlPrefix(tenantId: string): string {
  const sample = supabaseAdmin.storage.from(ROOM_PHOTO_BUCKET).getPublicUrl(`${tenantId}/x`).data.publicUrl;
  return sample.slice(0, -1); // termina em ".../{tenantId}/"
}

/** Caminho do objeto no bucket a partir da URL pública do tenant; null se não for uma foto dele. */
function pathFromUrl(tenantId: string, url: string): string | null {
  const prefix = tenantUrlPrefix(tenantId);
  if (!url.startsWith(prefix)) return null;
  const rest = url.slice(prefix.length);
  if (!rest || rest.includes("..") || rest.includes("?")) return null;
  return `${tenantId}/${rest}`;
}

export async function removeRoomPhotoObjects(tenantId: string, urls: string[]): Promise<void> {
  const paths = urls.map((u) => pathFromUrl(tenantId, u)).filter((p): p is string => !!p);
  if (paths.length === 0) return;
  try {
    await supabaseAdmin.storage.from(ROOM_PHOTO_BUCKET).remove(paths);
  } catch (err) {
    // Limpeza de órfãos nunca pode derrubar a operação principal — sobra só um arquivo solto.
    console.error("[roomPhotoStorage] falha ao remover fotos órfãs:", err);
  }
}

async function uploadDataUri(tenantId: string, roomId: string, dataUri: string): Promise<string> {
  const marker = ";base64,";
  const idx = dataUri.indexOf(marker);
  if (!dataUri.startsWith("data:image/") || idx < 0) throw new RoomPhotoError("Formato de foto inválido. Envie imagens PNG, JPEG ou WEBP.");

  const buffer = Buffer.from(dataUri.slice(idx + marker.length), "base64");
  if (buffer.length > MAX_ROOM_PHOTO_BYTES) throw new RoomPhotoError("Uma ou mais fotos excedem o tamanho máximo de 3MB.");
  const image = sniffImage(buffer);
  if (!image) throw new RoomPhotoError("Formato de foto inválido. Envie imagens PNG, JPEG ou WEBP.");

  const path = `${tenantId}/${roomId}/${randomUUID()}.${image.ext}`;
  const { error } = await supabaseAdmin.storage.from(ROOM_PHOTO_BUCKET).upload(path, buffer, { contentType: image.mime, upsert: false });
  if (error) throw new Error(`Falha ao guardar foto do apartamento: ${error.message}`);
  return supabaseAdmin.storage.from(ROOM_PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Converte a lista de fotos vinda do cliente na lista de URLs a gravar em `Room.photos`:
 * data URIs novas sobem para o Storage; URLs já existentes do PRÓPRIO tenant são mantidas; qualquer
 * outra coisa (URL externa, URL de outro hotel) é rejeitada — senão o cliente poderia apontar o
 * quarto para um arquivo alheio, que depois seria enviado por WhatsApp ou apagado na limpeza.
 * `uploaded` lista as URLs criadas agora, para o chamador desfazer se a gravação no banco falhar.
 */
export async function normalizeRoomPhotos(
  tenantId: string,
  roomId: string,
  input: unknown
): Promise<{ photos: string[]; uploaded: string[] }> {
  if (!Array.isArray(input) || input.some((p) => typeof p !== "string")) {
    throw new RoomPhotoError("Lista de fotos inválida.");
  }
  if (input.length > MAX_ROOM_PHOTOS) {
    throw new RoomPhotoError(`Limite de ${MAX_ROOM_PHOTOS} fotos por apartamento atingido.`);
  }

  await ensureBucket();
  const uploaded: string[] = [];
  // allSettled (não all): se uma foto falha, as demais uploads em andamento precisam terminar para
  // entrarem na limpeza — com `all` elas continuariam depois do reject e vazariam objetos órfãos.
  const results = await Promise.allSettled(
    (input as string[]).map(async (item) => {
      if (item.startsWith("data:")) {
        const url = await uploadDataUri(tenantId, roomId, item);
        uploaded.push(url);
        return url;
      }
      if (pathFromUrl(tenantId, item)) return item;
      throw new RoomPhotoError("Foto inválida. Use o envio de imagem do sistema.");
    })
  );

  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) {
    await removeRoomPhotoObjects(tenantId, uploaded);
    throw failed.reason;
  }
  return { photos: results.map((r) => (r as PromiseFulfilledResult<string>).value), uploaded };
}

/** Sobe uma data URI já sniffada (uso do script de migração e de testes). */
export async function uploadRoomPhotoDataUri(tenantId: string, roomId: string, dataUri: string): Promise<string> {
  await ensureBucket();
  return uploadDataUri(tenantId, roomId, dataUri);
}

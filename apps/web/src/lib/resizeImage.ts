// Reduz uma foto tirada no celular antes de enviar (navegador): lado maior até `maxSide` px, JPEG.
// Foto de celular costuma ter 3–8 MB; reduzida fica em ~200–500 KB — sobe rápido no 4G do hotel e
// mantém o Storage pequeno. Respeita a orientação EXIF (foto "deitada" não vira de lado).
export async function resizeImageFile(file: File, maxSide = 1600, quality = 0.82): Promise<Blob> {
  const bitmap = await loadBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar a foto.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  if ("close" in bitmap && typeof bitmap.close === "function") bitmap.close();

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível preparar a foto."))), "image/jpeg", quality);
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* cai no <img> abaixo */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível abrir a foto."));
      img.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Migra Room.photos de data URI base64 (dentro da linha) para URLs no Supabase Storage.
// Ver PRD.md, Fase 30. Idempotente: quartos já migrados (só URLs) são ignorados.
//
// Uso (a partir de apps/web, com as variáveis DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL e
// SUPABASE_SERVICE_ROLE_KEY no ambiente, ex.: --env-file=.env.local):
//   npx tsx --env-file=.env.local scripts/migrate-room-photos-to-storage.ts            # simulação
//   npx tsx --env-file=.env.local scripts/migrate-room-photos-to-storage.ts --apply    # grava
//
// Antes de gravar, salva um backup JSON (id, tenantId, photos originais) em BACKUP_PATH
// (padrão ./room-photos-backup-<timestamp>.json). Não altera `updatedAt` dos quartos: o agente
// operacional usa esse campo para detectar quarto "esquecido" em manutenção/sujo.
import { writeFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { removeRoomPhotoObjects, uploadRoomPhotoDataUri } from "../src/lib/roomPhotoStorage";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

async function main() {
  const rooms = await prisma.room.findMany({
    select: { id: true, tenantId: true, number: true, photos: true, updatedAt: true },
  });
  const legacy = rooms.filter((r) => r.photos.some((p) => p.startsWith("data:")));
  const legacyPhotos = legacy.reduce((n, r) => n + r.photos.filter((p) => p.startsWith("data:")).length, 0);
  const legacyChars = legacy.reduce((n, r) => n + r.photos.reduce((m, p) => m + p.length, 0), 0);

  console.log(`Quartos no total: ${rooms.length} | com foto em base64: ${legacy.length} | fotos a migrar: ${legacyPhotos}`);
  console.log(`Volume de base64 nessas linhas: ${(legacyChars / 1024 / 1024).toFixed(1)} MB (texto)`);
  if (!apply) {
    console.log("Simulação — nada foi gravado. Rode com --apply para migrar.");
    return;
  }
  if (legacy.length === 0) return;

  const backupPath = process.env.BACKUP_PATH || `./room-photos-backup-${Date.now()}.json`;
  writeFileSync(backupPath, JSON.stringify(legacy.map((r) => ({ id: r.id, tenantId: r.tenantId, number: r.number, photos: r.photos }))));
  console.log(`Backup salvo em ${backupPath}`);

  let migrated = 0;
  let failed = 0;
  for (const room of legacy) {
    const uploaded: string[] = [];
    try {
      const newPhotos: string[] = [];
      for (const photo of room.photos) {
        if (photo.startsWith("data:")) {
          const url = await uploadRoomPhotoDataUri(room.tenantId, room.id, photo);
          uploaded.push(url);
          newPhotos.push(url);
        } else {
          newPhotos.push(photo);
        }
      }
      // Só grava se ninguém mexeu nas fotos enquanto migrávamos; `updatedAt` explícito para não
      // "renovar" o quarto (ver cabeçalho).
      const res = await prisma.room.updateMany({
        where: { id: room.id, tenantId: room.tenantId, photos: { equals: room.photos } },
        data: { photos: newPhotos, updatedAt: room.updatedAt },
      });
      if (res.count === 0) throw new Error("as fotos do quarto mudaram durante a migração");
      migrated++;
      console.log(`  ✓ quarto ${room.number}: ${newPhotos.length} foto(s)`);
    } catch (err) {
      failed++;
      await removeRoomPhotoObjects(room.tenantId, uploaded);
      console.error(`  ✗ quarto ${room.number} (${room.id}):`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`Concluído: ${migrated} migrado(s), ${failed} com falha.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

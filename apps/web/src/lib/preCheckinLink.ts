import { randomBytes } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

// Resolve a URL pública do app para montar o link de pré-check-in enviado ao hóspede.
// Prioriza NEXT_PUBLIC_APP_URL (configurável), cai para VERCEL_URL (preenchida automaticamente
// pelo Vercel em cada deploy) e por fim localhost para desenvolvimento.
export function resolveAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;

  const vercelUrl = process.env.VERCEL_URL?.trim();
  if (vercelUrl) return `https://${vercelUrl}`;

  return "http://localhost:3000";
}

type TxClient = PrismaClient | Prisma.TransactionClient;

// Gera um novo link de pré-check-in para a reserva, revogando qualquer link ainda ativo
// (PENDING/OPENED) que essa mesma reserva já tivesse — só o link mais recente enviado ao
// hóspede continua válido, o que também é a forma mais simples de implementar "reenviar".
export async function createPreCheckinLink(
  tx: TxClient,
  params: { tenantId: string; reservationId: string; checkInDate: Date }
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const { tenantId, reservationId, checkInDate } = params;

  await tx.preCheckinLink.updateMany({
    where: { reservationId, status: { in: ["PENDING", "OPENED"] } },
    data: { status: "REVOKED" },
  });

  const token = randomBytes(32).toString("base64url");
  // Válido até 48h após o check-in previsto, para cobrir hóspedes que preenchem já na portaria
  // ou com atraso, sem deixar o link aberto indefinidamente.
  const expiresAt = new Date(checkInDate.getTime() + 48 * 60 * 60 * 1000);

  await tx.preCheckinLink.create({
    data: { tenantId, reservationId, token, expiresAt },
  });

  return { token, url: `${resolveAppBaseUrl()}/self-checkin/${token}`, expiresAt };
}

function loadLinkWithReservation(tx: TxClient, token: string) {
  return tx.preCheckinLink.findUnique({
    where: { token },
    include: {
      reservation: { include: { room: { include: { tenant: true } } } },
    },
  });
}

export type PreCheckinLinkValidation =
  | { ok: true; link: NonNullable<Awaited<ReturnType<typeof loadLinkWithReservation>>> }
  | { ok: false; reason: "NOT_FOUND" | "EXPIRED" | "REVOKED" };

// Valida um token recebido do hóspede via URL pública. Marca o link como OPENED na primeira
// leitura (sem invalidar acesso, é só telemetria de "o hóspede chegou a abrir o link").
export async function validatePreCheckinToken(
  tx: TxClient,
  token: string
): Promise<PreCheckinLinkValidation> {
  const link = await loadLinkWithReservation(tx, token);

  if (!link) return { ok: false, reason: "NOT_FOUND" };
  if (link.status === "REVOKED") return { ok: false, reason: "REVOKED" };

  if (link.status !== "COMPLETED" && link.expiresAt.getTime() < Date.now()) {
    await tx.preCheckinLink.update({ where: { id: link.id }, data: { status: "EXPIRED" } });
    return { ok: false, reason: "EXPIRED" };
  }

  if (link.status === "PENDING") {
    await tx.preCheckinLink.update({ where: { id: link.id }, data: { status: "OPENED", openedAt: new Date() } });
  }

  return { ok: true, link };
}

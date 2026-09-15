import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Rota pública (sem sessão — já coberta por "/api/public/" no whitelist do middleware.ts) usada
// pela tela /avaliar/[token] do funil de satisfação pós-checkout. Nunca aceita tenantId/
// stayCheckinId/guestId do cliente: tudo é resolvido a partir do token no servidor, mesmo padrão
// do pré-check-in (ver CLAUDE.md, Segurança §5).

// Nota mínima para o hóspede ser redirecionado a um review público — abaixo disso, a insatisfação
// vira atendimento interno (HumanEscalation) em vez de virar reclamação pública. Fixo por ora
// (mesmo valor usado como referência no projeto que originou este módulo); vira configurável por
// tenant se algum assinante pedir um limiar diferente.
const SATISFACTION_THRESHOLD = 4;

function friendlyTokenError(status: string | null): string {
  if (status === "COMPLETED") return "Você já respondeu esta avaliação. Obrigado!";
  return "Link inválido ou expirado. Se você acabou de se hospedar conosco, entre em contato com a recepção.";
}

async function loadRequest(token: string) {
  return prisma.reviewFeedbackRequest.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      status: true,
      expiresAt: true,
      satisfaction: true,
      tenant: { select: { name: true, tradeName: true, logoUrl: true } },
    },
  });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await loadRequest(token);

  if (!record || record.expiresAt < new Date()) {
    return NextResponse.json({ success: false, error: friendlyTokenError(null) }, { status: 404 });
  }
  if (record.status === "COMPLETED") {
    return NextResponse.json({ success: false, error: friendlyTokenError("COMPLETED"), alreadyCompleted: true }, { status: 409 });
  }

  if (record.status === "PENDING") {
    await prisma.reviewFeedbackRequest.update({ where: { token }, data: { status: "OPENED", openedAt: new Date() } });
  }

  return NextResponse.json({
    success: true,
    hotel: { name: record.tenant.tradeName || record.tenant.name, logoUrl: record.tenant.logoUrl },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const record = await loadRequest(token);

    if (!record || record.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: friendlyTokenError(null) }, { status: 404 });
    }
    if (record.status === "COMPLETED") {
      return NextResponse.json({ success: false, error: friendlyTokenError("COMPLETED") }, { status: 409 });
    }

    const body = await req.json();
    const satisfaction = Number(body?.satisfaction);
    if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) {
      return NextResponse.json({ success: false, error: "Nota inválida." }, { status: 400 });
    }

    if (satisfaction >= SATISFACTION_THRESHOLD) {
      const redirect = await pickPublicReviewChannel(record.tenantId);
      await prisma.reviewFeedbackRequest.update({
        where: { token },
        data: {
          status: "COMPLETED",
          completedAt: new Date(),
          satisfaction,
          outcome: "REDIRECTED_TO_REVIEW",
          redirectChannel: redirect?.channel,
        },
      });
      return NextResponse.json({ success: true, outcome: "REDIRECTED_TO_REVIEW", redirectUrl: redirect?.url ?? null });
    }

    // Insatisfação — vira atendimento interno em vez de deixar o hóspede seguir para um review
    // público. Reaproveita o mesmo source de escalação dos alertas de review crítico (mesmo
    // "balde" no sino de intervenção humana): tanto faz se a insatisfação veio de um canal externo
    // ou direto do hóspede no funil, o time precisa agir do mesmo jeito.
    await prisma.$transaction([
      prisma.reviewFeedbackRequest.update({
        where: { token },
        data: { status: "COMPLETED", completedAt: new Date(), satisfaction, outcome: "ESCALATED_INTERNALLY" },
      }),
      prisma.humanEscalation.create({
        data: {
          tenantId: record.tenantId,
          source: "REVIEW_MONITOR",
          reason: `Hóspede avaliou a estadia com nota ${satisfaction}/5 no funil pós-checkout — atenda antes que vire uma reclamação pública.`,
          entityType: "POST_CHECKOUT_FEEDBACK",
          entityId: record.id,
        },
      }),
    ]);

    return NextResponse.json({ success: true, outcome: "ESCALATED_INTERNALLY" });
  } catch (error: any) {
    console.error("[POST /api/public/review-feedback/[token]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao registrar avaliação." }, { status: 500 });
  }
}

// Prioriza Google Maps sobre TripAdvisor (link de review mais simples/direto de montar) — Booking
// fica de fora: reviews lá só podem ser deixados por quem reservou através do próprio Booking.com,
// não existe um link genérico "escrever review" para qualquer hóspede.
async function pickPublicReviewChannel(tenantId: string): Promise<{ channel: "GOOGLE_MAPS" | "TRIPADVISOR"; url: string } | null> {
  const connectors = await prisma.reviewChannelConnector.findMany({
    where: { tenantId, status: "ACTIVE", channel: { in: ["GOOGLE_MAPS", "TRIPADVISOR"] }, externalId: { not: null } },
    select: { channel: true, externalId: true },
  });
  const byChannel = new Map(connectors.map((c) => [c.channel, c.externalId!]));

  const placeId = byChannel.get("GOOGLE_MAPS");
  if (placeId) {
    return { channel: "GOOGLE_MAPS", url: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}` };
  }
  const tripadvisorUrl = byChannel.get("TRIPADVISOR");
  if (tripadvisorUrl) {
    return { channel: "TRIPADVISOR", url: tripadvisorUrl };
  }
  return null;
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { ReviewChannel } from "@prisma/client";

// GET /api/tenant/reviews/connectors — lista os 6 canais possíveis do módulo de reviews, com a
// config já salva (quando existe). Sempre devolve as 6 linhas de uma vez (uma sintética,
// PENDING_AUTH, para o canal ainda não configurado) para a tela desenhar os cards sem um segundo
// fetch por canal. Admin only — os dados aqui controlam integração externa do hotel.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const saved = await prisma.reviewChannelConnector.findMany({
      where: { tenantId },
      select: {
        channel: true,
        status: true,
        externalId: true,
        lastSyncAt: true,
        nextSyncAt: true,
        errorMessage: true,
      },
    });
    const savedByChannel = new Map(saved.map((c) => [c.channel, c]));

    const connectors = Object.values(ReviewChannel).map(
      (channel) =>
        savedByChannel.get(channel) || {
          channel,
          status: "PENDING_AUTH" as const,
          externalId: null,
          lastSyncAt: null,
          nextSyncAt: null,
          errorMessage: null,
        }
    );

    return NextResponse.json({ success: true, connectors });
  } catch (error: any) {
    console.error("[GET /api/tenant/reviews/connectors] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar conectores." }, { status: 500 });
  }
}

// PATCH /api/tenant/reviews/connectors — configura (ou reconfigura) o identificador do negócio no
// canal (ex.: Place ID do Google Maps) e ativa o conector para entrar no próximo ciclo do worker.
// Admin only — mesma regra da tela de Configurações > API Whatsapp para o mesmo tipo de dado.
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
    const tenantId = session!.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
    }

    const body = await req.json();
    const channel = body?.channel;
    if (!channel || !Object.values(ReviewChannel).includes(channel)) {
      return NextResponse.json({ success: false, error: "Canal inválido." }, { status: 400 });
    }

    const externalId = String(body?.externalId || "").trim();
    if (!externalId) {
      return NextResponse.json(
        { success: false, error: "Identificador do negócio no canal é obrigatório." },
        { status: 400 }
      );
    }

    const connector = await prisma.reviewChannelConnector.upsert({
      where: { tenantId_channel: { tenantId, channel } },
      create: { tenantId, channel, externalId, status: "ACTIVE", nextSyncAt: new Date() },
      update: {
        externalId,
        status: "ACTIVE",
        errorMessage: null,
        errorCount: 0,
        firstErrorAt: null,
        nextSyncAt: new Date(), // força a próxima sincronização já no ciclo seguinte do worker
      },
      select: { channel: true, status: true, externalId: true, lastSyncAt: true, nextSyncAt: true, errorMessage: true },
    });

    return NextResponse.json({ success: true, connector });
  } catch (error: any) {
    console.error("[PATCH /api/tenant/reviews/connectors] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao configurar conector." }, { status: 500 });
  }
}

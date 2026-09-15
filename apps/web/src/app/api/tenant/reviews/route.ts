import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { ReviewChannel } from "@prisma/client";

const PAGE_SIZE = 30;

// GET /api/tenant/reviews?channel=GOOGLE_MAPS&page=1 — lista os reviews coletados do tenant da
// sessão, mais recentes primeiro. Qualquer usuário autenticado do tenant pode ver (leitura, sem
// requireAdmin — quem configura o canal é admin, ver ./connectors/route.ts). select explícito (regra
// de performance/egress do projeto): rawData e o JSON bruto de sentimentResult nunca saem daqui —
// só os campos já achatados (sentiment, responseText, responseStatus) que a tela realmente desenha.
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const tenantId = session.tenantId;

    const { searchParams } = new URL(req.url);
    const channelParam = searchParams.get("channel");
    const channel =
      channelParam && Object.values(ReviewChannel).includes(channelParam as ReviewChannel)
        ? (channelParam as ReviewChannel)
        : undefined;
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const where = { tenantId, ...(channel ? { channel } : {}) };

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        select: {
          id: true,
          channel: true,
          rating: true,
          title: true,
          body: true,
          authorName: true,
          url: true,
          publishedAt: true,
          sentiment: true,
          responseStatus: true,
          responseText: true,
        },
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.review.count({ where }),
    ]);

    return NextResponse.json({ success: true, reviews, total, page, pageSize: PAGE_SIZE });
  } catch (error: any) {
    console.error("[GET /api/tenant/reviews] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao buscar reviews." }, { status: 500 });
  }
}

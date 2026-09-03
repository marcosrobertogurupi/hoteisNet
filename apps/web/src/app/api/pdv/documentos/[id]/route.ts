import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { signedFiscalUrl } from "@/lib/fiscalStorage";

// GET /api/pdv/documentos/[id] — dados de um documento fiscal + URLs assinadas de curta duração
// para baixar o XML autorizado e o DANFE (os arquivos ficam no Storage, nunca no Postgres).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }
    const { id } = await params;

    const doc = await prisma.fiscalDocument.findFirst({
      where: { id, tenantId: session.tenantId },
      select: {
        id: true,
        model: true,
        series: true,
        number: true,
        status: true,
        accessKey: true,
        protocol: true,
        authorizedAt: true,
        rejectionReason: true,
        environment: true,
        xmlPath: true,
        danfePath: true,
        comandaSession: { select: { comanda: { select: { number: true } } } },
      },
    });
    if (!doc) return NextResponse.json({ success: false, error: "Documento não encontrado." }, { status: 404 });

    const [xmlUrl, danfeUrl] = await Promise.all([
      doc.xmlPath ? signedFiscalUrl(doc.xmlPath) : Promise.resolve(null),
      doc.danfePath ? signedFiscalUrl(doc.danfePath) : Promise.resolve(null),
    ]);

    return NextResponse.json({
      success: true,
      documento: {
        id: doc.id,
        modelo: doc.model,
        serie: doc.series,
        numero: doc.number,
        status: doc.status,
        chave: doc.accessKey,
        protocolo: doc.protocol,
        autorizadoEm: doc.authorizedAt,
        motivoRejeicao: doc.rejectionReason,
        ambiente: doc.environment,
        comanda: doc.comandaSession?.comanda.number ?? null,
        xmlUrl,
        danfeUrl,
      },
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/documentos/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth";

// Catálogo do PDV do restaurante para efeito fiscal: lista pratos (Dish) e industrializados
// (Product) com o perfil tributário (FiscalProfile) vinculado, e permite atribuir/trocar esse
// perfil. Um item sem perfil não pode ser vendido no PDV até o contador definir a tributação.

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const [dishes, products] = await Promise.all([
      prisma.dish.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          price: true,
          active: true,
          fiscalProfileId: true,
          fiscalProfile: { select: { id: true, name: true, ncm: true, cfop: true } },
        },
      }),
      prisma.product.findMany({
        where: { tenantId: session.tenantId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          salePrice: true,
          fiscalProfileId: true,
          fiscalProfile: { select: { id: true, name: true, ncm: true, cfop: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      pratos: dishes.map((d) => ({
        id: d.id,
        nome: d.name,
        preco: d.price,
        ativo: d.active,
        perfilFiscalId: d.fiscalProfileId,
        perfilFiscal: d.fiscalProfile,
      })),
      produtos: products.map((p) => ({
        id: p.id,
        nome: p.name,
        preco: p.salePrice,
        perfilFiscalId: p.fiscalProfileId,
        perfilFiscal: p.fiscalProfile,
      })),
    });
  } catch (error: any) {
    console.error("[GET /api/pdv/catalogo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// PATCH — atribui (ou remove, com perfilFiscalId null) o perfil fiscal de um item.
// Body: { tipo: "PRATO" | "PRODUTO", id, perfilFiscalId }
export async function PATCH(req: NextRequest) {
  try {
    const session = await getSessionUser(req);
    const adminError = requireAdmin(session);
    if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });

    const body = await req.json();
    const tipo = String(body.tipo || "").toUpperCase();
    const itemId = String(body.id || "");
    const perfilFiscalId: string | null = body.perfilFiscalId ? String(body.perfilFiscalId) : null;

    if (!itemId || (tipo !== "PRATO" && tipo !== "PRODUTO")) {
      return NextResponse.json({ success: false, error: "Informe o tipo (PRATO ou PRODUTO) e o id do item." }, { status: 400 });
    }

    // O perfil precisa pertencer ao mesmo tenant — nunca confiar no id cru do body.
    if (perfilFiscalId) {
      const profile = await prisma.fiscalProfile.findFirst({
        where: { id: perfilFiscalId, tenantId: session!.tenantId! },
        select: { id: true },
      });
      if (!profile) {
        return NextResponse.json({ success: false, error: "Perfil fiscal inválido." }, { status: 400 });
      }
    }

    const result =
      tipo === "PRATO"
        ? await prisma.dish.updateMany({
            where: { id: itemId, tenantId: session!.tenantId! },
            data: { fiscalProfileId: perfilFiscalId },
          })
        : await prisma.product.updateMany({
            where: { id: itemId, tenantId: session!.tenantId! },
            data: { fiscalProfileId: perfilFiscalId },
          });

    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Item não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[PATCH /api/pdv/catalogo] Erro:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

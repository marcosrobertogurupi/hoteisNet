import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const products = await prisma.product.findMany({
      where: {
        tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ success: true, products });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

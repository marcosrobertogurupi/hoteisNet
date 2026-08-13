import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

export async function GET(req: NextRequest) {
  try {
    const tariffs = await prisma.tariff.findMany({
      where: {
        tenantId: { in: [DEFAULT_TENANT_ID, "TNT-01"] },
      },
      orderBy: { price: "asc" },
    });

    return NextResponse.json({ success: true, tariffs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

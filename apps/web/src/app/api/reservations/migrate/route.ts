import { NextResponse } from "next/server";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});

const migrationSQL = `
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "guestId" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "tariffId" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "tariffName" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "guestCpf" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "dailyRate" NUMERIC DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "totalDiarias" NUMERIC DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "discountAmount" NUMERIC DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "cashRegisterId" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "operatorName" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "notes" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "adults" INTEGER DEFAULT 1;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "children" INTEGER DEFAULT 0;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "hasWhatsapp" BOOLEAN DEFAULT false;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "wppSent" BOOLEAN DEFAULT false;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "reservationNumber" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "roomDescription" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "roomCategory" TEXT;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS "roomFloor" TEXT;
INSERT INTO tenants (id, name, email, "createdAt", "updatedAt") VALUES ('TNT-01', 'Hotel HoteisNet Demo', 'contato@hoteisnet.demo', NOW(), NOW()) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS reservation_payments (
  id TEXT PRIMARY KEY,
  "reservationId" TEXT,
  "tenantId" TEXT,
  "cashRegisterId" TEXT,
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  "paymentMethod" TEXT DEFAULT 'DINHEIRO',
  "operatorName" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE reservation_payments ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
NOTIFY pgrst, 'reload schema';
`;

export async function POST() {
  const client = await pool.connect();
  const results: { stmt: string; ok: boolean; error?: string }[] = [];

  try {
    const statements = migrationSQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 10);

    for (const stmt of statements) {
      try {
        await client.query(stmt + ";");
        results.push({ stmt: stmt.substring(0, 70), ok: true });
      } catch (err: any) {
        results.push({ stmt: stmt.substring(0, 70), ok: false, error: err.message });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    client.release();
  }
}

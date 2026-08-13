import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/utils/supabaseClient";
import { Pool } from "pg";

let pool: Pool;

function getConnectionString() {
  const envUrl = process.env.DIRECT_URL || process.env.DATABASE_URL || "";
  if (envUrl.includes("db.skszyqxozagrhqrdhhbf.supabase.co")) {
    return envUrl.replace("db.skszyqxozagrhqrdhhbf.supabase.co", "aws-0-sa-east-1.pooler.supabase.com");
  }
  return envUrl || "postgresql://postgres.skszyqxozagrhqrdhhbf:HoteisNetSaaS2026!Db@aws-0-sa-east-1.pooler.supabase.com:5432/postgres?schema=public";
}

const targetConnString = getConnectionString();

if ((global as any)._pgPool && (global as any)._pgPoolConnString === targetConnString) {
  pool = (global as any)._pgPool;
} else {
  if ((global as any)._pgPool) {
    try { (global as any)._pgPool.end(); } catch {}
  }
  pool = new Pool({
    connectionString: targetConnString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });
  (global as any)._pgPool = pool;
  (global as any)._pgPoolConnString = targetConnString;
}

// GET /api/reservations — lista reservas
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || "TNT-01";

    const { data: reservations, error } = await supabaseAdmin
      .from("reservations")
      .select(`
        *,
        rooms(id, number, floor, status, room_categories(name, description))
      `)
      .eq("tenantId", tenantId)
      .order("createdAt", { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, reservations: reservations || [] });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message });
  }
}

// POST /api/reservations — cria uma nova reserva
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      tenantId = "TNT-01",
      roomId,
      tariffId,
      tariffName,
      guestName,
      guestCpf,
      guestPhone,
      guestId,
      checkInDate,
      checkOutDate,
      dailyRate,
      totalDiarias,
      discountAmount = 0,
      totalAmount,
      depositPaid = 0,
      adults = 1,
      children = 0,
      hasWhatsapp = false,
      cashRegisterId,
      operatorName,
      notes,
      roomDescription,
      roomCategory,
      roomFloor,
      status = "CONFIRMED",
      payments = [], // array of { amount, paymentMethod }
    } = body;

    if (!roomId || !guestName || !checkInDate || !checkOutDate || !tariffId) {
      return NextResponse.json({
        success: false,
        error: "Campos obrigatórios faltando: Quarto, Hóspede, Chegada, Saída ou Tarifa.",
      });
    }

    let reservationNumber = "RES-" + String(Math.floor(500 + Math.random() * 9000));
    let reservationId = crypto.randomUUID();
    let savedViaPool = false;
    let client: any = null;

    // 1. Tentar conexão direta PostgreSQL pelo Pool (se disponível)
    try {
      client = await pool.connect();
      await client.query("CREATE SEQUENCE IF NOT EXISTS reservation_number_seq START 500;");
      await client.query("BEGIN");
      const seqResult = await client.query("SELECT nextval('reservation_number_seq')::TEXT AS num");
      if (seqResult.rows && seqResult.rows[0]?.num) {
        reservationNumber = "RES-" + String(seqResult.rows[0].num).padStart(4, "0");
      }

      // Resolver UUID real do quarto (evita erro de FK caso venha o número "102")
      let realRoomId = roomId;
      const roomRes = await client.query(
        `SELECT id FROM rooms WHERE id::text = $1 OR number = $1 LIMIT 1`,
        [roomId]
      );
      if (roomRes.rows.length > 0) {
        realRoomId = roomRes.rows[0].id;
      } else {
        const catRes = await client.query(`SELECT id FROM room_categories WHERE "tenantId" = $1 LIMIT 1`, [tenantId]);
        const defaultCatId = catRes.rows[0]?.id || "670bea14-9917-4647-beb3-e75faecdcc24";
        const insRoom = await client.query(
          `INSERT INTO rooms (id, number, floor, status, "tenantId", "categoryId")
           VALUES (gen_random_uuid(), $1, 1, 'VACANT_CLEAN', $2, $3)
           RETURNING id`,
          [String(roomId), tenantId, defaultCatId]
        );
        if (insRoom.rows.length > 0) {
          realRoomId = insRoom.rows[0].id;
        }
      }

      await client.query(
        `INSERT INTO reservations (
          id, "tenantId", "roomId", "guestName", "guestCpf", "guestPhone", "guestId",
          "checkInDate", "checkOutDate", "tariffId", "tariffName",
          "dailyRate", "totalDiarias", "discountAmount", "totalAmount", "depositPaid",
          "adults", "children", "hasWhatsapp", "wppSent",
          "cashRegisterId", "operatorName", "notes",
          "roomDescription", "roomCategory", "roomFloor",
          "reservationNumber", status, "preCheckinSent", "createdAt"
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13, $14, $15, $16,
          $17, $18, $19, false,
          $20, $21, $22,
          $23, $24, $25,
          $26, $27, false, NOW()
        )`,
        [
          reservationId, tenantId, realRoomId, guestName, guestCpf || null, guestPhone || null, guestId || null,
          checkInDate, checkOutDate, tariffId, tariffName || null,
          dailyRate || 0, totalDiarias || 0, discountAmount, totalAmount || totalDiarias || 0, depositPaid,
          adults, children, hasWhatsapp,
          cashRegisterId || null, operatorName || null, notes || null,
          roomDescription || null, roomCategory || null, roomFloor || null,
          reservationNumber, status || "CONFIRMED",
        ]
      );

      for (const pmt of payments) {
        if (!pmt.amount || pmt.amount <= 0) continue;
        const pmtId = crypto.randomUUID();
        await client.query(
          `INSERT INTO reservation_payments (id, "reservationId", "tenantId", "cashRegisterId", amount, "paymentMethod", "operatorName", "createdAt")
           VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
          [pmtId, reservationId, tenantId, cashRegisterId || null, pmt.amount, pmt.paymentMethod || "DINHEIRO", operatorName || null]
        );

        if (cashRegisterId) {
          const txId = crypto.randomUUID();
          await client.query(
            `INSERT INTO cash_transactions (id, "cashRegisterId", type, amount, description, "paymentMethod", "createdAt")
             VALUES ($1, $2, 'INCOME', $3, $4, $5, NOW())`,
            [
              txId,
              cashRegisterId,
              pmt.amount,
              `Adiantamento Reserva ${reservationNumber} - ${guestName}`,
              pmt.paymentMethod || "DINHEIRO",
            ]
          );
        }
      }

      await client.query("COMMIT");
      savedViaPool = true;
    } catch (poolErr: any) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error("[POST /api/reservations] Pool pg error detail:", poolErr);
      console.warn("[POST /api/reservations] Pool pg indisponível, acionando fallback Supabase HTTP:", poolErr.message);
    } finally {
      if (client) client.release();
    }

    // 2. Fallback transparente via Supabase REST API (HTTPS) caso a conexão direta PostgreSQL do pool falhe
    if (!savedViaPool) {
      const finalTotal = totalAmount || totalDiarias || 0;
      const rowData = {
        id: reservationId,
        tenantId,
        roomId,
        guestName,
        guestCpf: guestCpf || null,
        guestPhone: guestPhone || null,
        guestId: guestId || null,
        checkInDate,
        checkOutDate,
        tariffId,
        tariffName: tariffName || null,
        dailyRate: dailyRate || 0,
        totalDiarias: totalDiarias || 0,
        discountAmount: discountAmount || 0,
        totalAmount: finalTotal,
        depositPaid: depositPaid || 0,
        adults: adults || 1,
        children: children || 0,
        hasWhatsapp: !!hasWhatsapp,
        wppSent: false,
        cashRegisterId: cashRegisterId || null,
        operatorName: operatorName || null,
        notes: notes || null,
        roomDescription: roomDescription || null,
        roomCategory: roomCategory || null,
        roomFloor: roomFloor || null,
        reservationNumber,
        status: status || "CONFIRMED",
        preCheckinSent: false,
      };

      const { error: insertError } = await supabaseAdmin
        .from("reservations")
        .insert([rowData]);

      if (insertError) {
        console.error("[POST /api/reservations] Supabase HTTP insert error:", insertError);
        return NextResponse.json({ success: false, error: insertError.message || "Erro ao salvar reserva no banco de dados." });
      }

      if (payments && payments.length > 0) {
        const pmtRows = payments
          .filter((p: any) => p.amount && p.amount > 0)
          .map((p: any) => ({
            id: crypto.randomUUID(),
            reservationId,
            tenantId,
            cashRegisterId: cashRegisterId || null,
            amount: p.amount,
            paymentMethod: p.paymentMethod || "DINHEIRO",
            operatorName: operatorName || null,
          }));
        if (pmtRows.length > 0) {
          await supabaseAdmin.from("reservation_payments").insert(pmtRows);
        }
      }
    }

    return NextResponse.json({
      success: true,
      reservationId,
      reservationNumber,
      message: `Reserva ${reservationNumber} criada com sucesso!`,
    });
  } catch (error: any) {
    console.error("[POST /api/reservations] Error:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro interno ao salvar reserva." });
  }
}

// PATCH /api/reservations — atualiza/move uma reserva existente
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      id,
      tenantId = "TNT-01",
      roomId,
      checkInDate,
      checkOutDate,
      guestName,
      guestCpf,
      guestPhone,
      dailyRate,
      depositPaid,
      totalAmount,
      status,
      notes,
    } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }

    let savedViaPool = false;
    let client: any = null;
    let realRoomId = roomId;

    // Tentar via Pool de conexão direta PostgreSQL
    try {
      client = await pool.connect();

      // Resolver UUID real do quarto caso roomId venha como "105" ou UUID
      if (roomId) {
        const roomRes = await client.query(
          `SELECT id FROM rooms WHERE id::text = $1 OR number = $1 LIMIT 1`,
          [roomId]
        );
        if (roomRes.rows.length > 0) {
          realRoomId = roomRes.rows[0].id;
        } else {
          const catRes = await client.query(`SELECT id FROM room_categories WHERE "tenantId" = $1 LIMIT 1`, [tenantId]);
          const defaultCatId = catRes.rows[0]?.id || "670bea14-9917-4647-beb3-e75faecdcc24";
          const insRoom = await client.query(
            `INSERT INTO rooms (id, number, floor, status, "tenantId", "categoryId")
             VALUES (gen_random_uuid(), $1, 1, 'VACANT_CLEAN', $2, $3)
             RETURNING id`,
            [String(roomId), tenantId, defaultCatId]
          );
          if (insRoom.rows.length > 0) {
            realRoomId = insRoom.rows[0].id;
          }
        }
      }

      // Verificar se a reserva já existe na tabela
      const checkRow = await client.query(
        `SELECT id FROM reservations WHERE id = $1 AND "tenantId" = $2`,
        [id, tenantId]
      );

      if (checkRow.rows.length > 0) {
        // Atualiza reserva existente
        await client.query(
          `UPDATE reservations SET
            "roomId" = COALESCE($1, "roomId"),
            "checkInDate" = COALESCE($2, "checkInDate"),
            "checkOutDate" = COALESCE($3, "checkOutDate"),
            "guestName" = COALESCE($4, "guestName"),
            "guestCpf" = COALESCE($5, "guestCpf"),
            "guestPhone" = COALESCE($6, "guestPhone"),
            "dailyRate" = COALESCE($7, "dailyRate"),
            "depositPaid" = COALESCE($8, "depositPaid"),
            "totalAmount" = COALESCE($9, "totalAmount"),
            "notes" = COALESCE($10, "notes"),
            status = COALESCE($11, status),
            "updatedAt" = NOW()
          WHERE id = $12 AND "tenantId" = $13`,
          [
            realRoomId || null,
            checkInDate || null,
            checkOutDate || null,
            guestName || null,
            guestCpf || null,
            guestPhone || null,
            dailyRate !== undefined ? dailyRate : null,
            depositPaid !== undefined ? depositPaid : null,
            totalAmount !== undefined ? totalAmount : null,
            notes || null,
            status || null,
            id,
            tenantId,
          ]
        );
      } else {
        // Upsert reserva para caso de dados pré-carregados na memória
        await client.query(
          `INSERT INTO reservations (
            id, "tenantId", "roomId", "guestName", "guestCpf", "guestPhone",
            "checkInDate", "checkOutDate", "dailyRate", "depositPaid", "totalAmount",
            status, notes, "reservationNumber", "createdAt"
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, NOW()
          )`,
          [
            id,
            tenantId,
            realRoomId || "102",
            guestName || "HÓSPEDE",
            guestCpf || null,
            guestPhone || null,
            checkInDate || "2026-08-12",
            checkOutDate || "2026-08-15",
            dailyRate || 350,
            depositPaid || 0,
            totalAmount || 350,
            status || "CONFIRMED",
            notes || null,
            id.startsWith("RES-") ? id : `RES-${id.substring(0, 6)}`,
          ]
        );
      }

      savedViaPool = true;
    } catch (poolErr: any) {
      console.error("[PATCH /api/reservations] Pool pg error:", poolErr);
    } finally {
      if (client) client.release();
    }

    // Fallback via Supabase Admin REST API
    if (!savedViaPool) {
      const updateObj: any = {};
      if (roomId) updateObj.roomId = realRoomId || roomId;
      if (checkInDate) updateObj.checkInDate = checkInDate;
      if (checkOutDate) updateObj.checkOutDate = checkOutDate;
      if (guestName) updateObj.guestName = guestName;
      if (guestCpf !== undefined) updateObj.guestCpf = guestCpf;
      if (guestPhone !== undefined) updateObj.guestPhone = guestPhone;
      if (dailyRate !== undefined) updateObj.dailyRate = dailyRate;
      if (depositPaid !== undefined) updateObj.depositPaid = depositPaid;
      if (totalAmount !== undefined) updateObj.totalAmount = totalAmount;
      if (notes !== undefined) updateObj.notes = notes;
      if (status) updateObj.status = status;

      const { error: updateErr } = await supabaseAdmin
        .from("reservations")
        .update(updateObj)
        .eq("id", id)
        .eq("tenantId", tenantId);

      if (updateErr) {
        console.error("[PATCH /api/reservations] Supabase update error:", updateErr);
        return NextResponse.json({ success: false, error: updateErr.message });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reserva ${id} atualizada e salva no banco de dados com sucesso!`,
    });
  } catch (error: any) {
    console.error("[PATCH /api/reservations] Unexpected error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE /api/reservations — exclui/cancela uma reserva
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const tenantId = searchParams.get("tenantId") || "TNT-01";

    if (!id) {
      return NextResponse.json({ success: false, error: "ID da reserva é obrigatório." }, { status: 400 });
    }

    let deletedViaPool = false;
    let client: any = null;

    try {
      client = await pool.connect();
      await client.query(
        `DELETE FROM reservations WHERE id = $1 AND "tenantId" = $2`,
        [id, tenantId]
      );
      deletedViaPool = true;
    } catch (poolErr: any) {
      console.error("[DELETE /api/reservations] Pool pg error:", poolErr);
    } finally {
      if (client) client.release();
    }

    if (!deletedViaPool) {
      await supabaseAdmin
        .from("reservations")
        .delete()
        .eq("id", id)
        .eq("tenantId", tenantId);
    }

    return NextResponse.json({
      success: true,
      message: `Reserva ${id} removida com sucesso!`,
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}


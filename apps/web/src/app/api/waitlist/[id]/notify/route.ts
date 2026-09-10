import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { findWaitlistVacancy, countWaitlistAhead } from "@/lib/waitlistMatch";
import { lockRoomsForReservation } from "@/lib/reservationHelpers";
import { sendUazapiText } from "@/lib/uazapi";
import { sendTenantEmail } from "@/lib/tenantEmail";
import { escapeHtml } from "@/lib/htmlEscape";

const fmtDate = (d: Date) =>
  d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

// Mensagem fixa (sem IA) enviada ao hóspede no aviso manual — a redação em linguagem natural pelo
// agente de atendimento só entra no modo automático (Fase 2).
function buildOfferMessage(guestName: string, categoryName: string, checkIn: Date, checkOut: Date): string {
  const first = (guestName || "").trim().split(/\s+/)[0] || guestName;
  return (
    `Olá, ${first}! Abriu uma vaga para as datas que você queria (${fmtDate(checkIn)} a ${fmtDate(checkOut)}, ${categoryName}). ` +
    `Você ainda tem interesse? Responda por aqui para a nossa recepção confirmar a sua reserva.`
  );
}

function buildOfferEmailHtml(guestName: string, categoryName: string, checkIn: Date, checkOut: Date): string {
  const first = escapeHtml((guestName || "").trim().split(/\s+/)[0] || guestName);
  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
      <div style="background: #0284c7; padding: 20px 28px; color: #ffffff;">
        <h1 style="margin: 0; font-size: 18px; font-weight: 700;">Abriu uma vaga para você</h1>
      </div>
      <div style="padding: 28px; color: #334155; line-height: 1.6; font-size: 14px;">
        <p style="margin-top: 0;">Olá, ${first}!</p>
        <p>Abriu uma vaga para as datas que você queria:</p>
        <div style="background: #f1f5f9; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
          <strong>${escapeHtml(categoryName)}</strong><br/>
          ${fmtDate(checkIn)} a ${fmtDate(checkOut)}
        </div>
        <p>Você ainda tem interesse? Responda a este e-mail ou entre em contato com a nossa recepção para confirmar a sua reserva.</p>
      </div>
    </div>
  `;
}

// POST /api/waitlist/:id/notify — aviso MANUAL: a recepção aciona "avisar o próximo da fila".
// Revalida no servidor que existe um quarto da categoria livre no período antes de avisar.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionUser(req);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({} as any));
    // "furar a fila": avisar mesmo havendo entradas WAITING mais antigas para a categoria/período.
    const overrideQueue = body?.override === true;

    const outcome = await txWithRetry(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: { id, tenantId: session.tenantId!, status: { in: ["WAITING", "NOTIFIED"] } },
        select: {
          id: true,
          guestName: true,
          guestPhone: true,
          guestEmail: true,
          roomCategoryId: true,
          roomCategoryName: true,
          checkInDate: true,
          checkOutDate: true,
          status: true,
          createdAt: true,
        },
      });
      if (!entry) return { code: 404 as const, error: "Entrada não encontrada ou já encerrada." };
      if (!entry.guestPhone && !entry.guestEmail) {
        return { code: 400 as const, error: "A entrada não tem e-mail nem telefone para avisar o hóspede." };
      }

      // Ordem da fila: reavisar uma entrada já NOTIFIED é sempre permitido; avisar uma WAITING com
      // gente mais antiga na frente só com override explícito da recepção.
      let jumpedQueue = false;
      if (entry.status !== "NOTIFIED") {
        const ahead = await countWaitlistAhead(tx, { ...entry, tenantId: session.tenantId! });
        if (ahead.count > 0) {
          if (!overrideQueue) {
            return {
              code: 409 as const,
              needsQueueOverride: true as const,
              aheadCount: ahead.count,
              nextGuestName: ahead.nextGuestName,
              error:
                `Há ${ahead.count} hóspede(s) na frente na fila para ${entry.roomCategoryName} nesse período` +
                (ahead.nextGuestName ? ` (o próximo é ${ahead.nextGuestName})` : "") +
                `. Avise esse primeiro ou confirme para furar a fila.`,
            };
          }
          jumpedQueue = true;
        }
      }

      // Trava os quartos da categoria pelo resto da transação: dois avisos concorrentes (ou um aviso
      // + uma conversão) não podem colocar o mesmo quarto em "soft hold" / reserva para dois
      // hóspedes da fila ao mesmo tempo.
      const categoryRooms = await tx.room.findMany({
        where: { tenantId: session.tenantId!, categoryId: entry.roomCategoryId, active: true },
        select: { id: true },
      });
      await lockRoomsForReservation(tx, categoryRooms.map((r) => r.id));

      const vacancy = await findWaitlistVacancy(tx, {
        tenantId: session.tenantId!,
        roomCategoryId: entry.roomCategoryId,
        checkIn: entry.checkInDate,
        checkOut: entry.checkOutDate,
        excludeWaitlistId: entry.id,
      });
      if (!vacancy) {
        return { code: 409 as const, error: "Não há quarto livre dessa categoria no período no momento." };
      }

      await tx.waitlistEntry.updateMany({
        where: { id: entry.id, tenantId: session.tenantId! },
        data: {
          status: "NOTIFIED",
          notifiedAt: new Date(),
          notifiedRoomId: vacancy.roomId,
          notifyExpiresAt: null, // aviso manual não expira sozinho — a recepção conduz
          notifyAttempts: { increment: 1 },
        },
      });

      return { code: 200 as const, entry, jumpedQueue };
    });

    if (outcome.code !== 200) {
      return NextResponse.json(
        {
          success: false,
          error: outcome.error,
          ...("needsQueueOverride" in outcome
            ? { needsQueueOverride: true, aheadCount: outcome.aheadCount, nextGuestName: outcome.nextGuestName }
            : {}),
        },
        { status: outcome.code },
      );
    }

    const { entry } = outcome;

    // Canal principal: e-mail. WhatsApp também, quando há telefone. (E-mail + WhatsApp.)
    let emailSent = false;
    if (entry.guestEmail) {
      const html = buildOfferEmailHtml(entry.guestName, entry.roomCategoryName, entry.checkInDate, entry.checkOutDate);
      const res = await sendTenantEmail({
        tenantId: session.tenantId,
        to: entry.guestEmail,
        toName: entry.guestName,
        subject: `Abriu uma vaga — ${entry.roomCategoryName}`,
        html,
      });
      emailSent = res.ok;
    }

    let whatsappSent = false;
    if (entry.guestPhone) {
      const message = buildOfferMessage(entry.guestName, entry.roomCategoryName, entry.checkInDate, entry.checkOutDate);
      whatsappSent = await sendUazapiText(entry.guestPhone, message, session.tenantId);
    }

    // Nenhum canal funcionou → o hóspede NÃO foi avisado. Desfaz o NOTIFIED (libera o soft-hold do
    // quarto e devolve a entrada para a fila) para a recepção não achar que está aguardando
    // resposta de quem nunca recebeu nada. Só reverte se a entrada ainda estiver NOTIFIED (uma
    // conversão concorrente já a teria encerrado).
    if (!emailSent && !whatsappSent) {
      await prisma.waitlistEntry.updateMany({
        where: { id: entry.id, tenantId: session.tenantId, status: "NOTIFIED" },
        data: { status: "WAITING", notifiedAt: null, notifiedRoomId: null },
      });
      await logActivity({
        tenantId: session.tenantId,
        userId: session.userId,
        userName: session.name,
        action: "WAITLIST_NOTIFY_MANUAL",
        description: `${session.name || "Usuário"} tentou avisar ${entry.guestName} sobre vaga na fila (${entry.roomCategoryName}), mas nenhum canal (e-mail/WhatsApp) funcionou — entrada devolvida à fila.`,
        entityType: "WAITLIST_ENTRY",
        entityId: entry.id,
        terminal: getTerminalName(req),
        ipAddress: getClientIp(req),
      });
      return NextResponse.json(
        {
          success: false,
          error:
            "Não foi possível enviar o aviso — o e-mail e/ou o WhatsApp falharam. A entrada continua na fila. Verifique as configurações de e-mail/WhatsApp do hotel ou entre em contato com o hóspede manualmente.",
        },
        { status: 502 },
      );
    }

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_NOTIFY_MANUAL",
      description:
        `${session.name || "Usuário"} avisou ${entry.guestName} sobre vaga na fila de espera (${entry.roomCategoryName}).` +
        (outcome.jumpedQueue ? " [furou a fila — havia entradas mais antigas para a categoria/período]" : ""),
      entityType: "WAITLIST_ENTRY",
      entityId: entry.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    const channels: string[] = [];
    if (emailSent) channels.push("e-mail");
    if (whatsappSent) channels.push("WhatsApp");

    return NextResponse.json({
      success: true,
      emailSent,
      whatsappSent,
      message: `Hóspede avisado por ${channels.join(" e ")}.`,
    });
  } catch (error: any) {
    console.error("[POST /api/waitlist/:id/notify] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao avisar o hóspede." }, { status: 500 });
  }
}

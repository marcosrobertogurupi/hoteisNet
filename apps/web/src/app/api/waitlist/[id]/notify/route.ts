import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/audit";
import { getSessionUser, getClientIp, getTerminalName } from "@/lib/auth";
import { txWithRetry } from "@/lib/dbTx";
import { findWaitlistVacancy } from "@/lib/waitlistMatch";
import { sendUazapiText } from "@/lib/uazapi";

// Mensagem fixa (sem IA) enviada ao hóspede no aviso manual — a redação em linguagem natural pelo
// agente de atendimento só entra no modo automático (Fase 2).
function buildOfferMessage(guestName: string, categoryName: string, checkIn: Date, checkOut: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
  const first = (guestName || "").trim().split(/\s+/)[0] || guestName;
  return (
    `Olá, ${first}! Abriu uma vaga para as datas que você queria (${fmt(checkIn)} a ${fmt(checkOut)}, ${categoryName}). ` +
    `Você ainda tem interesse? Responda por aqui para a nossa recepção confirmar a sua reserva.`
  );
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

    const outcome = await txWithRetry(async (tx) => {
      const entry = await tx.waitlistEntry.findFirst({
        where: { id, tenantId: session.tenantId!, status: { in: ["WAITING", "NOTIFIED"] } },
        select: {
          id: true,
          guestName: true,
          guestPhone: true,
          roomCategoryId: true,
          roomCategoryName: true,
          checkInDate: true,
          checkOutDate: true,
        },
      });
      if (!entry) return { code: 404 as const, error: "Entrada não encontrada ou já encerrada." };
      if (!entry.guestPhone) return { code: 400 as const, error: "A entrada não tem telefone para avisar o hóspede." };

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

      return { code: 200 as const, entry };
    });

    if (outcome.code !== 200) {
      return NextResponse.json({ success: false, error: outcome.error }, { status: outcome.code });
    }

    const { entry } = outcome;
    const message = buildOfferMessage(entry.guestName, entry.roomCategoryName, entry.checkInDate, entry.checkOutDate);
    const sent = await sendUazapiText(entry.guestPhone!, message, session.tenantId);

    await logActivity({
      tenantId: session.tenantId,
      userId: session.userId,
      userName: session.name,
      action: "WAITLIST_NOTIFY_MANUAL",
      description: `${session.name || "Usuário"} avisou ${entry.guestName} sobre vaga na fila de espera (${entry.roomCategoryName}).`,
      entityType: "WAITLIST_ENTRY",
      entityId: entry.id,
      terminal: getTerminalName(req),
      ipAddress: getClientIp(req),
    });

    return NextResponse.json({
      success: true,
      whatsappSent: sent,
      message: sent
        ? "Hóspede avisado pelo WhatsApp."
        : "Entrada marcada como avisada, mas o WhatsApp não pôde ser enviado — entre em contato manualmente.",
    });
  } catch (error: any) {
    console.error("[POST /api/waitlist/:id/notify] Erro:", error);
    return NextResponse.json({ success: false, error: error.message || "Erro ao avisar o hóspede." }, { status: 500 });
  }
}

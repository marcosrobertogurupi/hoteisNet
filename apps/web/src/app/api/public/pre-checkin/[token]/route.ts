import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { supabaseAdmin } from "@/utils/supabaseClient";
import { validatePreCheckinToken } from "@/lib/preCheckinLink";
import { validateCPF } from "@/lib/documentValidation";

// Rota pública (sem sessão — fora do matcher de middleware.ts) usada pela tela self-checkin/[token]
// para o hóspede abrir o link recebido via WhatsApp e preencher a FNRH antes de chegar ao hotel.
// Nunca aceita tenantId/reservationId/guestId vindos do cliente: tudo é resolvido a partir do
// token no servidor, para não vazar dados de outra reserva/tenant.

const SIGNATURE_BUCKET = "fnrh-signatures";

function friendlyTokenError(reason: "NOT_FOUND" | "EXPIRED" | "REVOKED"): string {
  if (reason === "EXPIRED") return "Este link expirou. Peça um novo à recepção do hotel.";
  if (reason === "REVOKED") return "Este link não é mais válido. Peça um novo à recepção do hotel.";
  return "Link inválido. Confira o link recebido ou peça um novo à recepção do hotel.";
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const validation = await validatePreCheckinToken(prisma, token);
  if (!validation.ok) {
    return NextResponse.json({ success: false, error: friendlyTokenError(validation.reason) }, { status: 404 });
  }

  const { reservation } = validation.link;
  const tenant = reservation.room.tenant;

  const existingRecord = await prisma.fNRHRecord.findFirst({
    where: { reservationId: reservation.id },
    include: { guest: true },
    orderBy: { createdAt: "desc" },
  });

  const guest = existingRecord?.guest || (reservation.guestId
    ? await prisma.guest.findUnique({ where: { id: reservation.guestId } })
    : null);

  return NextResponse.json({
    success: true,
    alreadyCompleted: !!existingRecord,
    hotel: { name: tenant.tradeName || tenant.name, logoUrl: tenant.logoUrl },
    reservation: {
      reservationNumber: reservation.reservationNumber,
      checkInDate: reservation.checkInDate,
      checkOutDate: reservation.checkOutDate,
      roomDescription: reservation.roomDescription,
      roomCategory: reservation.roomCategory,
    },
    guest: guest
      ? {
          fullName: guest.fullName,
          cpf: guest.cpf,
          passport: guest.passport,
          birthDate: guest.birthDate,
          gender: guest.gender,
          email: guest.email,
          phone: guest.phone,
          zipCode: guest.zipCode,
          street: guest.street,
          number: guest.number,
          neighborhood: guest.neighborhood,
          city: guest.city,
          state: guest.state,
          country: guest.country,
          rgNumber: guest.rgNumber,
          rgIssuer: guest.rgIssuer,
          rgIssuerState: guest.rgIssuerState,
          nationality: guest.nationality,
          raceColor: guest.raceColor,
          disability: guest.disability,
          occupation: guest.occupation,
        }
      : { fullName: reservation.guestName, cpf: reservation.guestCpf, phone: reservation.guestPhone },
    fnrh: existingRecord
      ? {
          travelReason: existingRecord.travelReason,
          transportMode: existingRecord.transportMode,
          lastOriginCity: existingRecord.lastOriginCity,
          lastOriginState: existingRecord.lastOriginState,
          nextDestinationCity: existingRecord.nextDestinationCity,
          nextDestinationState: existingRecord.nextDestinationState,
        }
      : null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json();

  try {
    const result = await txWithRetry(async (tx) => {
      const validation = await validatePreCheckinToken(tx, token);
      if (!validation.ok) {
        throw new Error(`TOKEN_${validation.reason}`);
      }

      const { link } = validation;
      if (link.status === "COMPLETED") {
        throw new Error("ALREADY_COMPLETED");
      }

      const tenantId = link.reservation.room.tenantId;
      // CPF é obrigatório e validado (dígito verificador) no momento do preenchimento da FNRH —
      // é a chave usada na consulta ao Hub de Desenvolvedor do governo, então um CPF incorreto
      // aqui quebra essa integração mais adiante.
      const cpfDigits = String(body.cpf || "").replace(/\D/g, "");
      if (cpfDigits.length !== 11 || !validateCPF(cpfDigits)) {
        throw new Error("INVALID_CPF");
      }
      const cpf = cpfDigits;

      let guest = await tx.guest.findFirst({ where: { tenantId, cpf } });

      const guestData = {
        tenantId,
        fullName: String(body.fullName || link.reservation.guestName || "").toUpperCase(),
        cpf,
        passport: body.passport || null,
        birthDate: body.birthDate ? new Date(body.birthDate) : null,
        gender: body.gender || null,
        email: body.email || null,
        phone: body.phone || null,
        whatsappPhone: body.phone || null,
        hasWhatsapp: !!body.phone,
        zipCode: body.zipCode || null,
        street: body.street || null,
        number: body.number || null,
        neighborhood: body.neighborhood || null,
        city: body.city || null,
        state: body.state || null,
        country: body.country || "Brasil",
        rgNumber: body.rgNumber || null,
        rgIssuer: body.rgIssuer || null,
        rgIssuerState: body.rgIssuerState || null,
        nationality: body.nationality || "BR",
        raceColor: body.raceColor || "NAOINFORMAR",
        disability: body.disability || "NAOINFORMAR",
        occupation: body.occupation || null,
      };

      guest = guest
        ? await tx.guest.update({ where: { id: guest.id }, data: guestData })
        : await tx.guest.create({ data: guestData });

      let signatureUrl: string | null = null;
      if (body.signatureDataUrl && typeof body.signatureDataUrl === "string") {
        const match = body.signatureDataUrl.match(/^data:image\/png;base64,(.+)$/);
        // Confere a assinatura de bytes real do PNG (89 50 4E 47 0D 0A 1A 0A) além do prefixo
        // textual do data URI — sem isso, qualquer binário rotulado "image/png" seria aceito e
        // armazenado no bucket público de assinaturas.
        const PNG_MAGIC_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        const buffer = match ? Buffer.from(match[1], "base64") : null;
        const isValidPng = !!buffer && buffer.length > PNG_MAGIC_BYTES.length && buffer.subarray(0, 8).equals(PNG_MAGIC_BYTES);
        if (match && isValidPng && buffer) {
          const path = `${tenantId}/${link.reservation.id}-${Date.now()}.png`;
          const { error: uploadError } = await supabaseAdmin.storage
            .from(SIGNATURE_BUCKET)
            .upload(path, buffer, { contentType: "image/png", upsert: true });
          if (!uploadError) {
            signatureUrl = path;
          }
        }
      }

      // Um novo link de pré-check-in pode ser gerado para a mesma reserva (o anterior é revogado),
      // e o mesmo hóspede pode preencher de novo. Sem isto, cada preenchimento criava uma FNRH
      // extra para o mesmo par (reserva, hóspede) — o agente operacional então repetia a mesma
      // linha de "ficha pendente" 4-5x no alerta e no sino. Remove só rascunhos ainda não
      // transmitidos; uma ficha já enviada ao SNRHos é registro legal e nunca é apagada aqui.
      await tx.fNRHRecord.deleteMany({
        where: { reservationId: link.reservation.id, guestId: guest.id, transmittedSNRHos: false },
      });

      const fnrhRecord = await tx.fNRHRecord.create({
        data: {
          guestId: guest.id,
          reservationId: link.reservation.id,
          travelReason: String(body.travelReason || "NEGOCIOS"),
          transportMode: String(body.transportMode || "AVIAO"),
          lastOriginCity: String(body.lastOriginCity || ""),
          lastOriginState: String(body.lastOriginState || ""),
          lastOriginCountry: body.lastOriginCountry || "Brasil",
          nextDestinationCity: String(body.nextDestinationCity || ""),
          nextDestinationState: String(body.nextDestinationState || ""),
          nextDestinationCountry: body.nextDestinationCountry || "Brasil",
          signatureUrl,
        },
      });

      if (!link.reservation.guestId) {
        await tx.reservation.update({ where: { id: link.reservation.id }, data: { guestId: guest.id } });
      }

      await tx.preCheckinLink.update({
        where: { id: link.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });

      return { fnrhRecordId: fnrhRecord.id };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    if (error.message === "ALREADY_COMPLETED") {
      return NextResponse.json({ success: false, error: "Este pré-check-in já foi confirmado." }, { status: 409 });
    }
    if (error.message === "INVALID_CPF") {
      return NextResponse.json({ success: false, error: "Informe um CPF válido para concluir a FNRH." }, { status: 400 });
    }
    if (typeof error.message === "string" && error.message.startsWith("TOKEN_")) {
      const reason = error.message.replace("TOKEN_", "") as "NOT_FOUND" | "EXPIRED" | "REVOKED";
      return NextResponse.json({ success: false, error: friendlyTokenError(reason) }, { status: 404 });
    }
    console.error("[Pre-Checkin POST Error]", error);
    return NextResponse.json(
      { success: false, error: "Não foi possível concluir seu pré-check-in agora. Tente novamente em instantes." },
      { status: 500 }
    );
  }
}

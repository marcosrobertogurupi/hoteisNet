import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { txWithRetry } from "@/lib/dbTx";
import { supabaseAdmin } from "@/utils/supabaseAdmin";
import { validatePreCheckinToken } from "@/lib/preCheckinLink";
import { validateCPF, cpfMatchVariants } from "@/lib/documentValidation";

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

  // Link já usado: devolve só o aviso "já preenchido" — NUNCA os dados pessoais. Um link concluído
  // não expira (fica no histórico do WhatsApp do hóspede, pode ser encaminhado), e antes o GET
  // continuava entregando CPF, RG, endereço e nascimento a quem o abrisse, para sempre. A tela
  // (self-checkin/[token]) não usa nada além do nome do hotel nesse estado.
  if (validation.link.status === "COMPLETED") {
    return NextResponse.json({
      success: true,
      alreadyCompleted: true,
      hotel: { name: tenant.tradeName || tenant.name, logoUrl: tenant.logoUrl },
    });
  }

  const existingRecord = await prisma.fNRHRecord.findFirst({
    where: { reservationId: reservation.id },
    select: { id: true },
    orderBy: { createdAt: "desc" },
  });

  // FNRH já preenchida para esta reserva: a tela mostra só "já preenchido" — mesma regra acima,
  // nenhum dado pessoal sai daqui.
  if (existingRecord) {
    return NextResponse.json({
      success: true,
      alreadyCompleted: true,
      hotel: { name: tenant.tradeName || tenant.name, logoUrl: tenant.logoUrl },
    });
  }

  const guest = (reservation.guestId
    ? await prisma.guest.findUnique({ where: { id: reservation.guestId } })
    : null);

  return NextResponse.json({
    success: true,
    alreadyCompleted: false,
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
    fnrh: null,
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

      // CPF é gravado formatado pelo check-in ("000.000.000-00") e só com dígitos por aqui — busca
      // pelas duas formas, senão o mesmo hóspede virava um cadastro duplicado.
      const guest = await tx.guest.findFirst({ where: { tenantId, cpf: { in: cpfMatchVariants(cpf) } } });

      // Quem tem o link é autoritativo só sobre o PRÓPRIO cadastro. Se o CPF digitado pertence a um
      // hóspede já cadastrado que NÃO é o desta reserva, o link não pode reescrever os dados dele —
      // senão qualquer portador de um link de pré-check-in alterava (nome, telefone, e-mail,
      // endereço) o cadastro de outra pessoa do hotel só sabendo o CPF. Nesse caso o formulário só
      // PREENCHE o que estiver vazio; o que a recepção/o próprio hóspede já cadastrou prevalece.
      const onlyFillBlanks = !!guest && link.reservation.guestId !== guest.id;

      // O hóspede está preenchendo a própria FNRH — o que ele digita é autoritativo. Mas um campo
      // deixado EM BRANCO no formulário nunca deve APAGAR um valor que a recepção já cadastrou:
      // `keep` mantém o valor existente quando o formulário veio vazio (só sobrescreve com o que
      // o hóspede de fato informou), e no cadastro novo cai no default.
      const keep = <T,>(submitted: T | null | undefined, existing: T | null | undefined): T | null => {
        const hasExisting = existing !== undefined && existing !== null && existing !== ("" as unknown as T);
        if (onlyFillBlanks && hasExisting) return existing as T;
        if (submitted !== undefined && submitted !== null && submitted !== ("" as unknown as T)) return submitted;
        return existing ?? null;
      };

      const guestData = {
        tenantId,
        fullName: String(
          (onlyFillBlanks ? guest?.fullName : null) || body.fullName || guest?.fullName || link.reservation.guestName || ""
        ).toUpperCase(),
        cpf: guest?.cpf || cpf,
        passport: keep<string>(body.passport, guest?.passport),
        birthDate: (onlyFillBlanks && guest?.birthDate) ? guest.birthDate : body.birthDate ? new Date(body.birthDate) : (guest?.birthDate ?? null),
        gender: keep<string>(body.gender, guest?.gender),
        email: keep<string>(body.email, guest?.email),
        phone: keep<string>(body.phone, guest?.phone),
        whatsappPhone: keep<string>(body.phone, guest?.whatsappPhone),
        hasWhatsapp: onlyFillBlanks ? (guest?.hasWhatsapp || !!body.phone) : body.phone ? true : (guest?.hasWhatsapp ?? false),
        zipCode: keep<string>(body.zipCode, guest?.zipCode),
        street: keep<string>(body.street, guest?.street),
        number: keep<string>(body.number, guest?.number),
        neighborhood: keep<string>(body.neighborhood, guest?.neighborhood),
        city: keep<string>(body.city, guest?.city),
        state: keep<string>(body.state, guest?.state),
        // Colunas não-nulas (têm default no schema): nunca podem virar null.
        country: (onlyFillBlanks ? guest?.country : null) || body.country || guest?.country || "Brasil",
        rgNumber: keep<string>(body.rgNumber, guest?.rgNumber),
        rgIssuer: keep<string>(body.rgIssuer, guest?.rgIssuer),
        rgIssuerState: keep<string>(body.rgIssuerState, guest?.rgIssuerState),
        nationality: (onlyFillBlanks ? guest?.nationality : null) || body.nationality || guest?.nationality || "BR",
        raceColor: (onlyFillBlanks ? guest?.raceColor : null) || body.raceColor || guest?.raceColor || "NAOINFORMAR",
        disability: (onlyFillBlanks ? guest?.disability : null) || body.disability || guest?.disability || "NAOINFORMAR",
        occupation: keep<string>(body.occupation, guest?.occupation),
      };

      const savedGuest = guest
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
          // Caminho com sufixo aleatório: assinatura de hóspede é dado pessoal e o nome antigo
          // (`{tenantId}/{reservationId}-{timestamp}.png`) era adivinhável a partir de dados que o
          // próprio hóspede conhece. O bucket precisa ser PRIVADO — o sufixo é defesa em
          // profundidade, não substitui a política do bucket.
          const path = `${tenantId}/${link.reservation.id}-${Date.now()}-${randomBytes(8).toString("hex")}.png`;
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
        where: { reservationId: link.reservation.id, guestId: savedGuest.id, transmittedSNRHos: false },
      });

      const fnrhRecord = await tx.fNRHRecord.create({
        data: {
          guestId: savedGuest.id,
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
        await tx.reservation.update({ where: { id: link.reservation.id }, data: { guestId: savedGuest.id } });
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

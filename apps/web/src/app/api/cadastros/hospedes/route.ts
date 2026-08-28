import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { cpfMatchVariants, formatCPF, validateCPF } from "@/lib/documentValidation";

// GET /api/cadastros/hospedes
// Suporta query params: q (busca por nome/cpf/email), page, pageSize, tenantId
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    // Sempre restrito ao tenant da sessão — inclusive quando `q` está preenchido. Antes o filtro de
    // tenant era descartado nesse caso, vazando hóspedes (CPF, telefone, endereço) de TODOS os hotéis.
    const where: any = { tenantId: session.tenantId };

    if (q.trim()) {
      const cleanDigits = q.replace(/\D/g, "");
      const formattedCpf = cleanDigits.length === 11 ? formatCPF(cleanDigits) : q;

      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { cpf: { contains: q, mode: "insensitive" } },
        ...(cleanDigits ? [{ cpf: { contains: cleanDigits, mode: "insensitive" } }] : []),
        ...(formattedCpf !== q ? [{ cpf: { contains: formattedCpf, mode: "insensitive" } }] : []),
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
      ];
    }

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where,
        orderBy: { fullName: "asc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          fullName: true,
          cpf: true,
          email: true,
          phone: true,
          whatsappPhone: true,
          hasWhatsapp: true,
          passport: true,
          city: true,
          state: true,
          country: true,
          street: true,
          number: true,
          neighborhood: true,
          zipCode: true,
          gender: true,
          birthDate: true,
          motherName: true,
          fatherName: true,
          fullAddress: true,
          rgNumber: true,
          companyId: true,
          company: {
            select: { name: true, cnpj: true },
          },
          vehicles: {
            select: { id: true, placa: true, caracteristica: true },
            orderBy: { createdAt: "asc" },
          },
        },
      }),
      prisma.guest.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      guests,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("[GET /api/cadastros/hospedes] Erro:", error);
    return NextResponse.json({ error: "Erro ao buscar hóspedes" }, { status: 500 });
  }
}

// POST /api/cadastros/hospedes
// Cria um novo hóspede no Supabase
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();

    const {
      fullName,
      cpf,
      passport,
      birthDate,
      gender,
      email,
      phone,
      whatsappPhone,
      hasWhatsapp,
      zipCode,
      street,
      number,
      neighborhood,
      city,
      state,
      country,
      companyId,
      motherName,
      fatherName,
      fullAddress,
    } = body;

    if (!fullName || fullName.trim().length < 3) {
      return NextResponse.json({ error: "Nome completo é obrigatório" }, { status: 400 });
    }

    const cpfDigits = String(cpf || "").replace(/\D/g, "");
    if (cpfDigits && (cpfDigits.length !== 11 || !validateCPF(cpfDigits))) {
      return NextResponse.json({ error: "CPF inválido." }, { status: 400 });
    }
    const formattedCpf = cpfDigits.length === 11 ? formatCPF(cpfDigits) : null;

    // Sem @@unique em Guest.cpf (um mesmo CPF pode legitimamente existir em tenants diferentes),
    // então a proteção contra duplicata é feita aqui: se já existe um cadastro com este CPF neste
    // tenant, devolve o existente em vez de criar outro — importante agora que a consulta ao Hub
    // do Desenvolvedor no check-in chama este endpoint assim que encontra o CPF, podendo ser
    // chamada mais de uma vez para o mesmo hóspede. Compara pelos dois formatos de gravação
    // (com e sem máscara) — ver cpfMatchVariants — senão a duplicata passa só por diferença de
    // formatação.
    if (formattedCpf) {
      const existing = await prisma.guest.findFirst({
        where: { tenantId: session.tenantId, cpf: { in: cpfMatchVariants(formattedCpf) } },
      });
      if (existing) {
        return NextResponse.json({ success: true, ...existing, alreadyExisted: true }, { status: 200 });
      }
    }

    // companyId recebido do cliente precisa ser de uma empresa do mesmo tenant — senão o cadastro
    // ficaria vinculado a uma empresa conveniada de outro hotel.
    let safeCompanyId: string | null = null;
    if (companyId) {
      const company = await prisma.company.findFirst({
        where: { id: companyId, tenantId: session.tenantId },
        select: { id: true },
      });
      safeCompanyId = company?.id ?? null;
    }

    const newGuest = await prisma.guest.create({
      data: {
        tenantId: session.tenantId,
        fullName: fullName.trim().toUpperCase(),
        cpf: formattedCpf,
        passport: passport || null,
        birthDate: birthDate ? new Date(birthDate) : null,
        gender: gender || "M",
        email: email || null,
        phone: phone || null,
        whatsappPhone: whatsappPhone || phone || null,
        hasWhatsapp: hasWhatsapp ?? (!!phone),
        zipCode: zipCode || null,
        street: street || null,
        number: number || null,
        neighborhood: neighborhood || null,
        city: city || null,
        state: state || null,
        country: country || "Brasil",
        companyId: safeCompanyId,
        motherName: motherName || null,
        fatherName: fatherName || null,
        fullAddress: fullAddress || null,
      },
    });

    return NextResponse.json({ success: true, ...newGuest }, { status: 201 });
  } catch (error: any) {
    console.error("[POST /api/cadastros/hospedes] Erro:", error);
    if (error?.code === "P2002") {
      return NextResponse.json({ error: "CPF já cadastrado para outro hóspede" }, { status: 409 });
    }
    return NextResponse.json({ error: "Erro ao cadastrar hóspede" }, { status: 500 });
  }
}

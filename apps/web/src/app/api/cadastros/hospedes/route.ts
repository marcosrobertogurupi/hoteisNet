import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

function formatCPF(v: string) {
  const c = v.replace(/\D/g, "");
  if (c.length !== 11) return v;
  return `${c.slice(0,3)}.${c.slice(3,6)}.${c.slice(6,9)}-${c.slice(9,11)}`;
}

// GET /api/cadastros/hospedes
// Suporta query params: q (busca por nome/cpf/email), page, pageSize, tenantId
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const reqTenantId = searchParams.get("tenantId");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "50", 10);
    const skip = (page - 1) * pageSize;

    const where: any = {};
    if (reqTenantId && !q.trim()) {
      where.tenantId = { in: [reqTenantId, DEFAULT_TENANT_ID] };
    }

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
          city: true,
          state: true,
          country: true,
          street: true,
          number: true,
          neighborhood: true,
          zipCode: true,
          gender: true,
          birthDate: true,
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
    const body = await request.json();

    const {
      tenantId,
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

    // Sem @@unique em Guest.cpf (um mesmo CPF pode legitimamente existir em tenants diferentes),
    // então a proteção contra duplicata é feita aqui: se já existe um cadastro com este CPF neste
    // tenant, devolve o existente em vez de criar outro — importante agora que a consulta ao Hub
    // do Desenvolvedor no check-in chama este endpoint assim que encontra o CPF, podendo ser
    // chamada mais de uma vez para o mesmo hóspede.
    const formattedCpf = cpf ? formatCPF(cpf) : null;
    if (formattedCpf) {
      const existing = await prisma.guest.findFirst({
        where: { tenantId: tenantId || DEFAULT_TENANT_ID, cpf: formattedCpf },
      });
      if (existing) {
        return NextResponse.json({ success: true, ...existing, alreadyExisted: true }, { status: 200 });
      }
    }

    const newGuest = await prisma.guest.create({
      data: {
        tenantId: tenantId || DEFAULT_TENANT_ID,
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
        companyId: companyId || null,
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

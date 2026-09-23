import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPlatformSession, requirePlatformAdmin } from "@/lib/auth";
import { logPlatformAction } from "@/lib/platformAudit";
import { municipalitySelect, parseMunicipalityInput } from "@/lib/municipality";

// PATCH /api/admin/municipios/[id] — altera um município da tabela GLOBAL. Afeta todos os
// assinantes: SNRHos (FNRH) e NFC-e localizam o código IBGE pelo NOME + UF do município, então
// renomear muda qual cadastro de hóspede/emitente "casa" com ele. Edição: PLATFORM_ADMIN /
// SUPER_ADMIN (com 2FA), auditado com o antes/depois.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Corpo inválido." }, { status: 400 });
  }

  const before = await prisma.municipality.findUnique({ where: { id }, select: municipalitySelect });
  if (!before) return NextResponse.json({ success: false, error: "Município não encontrado." }, { status: 404 });

  // Valida o registro RESULTANTE (atual + alterações), para a coerência IBGE × UF valer mesmo
  // quando só um dos dois campos muda.
  const fields = ["name", "ibgeCode", "uf", "dddCode"] as const;
  if (!fields.some((f) => body[f] !== undefined)) {
    return NextResponse.json({ success: false, error: "Nada para alterar." }, { status: 400 });
  }
  const merged: Record<string, unknown> = { name: before.name, ibgeCode: before.ibgeCode, uf: before.uf, dddCode: before.dddCode };
  for (const f of fields) if (body[f] !== undefined) merged[f] = body[f];
  const parsed = parseMunicipalityInput(merged, { partial: false });
  if (!parsed.ok) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  try {
    const municipality = await prisma.municipality.update({ where: { id }, data: parsed.data, select: municipalitySelect });
    await logPlatformAction({
      req,
      session: session!,
      action: "MUNICIPALITY_UPDATE",
      description: `${session!.name} alterou o município ${before.name}/${before.uf} → ${municipality.name}/${municipality.uf} (IBGE ${municipality.ibgeCode}).`,
      entityType: "Municipality",
      entityId: id,
      details: { before, after: municipality },
    });
    return NextResponse.json({ success: true, municipality });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return NextResponse.json({ success: false, error: "Já existe um município com esse código IBGE." }, { status: 409 });
    }
    console.error("[PATCH /api/admin/municipios/[id]] Erro:", error);
    return NextResponse.json({ success: false, error: "Erro ao alterar município." }, { status: 500 });
  }
}

// DELETE /api/admin/municipios/[id] — exclui um município da tabela GLOBAL (ex.: duplicado ou
// cadastrado errado). Hóspedes/emitentes cuja cidade apontava para ele deixam de encontrar o código
// IBGE no SNRHos/NFC-e — a tela avisa antes. Edição: PLATFORM_ADMIN / SUPER_ADMIN (com 2FA).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getPlatformSession(req);
  const authError = await requirePlatformAdmin(session);
  if (authError) return NextResponse.json(authError.body, { status: authError.status });

  const { id } = await params;
  const existing = await prisma.municipality.findUnique({ where: { id }, select: municipalitySelect });
  if (!existing) return NextResponse.json({ success: false, error: "Município não encontrado." }, { status: 404 });

  await prisma.municipality.delete({ where: { id } });
  await logPlatformAction({
    req,
    session: session!,
    action: "MUNICIPALITY_DELETE",
    description: `${session!.name} excluiu o município ${existing.name}/${existing.uf} (IBGE ${existing.ibgeCode}).`,
    entityType: "Municipality",
    entityId: id,
    details: { before: existing },
  });
  return NextResponse.json({ success: true });
}

import { NextResponse } from "next/server";
import { getTenantUazapiCredentials, normalizeUazapiPhone } from "@/lib/uazapiInstance";

const DEFAULT_TENANT_ID = "tenant-hoteisnet-demo";

// POST /api/uazapi/profile-picture — busca a foto de perfil do WhatsApp de um contato via
// POST {serverUrl}/chat/details (endpoint oficial da uazapi), retornando a URL da imagem quando
// o hóspede permite que ela seja vista.
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone, tenantId } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: "Telefone é obrigatório." }, { status: 400 });
    }

    const { serverUrl, instanceToken } = await getTenantUazapiCredentials(tenantId || DEFAULT_TENANT_ID);
    const cleanPhone = normalizeUazapiPhone(phone);

    const response = await fetch(`${serverUrl}/chat/details`, {
      method: "POST",
      headers: { "Content-Type": "application/json", token: instanceToken },
      body: JSON.stringify({ number: cleanPhone, preview: true }),
    });

    const resText = await response.text();
    let resJson: any = null;
    try {
      resJson = JSON.parse(resText);
    } catch {
      resJson = { text: resText };
    }

    if (!response.ok) {
      return NextResponse.json({ success: false, hasWhatsapp: false, image: null });
    }

    return NextResponse.json({
      success: true,
      hasWhatsapp: true,
      image: resJson.imagePreview || resJson.image || null,
      name: resJson.wa_name || resJson.name || null,
    });
  } catch (error: any) {
    console.error("[POST /api/uazapi/profile-picture] Erro:", error);
    return NextResponse.json({ success: false, hasWhatsapp: false, image: null });
  }
}

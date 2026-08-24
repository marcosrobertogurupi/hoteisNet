import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getTenantUazapiCredentials, normalizeUazapiPhone, fetchUazapi, UazapiUnreachableError } from "@/lib/uazapiInstance";

// POST /api/uazapi/profile-picture — busca a foto de perfil do WhatsApp de um contato via
// POST {serverUrl}/chat/details (endpoint oficial da uazapi), retornando a URL da imagem quando
// o hóspede permite que ela seja vista. Credenciais sempre do tenant da sessão.
export async function POST(request: NextRequest) {
  try {
    const session = await getSessionUser(request);
    if (!session?.tenantId) {
      return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
    }

    const body = await request.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json({ success: false, error: "Telefone é obrigatório." }, { status: 400 });
    }

    const { serverUrl, instanceToken } = await getTenantUazapiCredentials(session.tenantId);
    const cleanPhone = normalizeUazapiPhone(phone);

    const response = await fetchUazapi(`${serverUrl}/chat/details`, {
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
      // Status >= 500 (ou 401/403) indica problema da própria instância uazapi (fora do ar, token
      // inválido, etc.), não que o número não tem WhatsApp — checkFailed distingue os dois casos
      // para a tela não exibir "Indisponível" quando na verdade a checagem é que falhou.
      const checkFailed = response.status >= 500 || response.status === 401 || response.status === 403;
      return NextResponse.json({ success: false, hasWhatsapp: false, image: null, checkFailed });
    }

    return NextResponse.json({
      success: true,
      hasWhatsapp: true,
      image: resJson.imagePreview || resJson.image || null,
      name: resJson.wa_name || resJson.name || null,
    });
  } catch (error: any) {
    console.error("[POST /api/uazapi/profile-picture] Erro:", error);
    const isUnreachable = error instanceof UazapiUnreachableError;
    return NextResponse.json({ success: false, hasWhatsapp: false, image: null, checkFailed: isUnreachable });
  }
}

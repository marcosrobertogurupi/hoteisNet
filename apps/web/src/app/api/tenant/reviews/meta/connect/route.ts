import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { createOAuthState } from "@/lib/oauthState";

// GET /api/tenant/reviews/meta/connect — inicia o OAuth do Meta (Facebook + Instagram Business
// vinculada) para o hotel da sessão. Navegação de topo (o botão "Conectar" da tela faz
// window.location = esta rota, não um fetch) — admin only, porque autoriza o app a ler/gerenciar a
// página do hotel no Facebook.
//
// O `state` carrega o tenantId ASSINADO (HMAC, lib/oauthState.ts): é o único jeito confiável de saber para qual
// tenant salvar o token quando o Facebook redirecionar de volta em .../meta/callback, já que aquela
// rota é pública (não pode depender do cookie de sessão sobreviver à navegação cross-site — ver
// comentário em middleware.ts). Mesmo padrão do projeto de referência que originou este módulo.
export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  const adminError = requireAdmin(session);
  if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
  const tenantId = session!.tenantId;
  if (!tenantId) {
    return NextResponse.json({ success: false, error: "Usuário sem tenant associado." }, { status: 400 });
  }

  const appId = process.env.META_APP_ID;
  if (!appId) {
    return NextResponse.json(
      { success: false, error: "META_APP_ID não configurado no servidor. Contate o suporte." },
      { status: 500 }
    );
  }

  // Assinado e com validade curta — o callback é público e recusa qualquer `state` que não tenha
  // sido emitido aqui (antes era JSON em base64 puro, forjável com o tenantId de qualquer hotel).
  const state = createOAuthState(tenantId);

  // Escopos mínimos para ler avaliações/comentários da página e da conta Instagram vinculada —
  // mesmo conjunto já aprovado em App Review para o App reaproveitado do projeto de referência.
  const scopes = [
    "public_profile",
    "pages_show_list",
    "pages_read_engagement",
    "instagram_basic",
    "instagram_manage_comments",
    "business_management",
  ].join(",");

  const redirectUri = `${req.nextUrl.origin}/api/tenant/reviews/meta/callback`;

  const authUrl = new URL("https://www.facebook.com/v20.0/dialog/oauth");
  authUrl.searchParams.set("client_id", appId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scopes);
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("response_type", "code");

  return NextResponse.redirect(authUrl.toString());
}

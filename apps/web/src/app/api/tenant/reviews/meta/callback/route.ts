import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encryptSecret } from "@/lib/secretBox";
import { verifyOAuthState } from "@/lib/oauthState";

// GET /api/tenant/reviews/meta/callback — o Facebook redireciona o navegador do admin para cá após
// o consentimento OAuth. Rota pública (ver PUBLIC_API_PREFIXES em middleware.ts) — nunca confia em
// sessão nem em tenantId vindo de outro lugar que não seja o `state` que a própria plataforma gerou
// em .../meta/connect (a mesma regra de "tenantId nunca vem do cliente" do CLAUDE.md vale aqui: o
// `state` é assinado com HMAC e expira — ver lib/oauthState.ts —, então só o servidor consegue
// emitir um válido).
//
// Uma única conexão OAuth cobre Facebook E Instagram: a Graph API não tem um jeito de pedir só um
// dos dois — a página do Facebook conectada é quem "tem" (ou não) uma conta Instagram Business
// vinculada. Por isso este callback grava os dois ReviewChannelConnector (FACEBOOK sempre;
// INSTAGRAM só se a página tiver uma conta vinculada) com o mesmo Page Access Token.
const GRAPH_VERSION = "v20.0";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const oauthError = req.nextUrl.searchParams.get("error");

  const redirectTo = (status: "sucesso" | "erro", message: string) => {
    const url = new URL("/principal/reviews", req.nextUrl.origin);
    url.searchParams.set(status === "sucesso" ? "meta_sucesso" : "meta_erro", message);
    return NextResponse.redirect(url);
  };

  if (oauthError || !code || !state) {
    return redirectTo("erro", "conexao_recusada");
  }

  // Só aceita `state` assinado por este servidor e dentro da validade (lib/oauthState.ts) — um
  // `state` montado à mão com o tenantId de outro hotel é recusado.
  const verified = verifyOAuthState(state);
  if (!verified) {
    return redirectTo("erro", "state_invalido");
  }
  const tenantId = verified.tenantId;

  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) {
    return redirectTo("erro", "app_nao_configurado");
  }
  const redirectUri = `${req.nextUrl.origin}/api/tenant/reviews/meta/callback`;

  try {
    const shortToken = await exchangeCodeForToken(code, appId, appSecret, redirectUri);
    const longToken = await exchangeForLongLivedToken(shortToken, appId, appSecret);
    const pages = await fetchUserPages(longToken);
    if (pages.length === 0) return redirectTo("erro", "nenhuma_pagina_encontrada");

    // Por enquanto pega a primeira página retornada — um hotel normalmente só tem uma página do
    // Facebook. Se o assinante gerenciar mais de uma, reconectar depois com a página certa como
    // principal é o caminho até o módulo ganhar seleção de página (fora do escopo desta fase).
    const mainPage = pages[0];
    const igAccount = await fetchInstagramAccount(mainPage.id, mainPage.access_token);

    const encryptedToken = encryptSecret(mainPage.access_token);
    const expiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // long-lived token dura ~60 dias

    await prisma.reviewChannelConnector.upsert({
      where: { tenantId_channel: { tenantId, channel: "FACEBOOK" } },
      create: {
        tenantId,
        channel: "FACEBOOK",
        status: "ACTIVE",
        externalId: mainPage.id,
        config: { pageName: mainPage.name },
        oauthAccessTokenEnc: encryptedToken,
        oauthTokenExpiresAt: expiresAt,
        nextSyncAt: new Date(),
      },
      update: {
        status: "ACTIVE",
        externalId: mainPage.id,
        config: { pageName: mainPage.name },
        oauthAccessTokenEnc: encryptedToken,
        oauthTokenExpiresAt: expiresAt,
        errorMessage: null,
        errorCount: 0,
        firstErrorAt: null,
        nextSyncAt: new Date(),
      },
    });

    if (igAccount) {
      await prisma.reviewChannelConnector.upsert({
        where: { tenantId_channel: { tenantId, channel: "INSTAGRAM" } },
        create: {
          tenantId,
          channel: "INSTAGRAM",
          status: "ACTIVE",
          externalId: igAccount.id,
          config: { username: igAccount.username, fbPageId: mainPage.id },
          oauthAccessTokenEnc: encryptedToken,
          oauthTokenExpiresAt: expiresAt,
          nextSyncAt: new Date(),
        },
        update: {
          status: "ACTIVE",
          externalId: igAccount.id,
          config: { username: igAccount.username, fbPageId: mainPage.id },
          oauthAccessTokenEnc: encryptedToken,
          oauthTokenExpiresAt: expiresAt,
          errorMessage: null,
          errorCount: 0,
          firstErrorAt: null,
          nextSyncAt: new Date(),
        },
      });
    }

    return redirectTo("sucesso", igAccount ? "facebook_e_instagram_conectados" : "facebook_conectado");
  } catch (error: any) {
    console.error("[GET /api/tenant/reviews/meta/callback] Erro:", error);
    return redirectTo("erro", "falha_na_conexao");
  }
}

async function exchangeCodeForToken(code: string, appId: string, appSecret: string, redirectUri: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);
  const res = await fetch(url.toString());
  const data: any = await res.json();
  if (!data.access_token) throw new Error(data.error?.message || "Falha ao trocar code por token.");
  return data.access_token;
}

async function exchangeForLongLivedToken(shortToken: string, appId: string, appSecret: string): Promise<string> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const res = await fetch(url.toString());
  const data: any = await res.json();
  if (!data.access_token) throw new Error("Falha ao obter token de longa duração.");
  return data.access_token;
}

async function fetchUserPages(userToken: string): Promise<Array<{ id: string; name: string; access_token: string }>> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/accounts?access_token=${encodeURIComponent(userToken)}&fields=id,name,access_token`;
  const res = await fetch(url);
  const data: any = await res.json();
  return data.data || [];
}

async function fetchInstagramAccount(pageId: string, pageToken: string): Promise<{ id: string; username?: string } | null> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}?fields=instagram_business_account{id,username}&access_token=${encodeURIComponent(pageToken)}`;
  const res = await fetch(url);
  const data: any = await res.json();
  return data.instagram_business_account || null;
}

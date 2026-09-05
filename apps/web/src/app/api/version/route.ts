import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import releaseConfig from "@/release.json";

// GET /api/version — ROTA PÚBLICA (sem sessão).
//
// Só devolve o identificador da versão publicada e se essa versão deve ser adotada de forma
// obrigatória. Não expõe nada sensível e é consultada tanto por abas ainda logadas quanto pela
// tela de login. O componente AppVersionGate (apps/web) compara o `buildId` daqui com o
// NEXT_PUBLIC_BUILD_ID "assado" no bundle da aba: se diferirem, a aba está rodando uma versão
// antiga e precisa recarregar.
//
// `critical` combina duas fontes (ver CLAUDE.md / PRD.md):
//  - release.json.critical  → decidido no commit do deploy;
//  - AppReleaseControl.forceCriticalBuildId === buildId  → override acionado pelo admin master
//    no painel, sem precisar de novo deploy.
// A leitura do AppReleaseControl fica sob um cache de processo de 20s para não gerar uma consulta
// por terminal a cada tick de polling (regra de egress do Supabase).

export const dynamic = "force-dynamic";

const RELEASE_CONTROL_TTL_MS = 20_000;

let releaseControlCache: {
  at: number;
  value: { forceCriticalBuildId: string | null; criticalMessage: string | null };
} | null = null;

async function getReleaseControl() {
  if (releaseControlCache && Date.now() - releaseControlCache.at < RELEASE_CONTROL_TTL_MS) {
    return releaseControlCache.value;
  }
  let value = { forceCriticalBuildId: null as string | null, criticalMessage: null as string | null };
  try {
    const row = await prisma.appReleaseControl.findUnique({
      where: { id: "singleton" },
      select: { forceCriticalBuildId: true, criticalMessage: true },
    });
    if (row) value = { forceCriticalBuildId: row.forceCriticalBuildId, criticalMessage: row.criticalMessage };
  } catch (err) {
    // Se a tabela ainda não existe (migração não rodou) ou o banco está fora, seguimos só com o
    // que o release.json disser — nunca deixamos essa rota derrubar o carregamento do app.
    console.error("[GET /api/version] Falha ao ler AppReleaseControl:", err);
  }
  releaseControlCache = { at: Date.now(), value };
  return value;
}

// Mesmo cálculo do next.config.mjs, porém em tempo de execução: reflete o deploy que está
// efetivamente servindo esta função.
function currentBuildId(): string {
  return (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || process.env.NEXT_PUBLIC_BUILD_ID || "dev";
}

export async function GET() {
  const buildId = currentBuildId();
  const control = await getReleaseControl();

  const releaseCritical = releaseConfig.critical === true;
  const overrideCritical = !!control.forceCriticalBuildId && control.forceCriticalBuildId === buildId;
  const critical = releaseCritical || overrideCritical;

  const message =
    (overrideCritical && control.criticalMessage?.trim()) ||
    (releaseCritical && releaseConfig.criticalMessage?.trim()) ||
    null;

  return NextResponse.json(
    { buildId, critical, message },
    { headers: { "Cache-Control": "no-store" } }
  );
}

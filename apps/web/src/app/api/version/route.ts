import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import releaseConfig from "@/release.json";

// GET /api/version — ROTA PÚBLICA (sem sessão).
//
// Só devolve o identificador da versão publicada e se essa versão deve ser adotada de forma
// obrigatória. Não expõe nada sensível e é consultada tanto por abas ainda logadas quanto pela
// tela de login. `buildId` vem de VERCEL_GIT_COMMIT_SHA lido em TEMPO DE EXECUÇÃO — reflete o
// deploy que efetivamente está servindo esta função. O cliente (lib/useAppVersion) não tem um
// build id "assado" no bundle: ele guarda o `buildId` da PRIMEIRA resposta que recebeu ao
// carregar a página e compara os polls seguintes com esse valor. Assim a detecção não depende de
// inlining de env nem sofre com o cache de build da Vercel (que pode reaproveitar o bundle antigo
// num deploy novo, fazendo uma constante de build divergir para sempre do runtime).
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

// Estável durante a vida do processo em dev local (sem VERCEL_GIT_COMMIT_SHA); em produção o
// valor abaixo nem é usado — currentBuildId() lê a env do deploy a cada chamada.
const DEV_BUILD_ID = `dev-${Date.now()}`;

function currentBuildId(): string {
  return (process.env.VERCEL_GIT_COMMIT_SHA || "").slice(0, 12) || DEV_BUILD_ID;
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

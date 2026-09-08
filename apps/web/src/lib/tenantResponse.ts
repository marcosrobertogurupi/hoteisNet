import { NextResponse } from "next/server";
import { recordEgress } from "@/lib/egressMeter";

// Resposta JSON que registra o tamanho do payload no medidor de egress por assinante
// (lib/egressMeter.ts → tenant_egress_daily, exibido no painel admin). Usar nas rotas de
// polling do app do assinante (mapas), que são a fonte dominante de egress do Supabase
// (ver CLAUDE.md > Performance). Rotas comuns podem seguir com NextResponse.json normal.
export function jsonForTenant(
  tenantId: string | null | undefined,
  body: unknown,
  init?: ResponseInit
): NextResponse {
  if (tenantId) {
    try {
      const json = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
      recordEgress(tenantId, json ? Buffer.byteLength(json) : 0);
    } catch {
      /* medição nunca pode derrubar a resposta */
    }
  }
  return NextResponse.json(body as Record<string, unknown>, init);
}

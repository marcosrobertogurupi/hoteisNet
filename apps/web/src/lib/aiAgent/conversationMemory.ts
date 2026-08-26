// Memória de longo prazo do agente de atendimento por WhatsApp (ver modelo ConversationMemory).
//
// Problema que resolve: o agente só recebe as últimas N mensagens cruas da conversa. Numa
// negociação de reserva que se arrasta por dias, as primeiras mensagens (onde o hóspede disse o
// que quer, o que foi combinado, o que deu errado) saem da janela e o agente passa a repetir
// pergunta e a esquecer combinados.
//
// Solução (resumo rolante + estado estruturado): sempre vão no prompt as últimas RAW_WINDOW
// mensagens cruas + um bloco de memória com (a) um resumo curto em texto e (b) um JSON com o
// estado da negociação. Quando o número de mensagens ainda não resumidas passa de
// RAW_WINDOW + REFOLD_TRIGGER, um "refold" dobra as mais antigas no resumo/estado e avança o
// cursor `summarizedThrough`. O refold é UMA chamada barata ao mesmo modelo do agente, a cada
// ~REFOLD_TRIGGER turnos — nunca a cada resposta — e é contabilizada no AIUsageLog do tenant.
import { generateObject } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { AI_AGENT_MODEL } from "@/lib/aiAgent/agent";
import { logAiUsage } from "@/lib/aiAgent/usage";

// Mensagens cruas que sempre acompanham o resumo no prompt do agente.
export const RAW_WINDOW = 16;
// Folga antes de disparar um refold: só quando há mais que RAW_WINDOW + REFOLD_TRIGGER mensagens
// não resumidas é que vale a pena gastar uma chamada de IA comprimindo as mais antigas.
const REFOLD_TRIGGER = 12;
// Teto de mensagens dobradas de uma vez. Protege o primeiro refold de uma conversa que já era
// longa antes desta feature existir — mensagens mais antigas que este lote são simplesmente
// descartadas da memória (são history antigo demais para a negociação atual).
const MAX_FOLD_BATCH = 60;

// Estado estruturado da negociação. Tudo nullable: o modelo preenche o que souber e deixa null
// no resto, mantendo o que já estava preenchido a menos que uma mensagem nova mude.
const negotiationStateSchema = z.object({
  nomeHospede: z.string().nullable().describe("Nome do hóspede, se mencionado"),
  cpfHospede: z.string().nullable().describe("CPF do hóspede, se informado"),
  datas: z.string().nullable().describe("Período pretendido, ex: '28-30/08/2026'"),
  adultos: z.number().nullable(),
  criancas: z.number().nullable(),
  categoriaInteresse: z.string().nullable().describe("Categoria de quarto de interesse do hóspede"),
  quartoPedido: z.string().nullable().describe("Número de um quarto específico pedido pelo hóspede, ex: '207'"),
  valorNegociado: z.number().nullable().describe("Valor de diária ou total já oferecido/acordado quando houve pechincha"),
  condicoesAcordadas: z.string().nullable().describe("Condições combinadas, ex: 'desconto para 4+ noites', 'check-in às 10h'"),
  exigencias: z.array(z.string()).describe("Pedidos/exigências do hóspede, ex: 'precisa de berço', 'andar baixo', 'cama de casal'"),
  pendencias: z.string().nullable().describe("O que falta para fechar, ex: 'aguardando o hóspede confirmar o CPF'"),
  reservaCriada: z.string().nullable().describe("Número da reserva já criada nesta conversa, ex: 'RES-1234'"),
});

export type NegotiationState = z.infer<typeof negotiationStateSchema>;

export type ConversationMemoryRow = {
  summary: string;
  state: unknown;
  summarizedThrough: Date | null;
};

type FoldMessage = { direction: string; content: string | null; createdAt: Date };

function renderMessagesForSummary(messages: FoldMessage[]): string {
  return messages
    .map((m) => `${m.direction === "IN" ? "Hóspede" : "Atendente"}: ${m.content?.trim() || "[anexo]"}`)
    .join("\n");
}

// Bloco de memória injetado no prompt do agente. Retorna null se não há nada útil ainda.
export function renderMemoryForPrompt(memory: ConversationMemoryRow | null): string | null {
  if (!memory) return null;
  const summary = memory.summary?.trim();
  const state = memory.state && typeof memory.state === "object" ? (memory.state as Record<string, unknown>) : null;
  const stateHasContent =
    !!state &&
    Object.values(state).some((v) => v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));
  if (!summary && !stateHasContent) return null;

  const parts = ["Contexto acumulado desta conversa (mensagens mais antigas, que já não aparecem no histórico abaixo):"];
  if (summary) parts.push(summary);
  if (stateHasContent) parts.push(`Estado da negociação até agora (JSON; campos null = ainda não definido):\n${JSON.stringify(state)}`);
  parts.push(
    "Use esse contexto para não repetir perguntas já respondidas e para respeitar o que já foi combinado. Se algo aqui conflitar com o que o hóspede disser agora, o que ele disser agora prevalece."
  );
  return parts.join("\n\n");
}

// Roda o modelo de resumo sobre `toFold` (as mensagens antigas), consolidando com o resumo/estado
// anteriores, e persiste o resultado. Avança `summarizedThrough` para o createdAt da última
// mensagem dobrada. Lança em caso de falha — o chamador decide o fallback.
async function foldOldMessages(
  tenantId: string,
  phone: string,
  existing: ConversationMemoryRow | null,
  toFold: FoldMessage[]
): Promise<ConversationMemoryRow> {
  const priorState = existing?.state && typeof existing.state === "object" ? JSON.stringify(existing.state) : null;

  const promptParts = [
    existing?.summary?.trim()
      ? `Resumo anterior desta conversa:\n${existing.summary.trim()}`
      : "Esta é a primeira compressão desta conversa.",
    priorState ? `Estado da negociação até agora (JSON):\n${priorState}` : "",
    "Mensagens a incorporar (ordem cronológica):",
    renderMessagesForSummary(toFold),
    "Produza o novo resumo consolidado e o novo estado. No resumo, preserve o que importa para fechar a reserva (quem é o hóspede, o que quer, o que já foi combinado, o que deu errado, o clima da conversa) e nunca invente. No estado, use null para o que ainda não se sabe e mantenha o que já estava preenchido, a menos que uma mensagem nova mude.",
  ].filter(Boolean);

  const { object, usage } = await generateObject({
    model: AI_AGENT_MODEL,
    schema: z.object({
      resumo: z.string().describe("Resumo em português do Brasil, no máximo 6 linhas, do resumo anterior + das mensagens a incorporar."),
      estado: negotiationStateSchema,
    }),
    prompt: promptParts.join("\n\n"),
  });

  await logAiUsage({
    tenantId,
    feature: "whatsapp_guest_support_summary",
    tokensInput: usage.inputTokens ?? 0,
    tokensOutput: usage.outputTokens ?? 0,
  });

  const cursor = toFold[toFold.length - 1].createdAt;
  const saved = await prisma.conversationMemory.upsert({
    where: { tenantId_phone: { tenantId, phone } },
    create: { tenantId, phone, summary: object.resumo, state: object.estado, summarizedThrough: cursor },
    update: { summary: object.resumo, state: object.estado, summarizedThrough: cursor },
  });
  return { summary: saved.summary, state: saved.state, summarizedThrough: saved.summarizedThrough };
}

export type PreparedConversationContext = {
  memoryPrompt: string | null;
  // ids das mensagens (na ordem cronológica) que devem ir cruas no prompt do agente.
  rawWindowMessageIds: string[];
};

// Chamado pelo webhook antes de montar o agente. Carrega a memória, dispara um refold se for hora
// e devolve (a) o bloco de memória para o prompt e (b) quais mensagens vão cruas na janela.
// Nunca lança: se o refold falhar, cai para "memória antiga + janela cheia" e segue o turno.
export async function prepareConversationContext(
  tenantId: string,
  phone: string
): Promise<PreparedConversationContext> {
  const memoryRow = await prisma.conversationMemory.findUnique({
    where: { tenantId_phone: { tenantId, phone } },
  });
  const existing: ConversationMemoryRow | null = memoryRow
    ? { summary: memoryRow.summary, state: memoryRow.state, summarizedThrough: memoryRow.summarizedThrough }
    : null;

  const unsummarized = await prisma.whatsappMessage.findMany({
    where: {
      tenantId,
      phone,
      OR: [{ type: "text" }, { direction: "IN", type: "media" }],
      ...(memoryRow?.summarizedThrough ? { createdAt: { gt: memoryRow.summarizedThrough } } : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, direction: true, content: true, createdAt: true },
  });

  let memoryPrompt = renderMemoryForPrompt(existing);
  let rawWindow = unsummarized;

  if (unsummarized.length > RAW_WINDOW + REFOLD_TRIGGER) {
    const foldEndIdx = unsummarized.length - RAW_WINDOW;
    const toFold = unsummarized.slice(Math.max(0, foldEndIdx - MAX_FOLD_BATCH), foldEndIdx);
    try {
      const refreshed = await foldOldMessages(tenantId, phone, existing, toFold);
      memoryPrompt = renderMemoryForPrompt(refreshed);
      rawWindow = unsummarized.slice(foldEndIdx);
    } catch (err) {
      console.error("[conversationMemory] refold falhou — seguindo com a janela completa:", err);
    }
  }

  return { memoryPrompt, rawWindowMessageIds: rawWindow.map((m) => m.id) };
}

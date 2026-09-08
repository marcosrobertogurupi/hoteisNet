import { generateObject } from "ai";
import { z } from "zod";
import { google } from "@ai-sdk/google";
import { prisma } from "@/lib/prisma";
import { hasAiQuotaAvailable, logAiUsage } from "@/lib/aiAgent/usage";

// Agente de IA de SUPORTE AO ASSINANTE (a equipe do hotel pedindo ajuda ao Hoteis.Net). Gemini
// via @ai-sdk/google (mesmo provider/modelo do agente de atendimento ao hóspede — não usar
// Claude/Anthropic, memória ai-agent-uses-gemini-not-claude). RAG leve: injeta os artigos ACTIVE
// da base de conhecimento global do produto (PlatformSupportDoc) — o acervo é pequeno o bastante
// para caber no prompt, sem embeddings/pgvector.
//
// Não bloqueia nem age em partes vitais: só redige uma resposta e um grau de confiança. Se não
// tiver certeza, sinaliza needsHuman e o chamado fica na fila para a equipe.

const MODEL = google("gemini-2.5-flash");
const CONFIDENCE_THRESHOLD = 0.7;
const MAX_MESSAGES = 12;

const answerSchema = z.object({
  answer: z
    .string()
    .describe("Resposta em português do Brasil para o time do hotel, cordial e objetiva. Se não souber, explique o que precisa e diga que um atendente humano vai continuar."),
  confidence: z.number().min(0).max(1).describe("0 a 1 — o quão confiante você está de que a resposta resolve o chamado com base nos artigos fornecidos."),
  needsHuman: z.boolean().describe("true se envolve dados que você não tem (financeiro específico, bug, decisão comercial) ou se a confiança é baixa."),
  suggestedCategory: z.string().optional(),
});

export interface SupportAgentResult {
  answer: string;
  confidence: number;
  needsHuman: boolean;
  handled: boolean; // true = confiança suficiente e não precisa de humano
}

export async function answerSupportTicket(ticketId: string): Promise<SupportAgentResult | null> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) return null;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
      subject: true,
      category: true,
      status: true,
      tenant: {
        select: {
          name: true,
          tradeName: true,
          status: true,
          accessValidUntil: true,
          subscriptions: {
            where: { active: true },
            orderBy: { startDate: "desc" },
            take: 1,
            select: { cycle: true, nextBilling: true, plan: { select: { name: true } } },
          },
        },
      },
      messages: { orderBy: { createdAt: "asc" }, select: { senderType: true, senderName: true, content: true } },
    },
  });
  if (!ticket) return null;
  if (!(await hasAiQuotaAvailable(ticket.tenantId))) return null; // respeita bloqueio/cota do admin

  const docs = await prisma.platformSupportDoc.findMany({
    where: { active: true },
    orderBy: { updatedAt: "desc" },
    select: { title: true, category: true, content: true },
    take: 40,
  });

  const sub = ticket.tenant.subscriptions[0];
  const conv = ticket.messages
    .slice(-MAX_MESSAGES)
    .map((m) => `${m.senderType === "TENANT" ? "HOTEL" : m.senderType === "PLATFORM" ? "SUPORTE" : "IA"} (${m.senderName}): ${m.content}`)
    .join("\n");

  const prompt = [
    `Você é o assistente de suporte do Hoteis.Net (o SaaS de gestão hoteleira). Está atendendo a equipe do hotel "${ticket.tenant.tradeName || ticket.tenant.name}".`,
    `Responda SOMENTE com base nos ARTIGOS abaixo e nos DADOS DA CONTA. Se a resposta não estiver clara neles, marque needsHuman=true e confidence baixa — nunca invente procedimento, valor ou prazo.`,
    ``,
    `DADOS DA CONTA:`,
    `- Plano: ${sub?.plan?.name ?? "—"} (${sub?.cycle ?? "—"})`,
    `- Situação: ${ticket.tenant.status}`,
    `- Acesso válido até: ${ticket.tenant.accessValidUntil ? ticket.tenant.accessValidUntil.toISOString().slice(0, 10) : "—"}`,
    `- Próxima cobrança: ${sub?.nextBilling ? sub.nextBilling.toISOString().slice(0, 10) : "—"}`,
    ``,
    `ARTIGOS DA BASE DE CONHECIMENTO (${docs.length}):`,
    docs.length ? docs.map((d) => `### ${d.title} [${d.category}]\n${d.content}`).join("\n\n") : "(nenhum artigo cadastrado ainda)",
    ``,
    `CHAMADO — assunto: ${ticket.subject} | categoria: ${ticket.category}`,
    `CONVERSA ATÉ AGORA:`,
    conv,
    ``,
    `Escreva a resposta para a equipe do hotel. Não use markdown pesado. Não diga que é uma IA a menos que precise justificar que um humano vai assumir.`,
  ].join("\n");

  try {
    const { object, usage } = await generateObject({
      model: MODEL,
      schema: answerSchema,
      prompt,
      abortSignal: AbortSignal.timeout(20000),
    });
    await logAiUsage({
      tenantId: ticket.tenantId,
      feature: "platform_support",
      tokensInput: usage.inputTokens ?? 0,
      tokensOutput: usage.outputTokens ?? 0,
    });

    const handled = !object.needsHuman && object.confidence >= CONFIDENCE_THRESHOLD;
    return { answer: object.answer, confidence: object.confidence, needsHuman: object.needsHuman, handled };
  } catch (err) {
    console.error("[platformSupportAgent] falha:", (err as Error)?.message || err);
    return null;
  }
}

// Aplica o resultado do agente ao chamado: se resolveu, posta a resposta como mensagem AI e
// marca AI_ANSWERED; senão só registra a confiança e deixa OPEN para a equipe.
export async function runSupportAgentOnTicket(ticketId: string): Promise<void> {
  const result = await answerSupportTicket(ticketId);
  if (!result) return;

  if (result.handled) {
    await prisma.$transaction([
      prisma.ticketMessage.create({
        data: {
          ticketId,
          senderType: "AI",
          senderName: "Assistente Hoteis.Net",
          content: result.answer,
        },
      }),
      prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: "AI_ANSWERED", aiResolved: true, confidence: result.confidence, updatedAt: new Date() },
      }),
    ]);
  } else {
    await prisma.supportTicket.update({
      where: { id: ticketId },
      data: { confidence: result.confidence, aiResolved: false },
    });
  }
}

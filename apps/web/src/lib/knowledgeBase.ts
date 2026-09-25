// Helpers da Base de Conhecimento do Hotel (tela /principal/cadastros/base-conhecimento).
//
// Dois níveis, ambos por tenant:
//  1. HotelKnowledgeTopic — 12 "documentos" de texto livre, um por área canônica de dúvida
//     (ver lib/knowledgeTopics.ts), mantidos pelo hotel.
//  2. SupportKnowledgeBase — entradas pergunta+resposta pontuais, opcionalmente ligadas a um tópico.
//
// O agente de atendimento consulta os dois via a tool search_knowledge_base — só trechos
// relevantes, nunca tudo, para não inflar o prompt/custo.
import { prisma } from "@/lib/prisma";
import type { KnowledgeChangeSource } from "@prisma/client";
import { KNOWLEDGE_TOPIC_SEEDS } from "@/lib/knowledgeTopics";
import { KNOWLEDGE_TOPIC_LABEL } from "@/lib/knowledgeTopicLabels";
import { runJevDecision, recordJevObservedOutcome, getJevSetting } from "@/lib/jev/decisions";
import { JEV_FEATURES } from "@/lib/jev/features";

// Cria os 12 tópicos que ainda não existem para o tenant, com conteúdo VAZIO. O texto-guia
// ("o que preencher aqui") vive só na tela (placeholder do campo, ver KNOWLEDGE_TOPIC_GUIDE_BY_KEY)
// e nunca é gravado — assim `content` só tem informação real do hotel, e um tópico com content
// vazio é inequivocamente "não preenchido" (o agente o ignora). Idempotente via skipDuplicates.
export async function ensureKnowledgeTopics(tenantId: string): Promise<void> {
  await prisma.hotelKnowledgeTopic.createMany({
    data: KNOWLEDGE_TOPIC_SEEDS.map((t) => ({
      tenantId,
      topicKey: t.key,
      title: KNOWLEDGE_TOPIC_LABEL[t.key],
      content: "",
    })),
    skipDuplicates: true,
  });
}

// Registra, como sugestão pendente (PENDING_REVIEW), uma dúvida que o agente de atendimento não
// soube responder e por isso escalou para um humano. NUNCA vira conhecimento ativo aqui — só entra
// na fila "Sugestões do agente" da tela Base de Conhecimento para alguém escrever a resposta certa
// e aprovar. Sem chamada de IA: reaproveita a última pergunta do hóspede e o resumo do próprio agente.
// Dedupe por pergunta para não repetir a mesma sugestão a cada nova mensagem enquanto o hóspede espera.
export async function recordAgentKnowledgeGap(params: {
  tenantId: string;
  guestQuestion: string;
  agentSummary: string;
}): Promise<void> {
  const question = params.guestQuestion.trim().slice(0, 500);
  if (question.length < 3) return;

  const existing = await prisma.supportKnowledgeBase.findFirst({
    where: {
      tenantId: params.tenantId,
      status: "PENDING_REVIEW",
      sourceType: "ESCALATION_SUGGESTED",
      question,
    },
    select: { id: true },
  });
  if (existing) return;

  // Dedupe por SENTIDO (Jev, lib/jev): "que horas é o café?" e "qual o horário do café da manhã?"
  // são a mesma sugestão. ACTIVE: não cria outra se o Jev apontar, com certeza, uma pendente
  // equivalente. SHADOW: só registra o que faria. Falha/OFF: cria como antes.
  if (await isDuplicateOfPendingGap(params.tenantId, question)) return;

  await prisma.supportKnowledgeBase.create({
    data: {
      tenantId: params.tenantId,
      agentType: "SUPPORT",
      sourceType: "ESCALATION_SUGGESTED",
      status: "PENDING_REVIEW",
      verified: false,
      title: params.agentSummary.trim().slice(0, 120) || "Dúvida que o agente não soube responder",
      category: "",
      question,
      resolution: "",
    },
  });
}

const GAP_DEDUPE_MAX_PENDING = 50;
const GAP_DEDUPE_MIN_CONFIDENCE = 0.8;

async function isDuplicateOfPendingGap(tenantId: string, question: string): Promise<boolean> {
  // Modo antes da consulta: com o recurso desligado não lê as pendentes à toa (egress).
  if ((await getJevSetting(JEV_FEATURES.KB_GAP_DEDUPE)).mode === "OFF") return false;
  const pending = await prisma.supportKnowledgeBase.findMany({
    where: { tenantId, status: "PENDING_REVIEW", sourceType: "ESCALATION_SUGGESTED" },
    orderBy: { createdAt: "desc" },
    take: GAP_DEDUPE_MAX_PENDING,
    select: { question: true },
  });
  if (pending.length === 0) return false;

  const criteria: Record<string, string> = { nenhuma: "Nenhuma das pendentes é a mesma dúvida (é um assunto novo)" };
  pending.forEach((p, i) => {
    criteria[`pendente_${i + 1}`] = p.question.slice(0, 300);
  });

  const result = await runJevDecision({
    tenantId,
    feature: JEV_FEATURES.KB_GAP_DEDUPE,
    state: { pergunta_nova: question },
    questions: {
      mesma_duvida: {
        type: "choice",
        instructions:
          "A `pergunta_nova` do hóspede é a mesma dúvida (mesmo assunto, mesma informação pedida) de qual pergunta já pendente? Perguntas sobre assuntos diferentes não contam.",
        criteria,
      },
    },
    decide: (a) =>
      a.mesma_duvida?.type === "choice" &&
      a.mesma_duvida.choice !== "nenhuma" &&
      (a.mesma_duvida.confidence ?? 0) >= GAP_DEDUPE_MIN_CONFIDENCE
        ? "duplicada"
        : "nova",
    timeoutMs: 3000,
  });
  if (!result?.answers) return false;

  const a = result.answers.mesma_duvida;
  const duplicate =
    a?.type === "choice" && a.choice !== "nenhuma" && (a.confidence ?? 0) >= GAP_DEDUPE_MIN_CONFIDENCE;
  const skip = result.mode === "ACTIVE" && duplicate;
  await recordJevObservedOutcome(tenantId, result.logId, skip ? "not_created" : "created");
  return skip;
}

// Registra uma alteração de conteúdo no histórico append-only (KnowledgeRevision). Toda edição de
// tópico ou entrada passa por aqui — é o que alimenta o "Desfazer" de 1 clique e a auditoria das
// edições automáticas do Agente Operacional.
export async function recordKnowledgeRevision(params: {
  tenantId: string;
  targetType: "TOPIC" | "ENTRY";
  targetId: string;
  contentBefore: string;
  contentAfter: string;
  changedByName: string;
  changeSource?: KnowledgeChangeSource;
  reason?: string | null;
}): Promise<void> {
  if (params.contentBefore === params.contentAfter) return;
  await prisma.knowledgeRevision.create({
    data: {
      tenantId: params.tenantId,
      targetType: params.targetType,
      targetId: params.targetId,
      contentBefore: params.contentBefore,
      contentAfter: params.contentAfter,
      changedByName: params.changedByName,
      changeSource: params.changeSource ?? "MANUAL",
      reason: params.reason ?? null,
    },
  });
}

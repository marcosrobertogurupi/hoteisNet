// Triagem da mensagem do hóspede no WhatsApp pelo Jev, antes do agente de atendimento (Gemini).
// Decisões possíveis:
//  - "escalate": o hóspede pede explicitamente um humano → escalar na hora, sem gastar o agente;
//  - "farewell": só agradece/se despede e não há nada pendente → despedida cordial curta, sem agente;
//  - "agent": todo o resto → agente como hoje. Pedido de reserva NUNCA sai daqui (função vital).
//
// SHADOW: a decisão é registrada em JevDecisionLog e o agente roda normalmente; o desfecho real
// (escalou / respondeu) é anotado depois para calibrar os limites abaixo.
// ACTIVE (Fase 3): "escalate" e "farewell" são resolvidos aqui mesmo com respostas fixas
// (applyActiveTriageDecision) e o agente nem roda; "agent" segue como sempre.
import { prisma } from "@/lib/prisma";
import { sendUazapiText } from "@/lib/uazapi";
import type { JevAnswer, JevQuestion } from "@/lib/jev/client";
import { runJevDecision, type JevDecisionOutcome } from "@/lib/jev/decisions";
import { JEV_FEATURES } from "@/lib/jev/features";

// Limites iniciais — conservadores; recalibrar com os dados do modo sombra.
const ESCALATE_MIN_NOUL = 0.9;
const FAREWELL_MAX_NEEDS_REPLY = 0.15;
const FAREWELL_MIN_CONFIDENCE = 0.85;

// Intenções que nunca podem ser desviadas do agente, qualquer que seja o resto da triagem.
const PROTECTED_INTENTS = new Set(["disponibilidade_preco", "nova_reserva", "consultar_reserva", "cancelar_reserva"]);

export const WHATSAPP_TRIAGE_QUESTIONS: Record<string, JevQuestion> = {
  precisa_resposta: {
    type: "noul",
    instructions:
      "A última mensagem do hóspede (`ultima_mensagem_hospede`) pede ou espera alguma resposta ou ação do hotel, considerando a última mensagem do atendente (`ultima_mensagem_atendente`)?",
    criteria: {
      true: "Faz pergunta, pedido ou reclamação, traz informação nova, ou responde/confirma algo que o atendente perguntou e que precisa ter continuidade",
      false: "Só agradece, se despede ou reage (ok, obrigado, emoji) e não há nada pendente do atendente aguardando essa resposta",
    },
  },
  pede_humano: {
    type: "noul",
    instructions: "Na última mensagem, o hóspede pede explicitamente para ser atendido por uma pessoa/atendente humano?",
  },
  intencao: {
    type: "choice",
    instructions: "Qual é a intenção principal da última mensagem do hóspede?",
    criteria: {
      disponibilidade_preco: "Quer saber se há quarto livre em datas ou quanto custa",
      nova_reserva: "Quer fechar/confirmar uma reserva nova",
      consultar_reserva: "Quer consultar ou confirmar uma reserva que já existe",
      cancelar_reserva: "Quer cancelar uma reserva",
      informacao_hotel: "Dúvida sobre horários, café, localização, regras, estacionamento, pets etc.",
      reclamacao: "Reclama de algo ou relata problema",
      encerramento: "Agradece, confirma ou se despede sem pedir nada",
      outro: "Nenhuma das anteriores",
    },
  },
};

export type WhatsappTriageDecision = "escalate" | "farewell" | "agent";

export function decideWhatsappTriage(answers: Record<string, JevAnswer>): WhatsappTriageDecision {
  const needsReply = answers.precisa_resposta?.type === "noul" ? answers.precisa_resposta.noul : 1;
  const wantsHuman = answers.pede_humano?.type === "noul" ? answers.pede_humano.noul : 0;
  const intent = answers.intencao?.type === "choice" ? answers.intencao : null;

  if (intent && PROTECTED_INTENTS.has(intent.choice)) return "agent";
  if (wantsHuman >= ESCALATE_MIN_NOUL) return "escalate";
  if (
    needsReply <= FAREWELL_MAX_NEEDS_REPLY &&
    intent?.choice === "encerramento" &&
    (intent.confidence ?? 0) >= FAREWELL_MIN_CONFIDENCE
  ) {
    return "farewell";
  }
  return "agent";
}

// ---------------------------------------------------------------------------------------------
// Modo ACTIVE — respostas fixas (Jev decide, o texto é nosso, curto e cordial, no tom configurado
// pelo hotel). Nunca mencionam IA/sistema. Várias versões para não soar repetitivo.
const FAREWELL_BY_TONE: Record<string, string[]> = {
  FORMAL: ["Perfeito. Permanecemos à disposição sempre que precisar.", "Agradecemos o contato. Estamos à disposição."],
  PROFISSIONAL: ["Combinado! Qualquer coisa, é só chamar por aqui. 😊", "Estamos à disposição sempre que precisar. Até breve!"],
  DESCONTRAIDO: ["Combinado! 😊 Qualquer coisa, é só chamar!", "Fechado! Estamos por aqui se precisar. 👋"],
  DIRETO: ["Combinado. Estamos à disposição.", "Certo! Qualquer coisa, é só chamar."],
};
const ESCALATION_BY_TONE: Record<string, string> = {
  FORMAL: "Certamente. Já solicitei à nossa recepção, e uma pessoa dará continuidade ao seu atendimento por aqui em instantes.",
  PROFISSIONAL: "Claro! Já avisei nossa recepção e uma pessoa vai continuar seu atendimento por aqui em instantes.",
  DESCONTRAIDO: "Claro! 😊 Já chamei o pessoal da recepção, alguém vai falar com você por aqui rapidinho.",
  DIRETO: "Certo. A recepção já foi avisada e vai continuar o atendimento por aqui.",
};
const ALL_FAREWELLS = new Set(Object.values(FAREWELL_BY_TONE).flat());

/**
 * Aplica a decisão da triagem no modo ACTIVE. Devolve o desfecho registrado, ou null quando a
 * decisão é "agent" (o chamador segue com o agente normalmente). Nunca lança — se algo falhar,
 * devolve null e o agente atende como sempre.
 */
export async function applyActiveTriageDecision(params: {
  tenantId: string;
  phone: string;
  decision: WhatsappTriageDecision;
  tonePreset: string | null | undefined;
  lastOutText: string | null;
}): Promise<string | null> {
  if (params.decision === "agent") return null;
  const tone = params.tonePreset && FAREWELL_BY_TONE[params.tonePreset] ? params.tonePreset : "PROFISSIONAL";
  try {
    let text: string | null;
    let outcome: string;
    if (params.decision === "escalate") {
      const alreadyPending = await prisma.humanEscalation.findFirst({
        where: { tenantId: params.tenantId, source: "SUPPORT_AGENT", guestPhone: params.phone, resolved: false },
        select: { id: true },
      });
      if (!alreadyPending) {
        await prisma.humanEscalation.create({
          data: {
            tenantId: params.tenantId,
            source: "SUPPORT_AGENT",
            reason: "O hóspede pediu para falar com um atendente.",
            guestPhone: params.phone,
          },
        });
      }
      text = ESCALATION_BY_TONE[tone];
      // Não repete o mesmo aviso se ele já foi a última coisa que mandamos.
      if (params.lastOutText === text) text = null;
      outcome = "jev_escalated";
    } else {
      // Despedida: se a nossa última mensagem já foi uma despedida (ex.: hóspede mandou 👍 depois
      // do nosso "Combinado!"), não responde de novo — evita pingue-pongue de despedidas.
      text = params.lastOutText && ALL_FAREWELLS.has(params.lastOutText) ? null : pick(FAREWELL_BY_TONE[tone]);
      outcome = text ? "jev_farewell" : "jev_farewell_silent";
    }

    if (text) {
      const sent = await sendUazapiText(params.phone, text, params.tenantId);
      if (sent) {
        await prisma.whatsappMessage.create({
          data: { tenantId: params.tenantId, phone: params.phone, direction: "OUT", type: "text", content: text, sentBy: "AI" },
        });
      } else if (params.decision === "farewell") {
        return null; // não conseguiu enviar a despedida — deixa o agente tentar do jeito normal
      }
    }
    return outcome;
  } catch (err) {
    console.error("[jev-triage] falha ao aplicar decisão — seguindo com o agente:", (err as Error)?.message || err);
    return null;
  }
}

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export async function runWhatsappTriage(params: {
  tenantId: string;
  guestMessageId: string;
  guestText: string;
  lastAttendantText: string | null;
}): Promise<JevDecisionOutcome | null> {
  return runJevDecision({
    tenantId: params.tenantId,
    feature: JEV_FEATURES.WHATSAPP_TRIAGE,
    state: {
      ultima_mensagem_atendente: params.lastAttendantText?.slice(0, 1000) || null,
      ultima_mensagem_hospede: params.guestText.slice(0, 2000),
    },
    questions: WHATSAPP_TRIAGE_QUESTIONS,
    subjectRef: params.guestMessageId,
    decide: decideWhatsappTriage,
    timeoutMs: 2500,
  });
}

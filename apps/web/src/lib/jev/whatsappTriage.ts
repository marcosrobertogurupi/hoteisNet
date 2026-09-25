// Triagem da mensagem do hóspede no WhatsApp pelo Jev, antes do agente de atendimento (Gemini).
// Decisões possíveis:
//  - "escalate": o hóspede pede explicitamente um humano → escalar na hora, sem gastar o agente;
//  - "farewell": só agradece/se despede e não há nada pendente → despedida cordial curta, sem agente;
//  - "agent": todo o resto → agente como hoje. Pedido de reserva NUNCA sai daqui (função vital).
//
// Fase 1 = só modo SHADOW: a decisão é registrada em JevDecisionLog e o agente roda normalmente;
// o desfecho real (escalou / respondeu) é anotado depois para calibrar os limites abaixo antes de
// ligar o ACTIVE (Fase 3).
import type { JevAnswer, JevQuestion } from "@/lib/jev/client";
import { runJevDecision, type JevDecisionOutcome } from "@/lib/jev/decisions";
import { JEV_FEATURES } from "@/lib/jev/features";

// Limites iniciais — conservadores; recalibrar com os dados do modo sombra.
const ESCALATE_MIN_NOUL = 0.9;
const FAREWELL_MAX_NEEDS_REPLY = 0.15;
const FAREWELL_MIN_CONFIDENCE = 0.85;

// Intenções que nunca podem ser desviadas do agente, qualquer que seja o resto da triagem.
const PROTECTED_INTENTS = new Set(["disponibilidade_preco", "nova_reserva", "consultar_reserva", "cancelar_reserva"]);

const QUESTIONS: Record<string, JevQuestion> = {
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
    questions: QUESTIONS,
    subjectRef: params.guestMessageId,
    decide: decideWhatsappTriage,
    timeoutMs: 2500,
  });
}

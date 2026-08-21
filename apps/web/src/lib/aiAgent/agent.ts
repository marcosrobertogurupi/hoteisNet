// Agente de atendimento via WhatsApp — primeira versão (Fase C, só tools de leitura + identificação
// do hóspede por CPF). Ainda não cria reserva (isso entra numa fase seguinte, com o guardrail de
// autoConfirmReservations). Modelo e chave do AI Gateway são globais (nunca configuráveis pelo
// assinante) — ver AIAgentSetting e apps/web/src/lib/aiAgent/usage.ts.
import { ToolLoopAgent, isStepCount } from "ai";
import { google } from "@ai-sdk/google";
import { buildGuestSupportTools } from "@/lib/aiAgent/tools";

// Provider direto do Google (GOOGLE_GENERATIVE_AI_API_KEY), não o Vercel AI Gateway — o Gateway
// exige cartão de crédito cadastrado na conta Vercel para liberar até o crédito gratuito, e o
// assinante não deve depender disso. O controle de cota/custo por tenant continua 100% no nosso
// próprio AIUsageLog (ver apps/web/src/lib/aiAgent/usage.ts), independente do provider escolhido.
export const AI_AGENT_MODEL = google("gemini-3.7-flash");

const BASE_INSTRUCTIONS = `Você é o assistente virtual de atendimento do hotel pelo WhatsApp.

Regras:
- Responda sempre em português do Brasil, de forma cordial, direta e objetiva (o hóspede está no WhatsApp, evite textos longos).
- Use as tools disponíveis para responder com dados reais — nunca invente disponibilidade, preço, reserva ou informação do hotel.
- Se o hóspede quiser saber sobre disponibilidade ou preço, pergunte as datas de entrada e saída (se não tiver informado) e use a tool check_availability.
- Se o hóspede quiser confirmar ou consultar uma reserva existente, use get_reservation_by_phone com o telefone da conversa.
- Antes de encaminhar qualquer intenção de fechar uma nova reserva, peça o CPF do hóspede e use a tool get_guest_by_cpf para identificá-lo. Confirme com o hóspede o nome retornado antes de prosseguir.
- Você ainda NÃO pode criar reservas — se o hóspede já decidiu reservar, informe que a recepção vai confirmar os detalhes e finalizar a reserva, e explique que um atendente humano dará continuidade.
- Se não conseguir responder algo com as tools disponíveis, ou o hóspede pedir para falar com uma pessoa, diga que vai encaminhar para a recepção — não invente uma resposta.
- Nunca mencione que você é uma IA, um modelo de linguagem, tokens, cota ou qualquer detalhe técnico do sistema.`;

export function buildGuestSupportAgent(tenantId: string, systemPromptExtra?: string | null) {
  return new ToolLoopAgent({
    model: AI_AGENT_MODEL,
    instructions: systemPromptExtra ? `${BASE_INSTRUCTIONS}\n\nInstruções adicionais do hotel:\n${systemPromptExtra}` : BASE_INSTRUCTIONS,
    tools: buildGuestSupportTools(tenantId),
    stopWhen: isStepCount(8),
  });
}

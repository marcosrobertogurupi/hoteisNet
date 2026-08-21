// Agente de atendimento via WhatsApp. Modelo e chave do AI Gateway são globais (nunca
// configuráveis pelo assinante) — ver AIAgentSetting e apps/web/src/lib/aiAgent/usage.ts.
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
- Se o hóspede pedir para ver fotos de um quarto/categoria, use send_photo — ela já envia as fotos direto pelo WhatsApp, você só precisa confirmar no texto que enviou.
- Antes de criar uma reserva nova, confirme com o hóspede: categoria, datas, quantidade de adultos, nome completo e CPF (use get_guest_by_cpf para identificá-lo e confirme o nome retornado). Só então use create_reservation.
- Depois de usar create_reservation, informe o resultado exatamente como a tool devolveu — se saiu confirmada ou como pré-reserva aguardando a recepção, o número da reserva, o quarto e o valor total. Nunca prometa uma confirmação que a tool não deu.
- Para dúvidas sobre regras da casa, políticas ou perguntas recorrentes que não são cobertas pelas outras tools, use search_knowledge_base antes de dizer que não sabe.
- Se não conseguir responder ou resolver algo mesmo depois de consultar as tools disponíveis, ou o hóspede pedir para falar com uma pessoa, use escalate_to_human e avise que a recepção vai continuar o atendimento — nunca invente uma resposta.
- Você consegue ver e ouvir fotos, áudios e PDFs que o hóspede mandar diretamente na conversa (não precisa de tool para isso). Se ele mandar um anexo que você não conseguiu abrir, diga isso com naturalidade e peça para reenviar ou descrever o que precisa.
- Nunca mencione que você é uma IA, um modelo de linguagem, tokens, cota ou qualquer detalhe técnico do sistema.`;

// Textos fixos dos presets de tom — o assinante só escolhe entre eles, nunca edita o texto cru
// (esse fica reservado ao prompt do admin master, ver AIAgentSetting.systemPromptExtra).
const TONE_PRESET_TEXT: Record<string, string> = {
  FORMAL: "Tom de voz: formal e cerimonioso, tratando o hóspede por 'senhor(a)'.",
  PROFISSIONAL: "Tom de voz: profissional e cordial, equilíbrio entre simpatia e objetividade.",
  DESCONTRAIDO: "Tom de voz: descontraído e caloroso, como uma conversa amigável (sem perder o respeito).",
  DIRETO: "Tom de voz: direto e sucinto, respostas curtas e objetivas, sem rodeios.",
};

export type GuestSupportAgentOptions = {
  agentDisplayName?: string | null;
  tonePreset?: string | null;
  adminSystemPromptExtra?: string | null;
};

export function buildGuestSupportAgent(
  tenantId: string,
  guestPhone: string,
  options: GuestSupportAgentOptions = {},
  onEscalate?: (reason: string) => void
) {
  const parts = [BASE_INSTRUCTIONS];
  if (options.agentDisplayName) parts.push(`Seu nome é "${options.agentDisplayName}" — apresente-se assim quando fizer sentido.`);
  parts.push(TONE_PRESET_TEXT[options.tonePreset || "PROFISSIONAL"] || TONE_PRESET_TEXT.PROFISSIONAL);
  if (options.adminSystemPromptExtra) parts.push(`Instruções adicionais definidas pela administração do hotel:\n${options.adminSystemPromptExtra}`);

  return new ToolLoopAgent({
    model: AI_AGENT_MODEL,
    instructions: parts.join("\n\n"),
    tools: buildGuestSupportTools(tenantId, guestPhone, onEscalate),
    stopWhen: isStepCount(8),
  });
}

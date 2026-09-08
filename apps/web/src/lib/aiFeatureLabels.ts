// Traduz as chaves técnicas de `AIUsageLog.feature` (gravadas em logAiUsage) para um rótulo e uma
// descrição em linguagem de negócio, exibidos nas telas de telemetria do painel admin. Ao criar um
// novo `feature`, adicione a entrada correspondente aqui.
export interface AiFeatureLabel {
  label: string;
  description: string;
}

const AI_FEATURE_LABELS: Record<string, AiFeatureLabel> = {
  whatsapp_guest_support: {
    label: "Atendimento ao hóspede (WhatsApp)",
    description:
      "Respostas automáticas do agente de IA às mensagens que os hóspedes enviam no WhatsApp do hotel.",
  },
  whatsapp_guest_support_summary: {
    label: "Resumo de conversa (WhatsApp)",
    description:
      "Compactação do histórico antigo de cada conversa de WhatsApp em um resumo, para o agente manter o contexto gastando menos tokens.",
  },
  platform_support: {
    label: "Suporte da plataforma",
    description:
      "Agente de IA que responde dúvidas de suporte sobre o próprio sistema (equipe HoteisNet e assinantes).",
  },
  operational_monitoring: {
    label: "Agente operacional — alertas",
    description:
      "Redação das mensagens de alerta que o agente operacional envia à equipe do hotel (FNRH presa, quarto parado, reserva sem quarto).",
  },
  operational_knowledge_drift: {
    label: "Agente operacional — base de conhecimento",
    description:
      "Verificação de valores desatualizados (preços, horários) na base de conhecimento do hotel em relação ao cadastro.",
  },
};

export function aiFeatureLabel(feature: string): AiFeatureLabel {
  return AI_FEATURE_LABELS[feature] ?? { label: feature, description: "" };
}

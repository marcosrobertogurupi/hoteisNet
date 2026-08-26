// Chaves e rótulos dos 12 tópicos da Base de Conhecimento do Hotel — módulo puro (sem imports),
// seguro para bundle de cliente. A ordem aqui é a ordem canônica de exibição/relevância.
// O texto-guia inicial de cada tópico fica em lib/knowledgeTopics.ts (lado servidor).
export const KNOWLEDGE_TOPIC_ORDER = [
  "RESERVA_PRECO",
  "CANCELAMENTO",
  "CHECKIN_CHECKOUT",
  "LOCALIZACAO_ACESSO",
  "QUARTO_COMODIDADES",
  "REGRAS_CRIANCAS_PETS",
  "PAGAMENTO_TAXAS",
  "SERVICOS_HORARIOS",
  "PEDIDOS_ESPECIAIS_ACESSIBILIDADE",
  "PROBLEMAS_ESTADIA",
  "BAGAGEM_ENCOMENDAS",
  "RECOMENDACOES_LOCAIS",
] as const;

export type KnowledgeTopicKeyName = (typeof KNOWLEDGE_TOPIC_ORDER)[number];

export const KNOWLEDGE_TOPIC_LABEL: Record<KnowledgeTopicKeyName, string> = {
  RESERVA_PRECO: "Reserva e preço",
  CANCELAMENTO: "Cancelamento e reembolso",
  CHECKIN_CHECKOUT: "Check-in e check-out",
  LOCALIZACAO_ACESSO: "Localização, acesso e estacionamento",
  QUARTO_COMODIDADES: "Quarto, estrutura e comodidades",
  REGRAS_CRIANCAS_PETS: "Regras, crianças, pets e visitantes",
  PAGAMENTO_TAXAS: "Pagamento, caução e taxas",
  SERVICOS_HORARIOS: "Serviços e horários",
  PEDIDOS_ESPECIAIS_ACESSIBILIDADE: "Pedidos especiais e acessibilidade",
  PROBLEMAS_ESTADIA: "Problemas durante a hospedagem",
  BAGAGEM_ENCOMENDAS: "Bagagem, encomendas e objetos esquecidos",
  RECOMENDACOES_LOCAIS: "Recomendações locais",
};

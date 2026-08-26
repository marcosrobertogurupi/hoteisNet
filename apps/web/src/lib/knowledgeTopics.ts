// As 12 áreas canônicas de dúvida de hóspede no atendimento por WhatsApp (levantamento do setor —
// ver o material de origem "Dúvidas mais recorrentes de hóspedes no atendimento via WhatsApp").
// Cada tenant tem um HotelKnowledgeTopic por chave; a tela Base de Conhecimento
// (/app/cadastros/base-conhecimento) semeia cada tópico com o texto-guia abaixo na primeira vez
// que é aberta, e o hotel substitui pelo conteúdo real. O agente de atendimento consulta apenas
// trechos relevantes (via search_knowledge_base), nunca o documento inteiro.
import type { KnowledgeTopicKey } from "@prisma/client";
import { KNOWLEDGE_TOPIC_LABEL, KNOWLEDGE_TOPIC_ORDER } from "@/lib/knowledgeTopicLabels";

export type KnowledgeTopicSeed = {
  key: KnowledgeTopicKey;
  title: string;
  // Texto-guia inicial: uma frase do que o tópico cobre + um checklist do que o hotel precisa
  // preencher. É placeholder — assim que o hotel editar, este texto some.
  guide: string;
};

export const KNOWLEDGE_TOPIC_SEEDS: KnowledgeTopicSeed[] = [
  {
    key: "RESERVA_PRECO",
    title: "Reserva e preço",
    guide:
      "O agente já consulta sozinho os quartos livres e o preço da diária (pelo número de adultos) no cadastro de Tarifas e Apartamentos — não repita isso aqui.\n\nPreencha só o que ele não tem:\n- Como fazer uma reserva (pelo WhatsApp, site, telefone) e se recebe número de confirmação\n- O que o valor da diária já inclui (café da manhã? taxas? Wi-Fi?)\n- Se cobra sinal/antecipado e qual percentual\n- Descontos para crianças, grupos ou empresas\n- Diferença entre tarifa flexível e não reembolsável",
  },
  {
    key: "CANCELAMENTO",
    title: "Cancelamento e reembolso",
    guide:
      "Política de cancelamento, alteração de datas e reembolso.\n\nPreencha:\n- Até quando dá para cancelar sem custo e qual a multa depois disso\n- O que acontece em caso de no-show (não comparecimento)\n- Como funciona a troca de data e se há diferença de preço\n- Prazo estimado de devolução do valor\n- Quem processa o cancelamento quando a reserva foi feita por uma agência/OTA\n\n(O agente sempre pede o número da reserva e o canal antes de prometer qualquer reembolso.)",
  },
  {
    key: "CHECKIN_CHECKOUT",
    title: "Check-in e check-out",
    guide:
      "O agente assume check-in às 14:00 e check-out às 12:00. Preencha aqui se o seu hotel usa outros horários, e o resto:\n- Se dá para fazer early check-in / late check-out, com que custo e se depende de disponibilidade\n- Documentos exigidos na chegada e idade mínima para se hospedar\n- Como o hóspede entra se chegar de madrugada\n- Se existe check-in online / pré-check-in",
  },
  {
    key: "LOCALIZACAO_ACESSO",
    title: "Localização, acesso e estacionamento",
    guide:
      "IMPORTANTE: este é o ÚNICO lugar de onde o agente tira a localização do hotel. Quem pergunta \"onde fica\" quer chegar — o agente vai responder exatamente o que estiver aqui.\n\nPreencha:\n- Endereço completo e link do mapa (Google Maps)\n- Pontos de referência e distância aproximada de aeroporto/rodoviária\n- Instruções para quem vem de carro e de transporte público\n- Se tem estacionamento, se é gratuito, se precisa reservar vaga\n- Se há transfer (horários, ponto de embarque, se precisa agendar)",
  },
  {
    key: "QUARTO_COMODIDADES",
    title: "Quarto, estrutura e comodidades",
    guide:
      "As camas, características e fotos de cada quarto já vêm do cadastro de Apartamentos — o agente consulta e envia as fotos sozinho. Não repita isso aqui.\n\nPreencha só o que não está no cadastro (evitando generalizar o que não vale para todos os quartos):\n- Regras gerais que valem para todos os quartos (ex: Wi-Fi gratuito, senha entregue no check-in)\n- Exceções (ex: só as suítes têm banheira; quartos 201–210 sem elevador)\n- O que o hotel NÃO tem (ex: não há cozinha nos quartos)\n- Piscina, academia, spa — e se o restaurante serve almoço/jantar (os horários vão em \"Serviços e horários\")",
  },
  {
    key: "REGRAS_CRIANCAS_PETS",
    title: "Regras, crianças, pets e visitantes",
    guide:
      "Regras da casa que o hóspede precisa saber antes de fechar.\n\nPreencha:\n- Política para animais de estimação\n- Se criança paga, a partir de que idade, e se há berço\n- Política de visitantes no quarto\n- Se é permitido fumar\n- Ocupação máxima por quarto e política de hóspede adicional\n- Se pode comemorar/decorar no quarto",
  },
  {
    key: "PAGAMENTO_TAXAS",
    title: "Pagamento, caução e taxas",
    guide:
      "Formas de pagamento e cobranças extras.\n\nPreencha:\n- Formas de pagamento aceitas (dinheiro, PIX, cartões, faturado)\n- Se exige caução/pré-autorização no cartão e de quanto\n- Quando cada valor é cobrado (na reserva, na chegada, na saída)\n- Taxas extras (turismo, serviço, limpeza de pet etc.)\n- Se parcela e em quantas vezes",
  },
  {
    key: "SERVICOS_HORARIOS",
    title: "Serviços e horários",
    guide:
      "O agente já sabe os serviços com preço do cadastro de Serviços (lavanderia, traslado, cama extra...) e o horário do café da manhã das Configurações — não repita isso aqui.\n\nPreencha os horários de funcionamento, que o sistema não guarda:\n- Restaurante e room service: horários\n- Piscina, academia, spa, sauna: até que horas funcionam\n- Recepção 24h?\n- Serviços temporariamente suspensos (obra, manutenção, sazonalidade)",
  },
  {
    key: "PEDIDOS_ESPECIAIS_ACESSIBILIDADE",
    title: "Pedidos especiais e acessibilidade",
    guide:
      "Personalização e acessibilidade.\n\nPreencha:\n- Se dá para garantir cama de casal / camas separadas / andar baixo\n- Quartos acessíveis (para cadeirante, com barras de apoio)\n- Preparar surpresa de aniversário / lua de mel e como pedir\n- Restrições alimentares no café da manhã\n\n(Pedidos que exigem coordenação entre setores costumam ir para a recepção — o agente escala.)",
  },
  {
    key: "PROBLEMAS_ESTADIA",
    title: "Problemas durante a hospedagem",
    guide:
      "Como o hóspede pede ajuda durante a estadia.\n\nPreencha:\n- Como pedir toalhas, limpeza extra, itens de higiene\n- Como reportar manutenção (ar, chuveiro, Wi-Fi, barulho) e prazo de retorno esperado\n- Ramal / contato direto da recepção\n- O que é urgente (falta de água quente, não consegue entrar no quarto, emergência) e vai direto para uma pessoa",
  },
  {
    key: "BAGAGEM_ENCOMENDAS",
    title: "Bagagem, encomendas e objetos esquecidos",
    guide:
      "Logística antes da chegada e depois da saída.\n\nPreencha:\n- Se guarda a mala antes do check-in / depois do check-out e se cobra\n- Se recebe encomendas em nome do hóspede\n- Como proceder quando o hóspede esquece um objeto no quarto (achados e perdidos, envio pelos Correios, prazo de guarda)",
  },
  {
    key: "RECOMENDACOES_LOCAIS",
    title: "Recomendações locais",
    guide:
      "O hotel como fonte de orientação local.\n\nPreencha:\n- Onde comer perto (opções por faixa de preço)\n- O que fazer / passeios na região\n- Como ir ao aeroporto, rodoviária, centro\n- Farmácia, mercado, caixa eletrônico mais próximos",
  },
];

// Rótulo curto de cada chave — reaproveitado onde só se tem o topicKey (ex: entradas de Q&A).
export const KNOWLEDGE_TOPIC_TITLES = KNOWLEDGE_TOPIC_LABEL as Record<KnowledgeTopicKey, string>;

export const KNOWLEDGE_TOPIC_KEYS = KNOWLEDGE_TOPIC_ORDER as readonly KnowledgeTopicKey[];

// Texto-guia inicial por chave — usado para decidir se um tópico "ainda está com o placeholder"
// (nesse caso o agente não deve recitá-lo como informação do hotel). Ver isTopicFilled em aiAgent/tools.ts.
export const KNOWLEDGE_TOPIC_GUIDE_BY_KEY = Object.fromEntries(
  KNOWLEDGE_TOPIC_SEEDS.map((t) => [t.key, t.guide])
) as Record<KnowledgeTopicKey, string>;

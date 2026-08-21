# Plano de Implementação — Agentes de IA (Atendimento + Operacional)

## Contexto

O HoteisNet tem uma base sólida de FNRH digital (pré-check-in do hóspede + transmissão ao SNRHos)
e de mensageria WhatsApp (uazapi) com histórico de conversa e envio automático de mensagens em
pontos fixos do ciclo de hospedagem. Sobre essa base, o SaaS tem **dois agentes de IA autônomos**:

1. **Agente de Atendimento** — atende o hóspede pelo WhatsApp do hotel: responde dúvidas
   corriqueiras, verifica disponibilidade de datas, tira dúvida de horários/serviços, envia fotos
   de quarto quando solicitado, marca reservas, e dispara o link de FNRH horas antes do check-in.
2. **Agente Operacional (fiscal do sistema)** — hierarquicamente superior ao agente de
   atendimento, fiscaliza as operações internas do assinante: inconsistências de dados, quartos
   presos em manutenção ou limpeza há tempo demais, FNRH/SNRHos travados, e qualquer coisa que
   atrapalhe o bom atendimento ao hóspede ou a operação do usuário. Envia alertas e, de forma
   configurável por assinante, poderá um dia agir sozinho em determinadas situações (ainda não
   implementado — ver Riscos abaixo).

Ambos os agentes **aprendem com o tempo**: quando um humano corrige o agente ou responde algo que
ele não sabia, isso vira conhecimento reaproveitável nas próximas conversas parecidas — não é
re-treino do modelo (impossível via API), é uma base de conhecimento crescente consultada antes de
responder (RAG leve).

## Separação de controle: assinante vs. admin master

Esta é a regra mais importante da feature — **nunca inverter**:

| Controle | Onde mora | Quem edita |
|---|---|---|
| Ligar/desligar atendimento por IA no WhatsApp | Configurações do assinante | Assinante/usuários dele |
| Nome e foto de perfil do agente ("skin" de identidade) | Configurações do assinante | Assinante |
| Preset de tom de conversa (Formal, Profissional, Descontraído, Direto) | Configurações do assinante | Assinante |
| Se reserva feita pelo bot confirma direto ou vira pré-reserva | Configurações do assinante | Assinante |
| Se o agente operacional pode agir sozinho ou sempre pede autorização | Configurações do assinante | Assinante |
| Telefone de alerta do agente operacional | Configurações do assinante | Assinante |
| **Prompt de personalidade/forma de atendimento** (texto livre por trás de cada preset de tom) | Painel admin (`/admin`, seção "Agentes de IA") | Admin master |
| **Cota/controle total de tokens por assinante** (override do plano, bloqueio de uso) | Painel admin | Admin master |
| Chave de API do provider de IA e modelo usado | Env vars / infra | Ninguém edita pela UI |

O assinante nunca vê nem edita o prompt cru nem a chave/modelo — só escolhe entre presets e liga
funcionalidades. O admin master tem controle fino do prompt e do orçamento de cada assinante,
incluindo poder bloquear o uso de IA de um assinante específico independente do toggle dele.

## Estado atual — tudo abaixo já implementado, testado de ponta a ponta e em produção

- **Fundação de IA**: pacote `ai` (Vercel AI SDK) + `ToolLoopAgent`. Modelo `gemini-3.7-flash` via
  **provider direto do Google** (`@ai-sdk/google`, env `GOOGLE_GENERATIVE_AI_API_KEY`) — o Vercel AI
  Gateway foi tentado primeiro mas está bloqueado até cadastrar cartão de crédito na conta Vercel;
  o código está pronto para trocar de volta quando isso for resolvido
  (`apps/web/src/lib/aiAgent/agent.ts`).
- **`AIAgentSetting`** (schema): campos separados por dono — assinante (`enabled`,
  `autoConfirmReservations`, `agentDisplayName`, `agentAvatarUrl`, `tonePreset`,
  `monitoringEnabled`, `alertPhone`, `operationalAutonomyMode`) vs. admin master
  (`systemPromptExtra`, `tokenQuotaOverride`, `blocked`).
- **`AIUsageLog`**: grava tokens/custo real a cada chamada. Cota vem de `SaaSPlan.aiTokenQuota`,
  sobrescrita por `AIAgentSetting.tokenQuotaOverride` quando o admin define um valor.
- **Agente de Atendimento** (`apps/web/src/lib/aiAgent/`): tools —
  `check_availability`, `get_reservation_by_phone`, `get_guest_by_cpf` (busca no cadastro do hotel
  → fallback Hub do Desenvolvedor), `list_room_categories`, `get_hotel_info`,
  `search_knowledge_base` (base de conhecimento do próprio tenant). Prompt final combina:
  instruções base + nome do agente + preset de tom + prompt do admin. Ligado ao webhook da uazapi
  (`api/uazapi/webhook/[tenantId]/route.ts`) com guarda anti-atropelo de humano (não responde se um
  humano respondeu a mesma conversa nos últimos 30min), checagem de cota e de `blocked` antes de
  gastar tokens.
- **Agente Operacional v1** (`apps/worker/src/operationalAgent.ts`, cron a cada 15min): detecção
  100% determinística (sem LLM) de: FNRH travada no SNRHos (`snrhosAttempts>=5`), pré-check-in não
  enviado com check-in próximo, quarto em `MAINTENANCE` >24h parado, quarto `VACANT_DIRTY` >6h
  parado, WhatsApp do hotel desconectado. Quando há problema **novo** (dedupe via
  `OperationalAlertLog`), o LLM só compõe o resumo em linguagem natural, e o alerta é enviado por
  WhatsApp para `alertPhone`. Roda apenas para tenants com `monitoringEnabled=true` e
  `blocked=false`.
- **Base de conhecimento** (`SupportKnowledgeBase`, por tenant, `agentType` SUPPORT/OPERATIONAL):
  tela em `/app/cadastros/base-conhecimento` para o operador salvar pergunta+resposta
  manualmente; API em `/api/tenant/knowledge-base`. Busca por palavras-chave (sem embeddings —
  suficiente para o volume esperado; migrar para pgvector se a base crescer muito).
- **Configurações do assinante** (`/app/settings`, seção "Agente de IA"): nome/foto do agente,
  preset de tom, toggles de atendimento/reserva automática/monitoramento, telefone de alerta,
  seletor de autonomia do agente operacional (autonomia em si ainda não implementada, ver Riscos).
- **Painel admin** (`/admin`, dentro de "Configuração do Sistema" → "Agentes de IA — Prompt, Cota
  de Tokens e Bloqueio por Assinante"): prompt cru por tenant, override de cota, bloqueio.
  Restrito a `SUPER_ADMIN` (a rota `/api/admin/tenants` já checava isso antes desta feature).
- **Worker no Railway**: serviço `worker` criado no projeto `hoteisnet-api`, conectado ao GitHub
  (branch `master`), com `GOOGLE_GENERATIVE_AI_API_KEY` configurada, deploy automático a cada push
  (`railpack.json` na raiz do monorepo ensina o Railway a buildar só o workspace do worker).

## O que falta

### Fase C ✅ concluída (exceto um item opcional)

- `create_reservation` ✅ — cria a reserva de verdade (transação atômica, re-checa conflito de
  quarto dentro da própria tx, escolhe tarifa pelo nº de adultos), com o guardrail de
  `autoConfirmReservations` decidido em código (nunca pelo modelo). Testado com os dois caminhos
  (CONFIRMED e PRE_RESERVATION).
- `escalate_to_human` ✅ — o agente marca explicitamente quando precisa de humano (hoje loga no
  console do servidor; a mensagem IN continua chegando como não-lida na tela normalmente).
- Indicador visual IA vs humano no histórico ✅ — bolha violeta + ícone de robô + "Agente de IA"
  em `MensagensWhatsAppModal.tsx`. Corrigido também um gap real encontrado nesse trabalho:
  `POST /api/uazapi/messages` (usada pelo envio manual do operador) não gravava `sentBy: "HUMAN"`,
  o que quebraria silenciosamente a guarda anti-atropelo do agente — corrigido.
- Envio de FNRH sob demanda pelo próprio agente (hoje só o worker dispara automaticamente por
  horário) — **ainda pendente**, baixa prioridade.
- Botão/atalho na tela de conversa do WhatsApp para salvar uma troca de mensagens direto como
  conhecimento (hoje precisa reescrever manualmente em `/app/cadastros/base-conhecimento`) —
  **ainda pendente**.

### Fase B ✅ concluída

- `HotelService` (model real) substitui a tela mock de `cadastros/servicos` — CRUD completo
  (`api/tenant/services`), tool `list_services` no agente. Testado via UI (criação real de um
  serviço) e via agente (respondeu preço corretamente).
- `Tenant.breakfastHours` — campo em Configurações ("Hotel (Dados)"), exposto via `get_hotel_info`.
  Testado: agente respondeu o horário correto configurado.
- `sendUazapiImage` (`apps/web/src/lib/uazapi.ts`) + tool `send_photo` — envia até 3 fotos de um
  quarto da categoria pedida (`Room.photos`, já populado em outra sessão via
  `CadastroApartamentoModal.tsx`). Testado o caminho de erro (categoria sem fotos cadastradas);
  envio real ainda não testado por não haver fotos nos quartos demo atuais.

### Fase I — Interpretação de mídia (áudio/foto/PDF) ✅ implementada, teste real pendente

O agente hoje só processava mensagens de texto. Agora o webhook também dispara o agente para
mensagens de mídia (`IN`, direção do hóspede): baixa/descriptografa o anexo via
`downloadUazapiMedia` (mesma chamada `POST {serverUrl}/message/download` já usada pela tela de
conversa) e monta um content multimodal (`{ type: "file", mediaType, data: urlPública }`) para o
Gemini interpretar de verdade — imagem, áudio e PDF são suportados nativamente pelo modelo; outros
tipos (vídeo, sticker) viram um placeholder de texto para o agente não travar. Só a mensagem mais
recente do turno é baixada; mensagens antigas do histórico reaproveitam o `mediaUrl` já salvo, sem
re-baixar a cada novo turno. Mídia enviada pelo próprio hotel (`OUT`, ex: PDF de extrato) fica de
fora do histórico do agente.

Verificado por leitura do código-fonte do `@ai-sdk/google` (`convertToGoogleMessages`): quando o
`data` de um content part `file` é uma URL, o SDK envia `fileData.fileUri` direto pro Gemini, que
busca o arquivo — mecanismo documentado e suportado para imagem/áudio/PDF. **Não foi possível
confirmar com uma chamada real** porque a cota diária gratuita da chave do AI Studio esgotou
durante os testes desta sessão (erro 429 `RESOURCE_EXHAUSTED`) — decisão do usuário foi deixar
como está e validar depois, com a cota resetada ou com uma mensagem real de WhatsApp.

## O que falta

1. **Testar de verdade o suporte a mídia** (Fase I acima) assim que a cota da chave Gemini
   resetar, ou com uma mensagem real de WhatsApp.
2. Os dois itens pendentes da Fase C (envio de FNRH sob demanda, atalho de salvar conhecimento
   direto da conversa).
3. Autonomia do Agente Operacional (`AUTONOMOUS_LIMITED`) — só depois de definir a lista exata de
   ações permitidas com o usuário.

## Lição operacional desta sessão

Nunca escrever um loop de retry em background sem limite máximo de tentativas/tempo total —
um erro 429 pode ser cota diária (não reseta em minutos), não só limite por minuto. Preferir 2-3
tentativas com backoff curto e reportar a falha, em vez de ficar tentando indefinidamente.

## Riscos e decisões abertas

- **Lista exata de ações que o Agente Operacional pode tomar sozinho em modo
  `AUTONOMOUS_LIMITED`** — não implementar nenhuma ação de escrita autônoma sem essa lista aprovada
  explicitamente. Hoje o toggle existe na UI do assinante mas não faz nada (aviso explícito no
  texto de ajuda da tela).
- Pagamento/sinal de reserva feita pelo bot: ainda fora do escopo.
- AI Gateway (Vercel) segue bloqueado por falta de cartão — revisitar se quiser voltar a usá-lo no
  lugar do provider direto do Google.
- Não existe usuário `SUPER_ADMIN` real no banco ainda (só `TENANT_ADMIN`) — o painel `/admin` foi
  testado com uma sessão JWT sintética assinada manualmente. Antes de usar o painel admin em
  produção, criar um usuário `SUPER_ADMIN` de verdade.

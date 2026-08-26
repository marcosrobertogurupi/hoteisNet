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

### Fase I — Interpretação de mídia (áudio/foto/PDF) ✅ concluída e testada

O agente hoje só processava mensagens de texto. Agora o webhook também dispara o agente para
mensagens de mídia (`IN`, direção do hóspede): baixa/descriptografa o anexo via
`downloadUazapiMedia` (mesma chamada `POST {serverUrl}/message/download` já usada pela tela de
conversa) e monta um content multimodal para o Gemini interpretar de verdade — imagem, áudio e PDF
são suportados nativamente pelo modelo; outros tipos (vídeo, sticker) viram um placeholder de texto
para o agente não travar. Só a mensagem mais recente do turno é processada; mensagens antigas do
histórico viram placeholder, sem reprocessar anexo a cada novo turno. Mídia enviada pelo próprio
hotel (`OUT`, ex: PDF de extrato) fica de fora do histórico do agente.

**Achado importante:** a primeira versão passava a URL do anexo direto (`fileData.fileUri`) — o SDK
suporta isso e o mecanismo está documentado, mas na prática a API do Gemini **bloqueia esse
caminho com 429 (`RESOURCE_EXHAUSTED`) no tier gratuito**, mesmo com cota de texto disponível
(confirmado testando os dois lado a lado: texto simples = 200 OK, mesmo request com `fileUri` =
429, `inlineData` em base64 = 200 OK). Corrigido: `fetchAsBase64` (`apps/web/src/lib/uazapi.ts`)
baixa os bytes do anexo e envia como dado inline em vez de URL. Testado de ponta a ponta com o
agente completo (tools + histórico) para imagem e PDF — ambos interpretados corretamente.

## Fase J — Agente 2 executa ações (cancelamento, FNRH sob demanda, autonomia limitada) ✅ concluída

O Agente de Atendimento e o Agente Operacional rodam em processos/deploys diferentes (Vercel/web e
Railway/worker), sem chamada de rede entre si — só compartilham o banco. Por isso a "delegação" de
uma ação do Agente 1 para o Agente 2 não é uma 2ª chamada de IA por ação (dobraria custo/latência
sem ganho de segurança real, e adicionaria um novo jeito da IA errar num dado já correto) — é um
**núcleo determinístico de execução compartilhado**, com auditoria própria (`AuditLog`, convenção
`action` prefixado `AGENT_`), chamado tanto pelo Agente 1 (síncrono, durante a conversa) quanto pelo
Agente Operacional (assíncrono, no ciclo de monitoramento).

- `cancel_reservation` ✅ — soft-cancel de verdade (`status=CANCELLED`, nunca apaga a linha; a
  exclusão física continua existindo só para o admin, via `DELETE /api/reservations`). Gated por
  `AIAgentSetting.allowAgentCancelReservation` (novo campo, desligado por padrão); nunca cancela
  reserva com `CHECKED_IN` (escala para a recepção); sempre exige confirmação explícita do hóspede
  antes de executar (mesmo padrão de dois turnos que `create_reservation` já usava).
- `resend_fnrh_link` ✅ — reaproveita `sendPreCheckinLink` (mesma função do cron automático e do
  botão manual), sem lógica nova de envio.
- Agente Operacional em modo `AUTONOMOUS_LIMITED` ✅ — implementado com escopo bem restrito, sem
  nenhuma ação física/irreversível: avisa a governanta responsável direto no WhatsApp dela (via
  `HousekeepingTask` aberta com `housekeeperId`) em vez de só o alerta genérico quando um quarto
  fica preso; e dá **uma única chance extra** de reenvio automático a uma FNRH travada no SNRHos
  (reseta `snrhosAttempts`, nunca mais que uma vez por registro — checado via `AuditLog` antes de
  agir, respeitando a lição de nunca ter retry sem teto). Em `ALERT_ONLY` (padrão) segue só
  alertando, como antes.
- Tela **"Ações do Agente"** ✅ (`app/relatorios/agente-acoes`) — histórico de tudo que os dois
  agentes já fizeram sozinhos, reaproveitando o `AuditLog` (sem tabela nova).

## Fase K — Alerta visual + sonoro de intervenção humana ✅ concluída

Testando a Fase J via WhatsApp real, ficou claro que `escalate_to_human` não avisava ninguém (só um
`console.log` no servidor) — e pior, um hóspede que só tem reserva (sem check-in) não tem
`StayCheckin` aberto, então a conversa dele é invisível em qualquer tela do sistema hoje (o badge de
"não lidas" do Mapa de Quartos vem de `StayCheckin._count.whatsappMessages`).

- Novo model `HumanEscalation` (`packages/database/prisma/schema.prisma`) — diferente do `AuditLog`
  (append-only), tem estado mutável `resolved` pra alimentar um badge. Criada pelo Agente de
  Atendimento (`escalate_to_human`, com dedupe por telefone — não repica a cada nova mensagem do
  mesmo hóspede esperando) e pelo Agente Operacional (uma por issue nova detectada no worker).
- Sino funcional em `apps/web/src/app/app/layout.tsx` (`HumanEscalationBell`) — polling a cada 5s,
  badge com contagem, som configurável (`playHumanInterventionSound`, timbre diferente do som de
  WhatsApp existente), dropdown com "Marcar como resolvido" (sempre manual, sem detecção automática
  nesta v1). Só aparece no Mapa de Quartos (`/app`) e Mapa de Reservas (`/app/reservations`) — por
  allowlist explícita, nunca em telas financeiras.
- **Fora de escopo, documentado como pendência maior:** reconstruir uma "caixa de entrada" de
  WhatsApp que liste toda conversa independente de `StayCheckin` — é a causa raiz de por que
  reservas/prospects ficam invisíveis hoje, mas é uma feature bem maior que o alerta sonoro/visual
  já resolve a urgência imediata.

## Fase L — Base de Conhecimento do Hotel (dois níveis + aprendizado) ✅ concluída

Evolução da `SupportKnowledgeBase` rasa (lista plana de Q&A, sem edição) para uma base que o hotel
mantém de verdade, organizada pelas 12 áreas canônicas de dúvida de hóspede no WhatsApp
(levantamento do setor — ver o material "Dúvidas mais recorrentes de hóspedes no atendimento via
WhatsApp"). Decisões travadas com o usuário antes de codar: estrutura em dois níveis; fila de
sugestões com aprovação humana; qualquer usuário logado edita (sem `requireAdmin`); e — só para a
Fase 3 — o Agente Operacional pode reescrever sozinho valores desatualizados, com escopo restrito
(ver Fase L3).

### Fase L1 ✅ (dados + edição humana)

- **Schema**: `HotelKnowledgeTopic` (1 linha por `[tenant, topicKey]` das 12 áreas, `content` texto
  livre semeado com um texto-guia "Preencha: ..."), `KnowledgeRevision` (histórico append-only de
  toda edição de conteúdo, para o "Desfazer"), campos novos em `SupportKnowledgeBase` (`topicKey`,
  `status` ACTIVE/PENDING_REVIEW/ARCHIVED substituindo o antigo `verified`, `lastReviewedAt`,
  `updatedByName`), e em `AIAgentSetting` (`knowledgeReviewIntervalDays` = 90,
  `knowledgeAutoRewriteEnabled` = false). RLS habilitado nas 2 tabelas novas
  (`supabase/migrations/20260826120000_...`).
- **Seed preguiçoso**: `ensureKnowledgeTopics` (`apps/web/src/lib/knowledgeBase.ts`) roda no GET da
  tela — sem script de backfill, para não haver dois textos-guia divergindo (a detecção de "tópico
  ainda com placeholder" em `isTopicFilled` compara com o guia canônico em `lib/knowledgeTopics.ts`).
- **Rotas**: `GET /api/tenant/knowledge-base` devolve `{ topics, entries }`; `PATCH .../topics/[topicKey]`
  (editar conteúdo / "marcar como revisado"); `PATCH .../[id]` (editar entrada / aprovar sugestão /
  arquivar); `GET .../revisions` + `POST .../revisions/[id]/revert`.
- **Tool `search_knowledge_base`**: agora devolve `{ topicos, perguntas }` — trechos dos documentos
  por área (máx. 2, truncados a 700 chars) + Q&A só `ACTIVE`. Nunca o documento inteiro (custo).
- **UI** `/app/cadastros/base-conhecimento`: 12 tópicos em accordion editável com "revisado há N d" /
  "marcar como revisado", Q&A por tópico (editar/arquivar/excluir), histórico com "Desfazer".
  Configurações → Agente de IA: link + campo "revisar a cada N dias" + checkbox da reescrita
  automática (só aparece com autonomia = "Agir sozinho").

### Fase L2 ✅ (aprendizado do agente de atendimento)

- **Fila de sugestões**: ao chamar `escalate_to_human`, o webhook registra a última pergunta do
  hóspede como `SupportKnowledgeBase { status: PENDING_REVIEW, sourceType: ESCALATION_SUGGESTED }`
  (`recordAgentKnowledgeGap`, sem chamada de IA, dedupe por pergunta). Nunca vira conhecimento
  ativo — some na seção "Sugestões do agente" da tela para um humano escrever a resposta e aprovar.
- **Botão "salvar como conhecimento"** em `MensagensWhatsAppModal.tsx` — em cada mensagem de texto
  do hóspede; pré-preenche a pergunta e (quando existe) a resposta humana seguinte.

### Fase L3 ✅ (Agente Operacional na Base de Conhecimento)

Em `apps/worker/src/operationalAgent.ts`, só para tenants com o agente de atendimento ligado
(`AIAgentSetting.enabled`):

- **`KNOWLEDGE_STALE`** (`detectStaleKnowledge`): tópico **já preenchido** (`lastReviewedAt` não
  nulo) que passou de `knowledgeReviewIntervalDays` sem revisão → alerta + sino, auto-resolve
  quando o tópico é revisado. Tópico nunca preenchido não gera alerta (a tela já mostra isso).
- **`KNOWLEDGE_DRIFT`** (`runKnowledgeDrift`): compara os 4 tópicos elegíveis (Serviços/horários,
  Reserva/preço, Localização/acesso, Check-in/out) com fatos do cadastro (`buildKnowledgeFacts`:
  `breakfastHours`/`breakfastHoursHoliday`, check-in/out padrão, telefone, endereço, tarifa mais
  barata, preços de `HotelService`). Pré-filtro por regex (só chama o modelo se há token de valor);
  1 chamada de IA no máximo a cada 6 h por tenant (throttle em memória). O modelo só **propõe**
  divergências (`generateStructured` + `responseSchema`); cada proposta passa por um portão
  determinístico: `valorCorreto` idêntico a um fato, `valorNoTexto` presente literalmente no texto,
  troca de até 40 caracteres, confiança ≥ 0.8. Se passa **e** `knowledgeAutoRewriteEnabled` +
  `AUTONOMOUS_LIMITED`: substitui só aquela string, grava `KnowledgeRevision (AGENT_OPERATIONAL)` +
  `AuditLog (AGENT_KB_UPDATE)`, teto de 3 por ciclo, e o alerta de WhatsApp menciona a correção.
  Senão: sinaliza como `KNOWLEDGE_DRIFT` para um humano. Nunca toca em texto de política.
- "Ações do Agente" (`app/relatorios/agente-acoes`) rotula `AGENT_KB_UPDATE`; "Desfazer" na tela da
  base reverte a edição do agente.

## O que falta

1. Caixa de entrada de WhatsApp independente de stay (ver Fase K acima) — feature maior, ainda não
   planejada em detalhe.
2. Pequeno ajuste: "Desfazer" restaura o `content` mas não o `lastReviewedAt`, então um tópico pode
   ficar exibindo "Revisado hoje" com o texto-guia de volta (inofensivo — `isTopicFilled` compara o
   conteúdo, o agente não usa mesmo assim).

## Lição operacional desta sessão

Nunca escrever um loop de retry em background sem limite máximo de tentativas/tempo total —
um erro 429 pode ser cota diária (não reseta em minutos), não só limite por minuto. Preferir 2-3
tentativas com backoff curto e reportar a falha, em vez de ficar tentando indefinidamente.

## Riscos e decisões abertas

- **Lista de ações do modo `AUTONOMOUS_LIMITED`** — resolvido na Fase J: escopo aprovado
  explicitamente com o usuário antes de codar (avisar governanta + uma chance extra de FNRH), toggle
  agora funcional. Qualquer ação nova de escrita autônoma continua exigindo aprovação explícita
  antes de implementar.
- Pagamento/sinal de reserva feita pelo bot: ainda fora do escopo (cancelamento também não mexe em
  estorno/pagamento).
- AI Gateway (Vercel) segue bloqueado por falta de cartão — revisitar se quiser voltar a usá-lo no
  lugar do provider direto do Google.
- Não existe usuário `SUPER_ADMIN` real no banco ainda (só `TENANT_ADMIN`) — o painel `/admin` foi
  testado com uma sessão JWT sintética assinada manualmente. Antes de usar o painel admin em
  produção, criar um usuário `SUPER_ADMIN` de verdade.

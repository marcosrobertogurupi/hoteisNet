# Plano de Implementação — Agente de IA (Monitoramento + Atendimento WhatsApp)

## Contexto

O HoteisNet já tem uma base sólida de FNRH digital (pré-check-in do hóspede + transmissão ao
SNRHos) e de mensageria WhatsApp (uazapi) com histórico de conversa e envio automático de
mensagens em pontos fixos do ciclo de hospedagem. O próximo passo é dar um salto qualitativo:
um agente de IA que (1) monitora a saúde operacional do sistema — a começar pela FNRH, que tem
multa legal associada a falha de envio — e (2) atende o hóspede diretamente pelo WhatsApp,
respondendo dúvidas e até fazendo reservas, sem precisar de um humano na recepção o tempo todo.

Este documento é o plano de implementação. Uma nova sessão pode começar direto por aqui.

## Decisões já tomadas com o usuário

1. **Reserva feita pelo agente**: comportamento **configurável por assinante**. Cada tenant
   escolhe em Configurações se o agente pode confirmar a reserva direto (`CONFIRMED`) ou se deve
   sempre criar como `PRE_RESERVATION` pendente de confirmação humana. Implementar como
   `AIAgentSetting.autoConfirmReservations: Boolean`.
2. **Modelo de IA**: **Gemini 3.5**, via **Vercel AI Gateway** (não SDK direto do Google nem da
   Anthropic) — usando o pacote `ai` (Vercel AI SDK) com uma string de modelo `"google/..."`.
   **Antes de escrever qualquer código**, confirmar o ID exato do modelo disponível no Gateway
   (nunca usar de memória):
   ```bash
   curl -s https://ai-gateway.vercel.sh/v1/models | jq -r '[.data[] | select(.id | startswith("google/")) | .id] | reverse | .[]'
   ```
   Escolher a versão mais recente/capaz disponível com esse prefixo.
3. **Stack**: Vercel AI SDK (`npm install ai`) com o padrão `ToolLoopAgent` (verificar a API atual
   em `node_modules/ai/docs/` no momento da implementação — a skill `vercel:ai-sdk` deste projeto
   avisa que o conhecimento "de memória" sobre o SDK está desatualizado).

## Estado atual relevante (pesquisado nesta sessão)

- **IA**: hoje é só schema — `AIUsageLog` e `Tenant/SaaSPlan.aiTokenQuota` existem no Prisma mas
  **nunca são lidos/gravados em nenhuma rota**. As telas "Central de Ajuda com IA"
  (`app/support/page.tsx`) e "Telemetria IA" (`admin/ai-telemetry/page.tsx`) são 100% mock
  (`setTimeout`/arrays fixos), sem nenhum client OpenAI/Gemini/Anthropic no projeto.
- **WhatsApp (uazapi)**: infraestrutura real e madura, mas **sem nenhuma resposta automática
  hoje**. O webhook (`apps/web/src/app/api/uazapi/webhook/[tenantId]/route.ts`) só armazena a
  mensagem recebida (`WhatsappMessage`, `direction: "IN"`) para o operador humano ver na tela —
  não existe nenhum branch que gere ou dispare uma resposta.
  - Envio de texto: `sendUazapiText` em `apps/web/src/lib/uazapi.ts`.
  - Envio de mídia: só `type: "document"` (PDF) implementado hoje, em
    `apps/web/src/app/api/uazapi/send-reserva/route.ts` (`POST {serverUrl}/send/media`). Enviar
    foto exige o mesmo endpoint com `type: "image"`, ainda não usado em lugar nenhum do código.
  - Credenciais: `getTenantUazapiCredentials` em `apps/web/src/lib/uazapiInstance.ts` (com
    fallback hardcoded — dívida de segurança já registrada no PRD.md).
- **Dados que faltam para o agente responder** (pré-requisitos, ver Fase B):
  - Não existe endpoint de **disponibilidade de quarto por período** (o que existe,
    `api/reservations/rooms`, só lista status atual, sem filtro de data).
  - Não existe endpoint de **busca de reserva por telefone/CPF**.
  - **Não existe model `Service`/`HotelService`** no Prisma — a tela `cadastros/servicos` é mock
    puro (array fixo em `useState`, badge "Dados Sincronizados" é falso).
  - **Nenhum campo de horário de café da manhã** em `Tenant` ou em qualquer outro model.
  - **Nenhum campo de foto** em `Room`/`RoomCategory`/`Tenant` — o único `imageUrl` do schema é
    de `Product` (produto de PDV/estoque), não serve para isso.
- **FNRH — sinais de monitoramento já bem expostos** (não precisa criar nada novo para ler):
  - `Reservation.preCheckinSent` (link de pré-check-in já foi enviado).
  - `FNRHRecord.transmittedSNRHos` / `transmittedAt` / `snrhosReservaId` / `snrhosHospedeId` /
    `snrhosPessoaId` / **`snrhosLastError`** / **`snrhosAttempts`** — o job
    `apps/worker/src/snrhosTransmit.ts` já para de tentar reenviar após 5 tentativas
    (`MAX_ATTEMPTS`), deixando o erro registrado em `snrhosLastError`. Isso é exatamente o sinal
    que o agente de monitoramento deve vigiar: "existe algum `FNRHRecord` com `snrhosAttempts >= 5`
    e `transmittedSNRHos = false`?" é uma pergunta de uma linha de SQL, mas a recepção não tem
    hoje nenhum jeito de saber disso sem entrar no banco.

## Arquitetura proposta

```
Hóspede no WhatsApp
      │
      ▼
Webhook uazapi (rota já existe, hoje só grava)
      │
      ├── mensagem de operador humano (fromMe) → comportamento atual, sem mudança
      │
      └── mensagem do hóspede (IN) + AIAgentSetting.enabled = true + conversa não assumida
          por um humano
                │
                ▼
        Agente de Atendimento (Vercel AI SDK, tools tenant-scoped)
                │
                ├─ tool: check_availability(checkIn, checkOut, categoryId?)
                ├─ tool: create_reservation(...)          → respeita autoConfirmReservations
                ├─ tool: get_reservation_by_phone(phone)
                ├─ tool: list_room_categories()
                ├─ tool: list_services()
                ├─ tool: get_hotel_info()                 → café da manhã, políticas, etc.
                └─ tool: send_photo(target: "hotel" | roomCategoryId)
                │
                ▼
        Resposta enviada via sendUazapiText / send/media (type: image)
        + WhatsappMessage (direction: "OUT", origem: "AI")
```

```
Worker (cron, já existe infra em apps/worker)
      │
      ▼
Agente de Monitoramento (roda a cada N min/horas, por tenant com monitoringEnabled=true)
      │
      ├─ consulta sinais: FNRHRecord.snrhosAttempts>=5, Reservation.preCheckinSent pendente
      │  além do prazo, UazapiSetting.status != "connected", etc.
      │
      └─ se houver algo relevante → WhatsApp para o número de alerta do tenant
         (AIAgentSetting.alertPhone) com um resumo em linguagem natural
```

## Fases de implementação

### Fase A — Fundação de IA (pré-requisito de tudo)

1. `npm install ai` no workspace `apps/web` (e `apps/worker` se o agente de monitoramento rodar
   lá). Ler `node_modules/ai/docs/` para a API atual do `ToolLoopAgent` antes de codar — não usar
   de memória (skill `vercel:ai-sdk` já carregada nesta sessão).
2. Confirmar o model ID do Gemini 3.5 no AI Gateway (comando acima) e configurar a env var do
   Gateway (`AI_GATEWAY_API_KEY` ou equivalente — checar doc do Gateway na hora).
3. Novo model Prisma `AIAgentSetting` (por tenant, `@unique tenantId`, mesmo padrão de
   `UazapiSetting`/`SNRHosSetting`):
   - `enabled` (atendimento WhatsApp ligado/desligado)
   - `model` (string do Gateway, ex: `"google/gemini-3.5-..."`, editável por tenant)
   - `systemPromptExtra` (texto livre — o assinante pode adicionar instruções/tom de voz próprios)
   - `autoConfirmReservations` (Boolean, decisão já tomada acima)
   - `monitoringEnabled` + `alertPhone` (agente de monitoramento)
4. Biblioteca de tools **tenant-scoped por construção**: cada tool recebe o `tenantId` real
   resolvido no servidor (nunca aceito como argumento do modelo) — mesmo princípio já aplicado em
   toda a Fase FNRH (`reservation.room.tenantId`, nunca `reservation.tenantId`). Isso é a defesa
   contra o hóspede tentar, via prompt injection na própria mensagem do WhatsApp, fazer o agente
   vazar dado de outro tenant ou de outra reserva.
5. Ligar `AIUsageLog` de verdade: gravar `tokensInput`/`tokensOutput`/`totalCostUsd` a cada
   chamada; checar `Tenant.aiTokenQuota` (ou herdar de `SaaSPlan`) antes de chamar o modelo;
   bloquear com mensagem amigável ao hóspede quando a cota estourar (nunca expor "cota de IA
   estourada" ao hóspede — mensagem genérica de indisponibilidade temporária + escalar para
   humano).

### Fase B — Dados que faltam (pré-requisito para as tools responderem de verdade)

1. **Disponibilidade por período**: novo endpoint (ex: `GET /api/public-agent/availability` ou
   reaproveitar `api/reservations/rooms` com filtro de data) que, dado `checkIn`/`checkOut`,
   retorna quartos/categorias livres (sem reserva/hospedagem sobrepondo o período).
2. **Busca de reserva por telefone**: novo endpoint que localiza reservas ativas/futuras pelo
   telefone do hóspede (reaproveitar a lógica de `brazilPhoneVariants` já usada no webhook).
3. **Model `HotelService`** (por tenant): nome, descrição, preço opcional, horário de
   funcionamento — e conectar a tela `cadastros/servicos` (hoje mock) a esse model de verdade.
   Isso não é trabalho extra só para o agente — já era uma pendência registrada na Fase 5 do
   roadmap (PDV/Serviços ainda mockados).
4. **Horário de café da manhã / informações institucionais**: novo campo simples em `Tenant`
   (`breakfastHours String?`) ou, se crescer mais, um model `TenantInfo` (café, wifi, políticas de
   check-in/checkout, regras da casa) — usado tanto pelo agente quanto por uma futura tela
   pública do hotel.
5. **Fotos do hotel/quarto**: novo model `RoomCategoryPhoto` (ou array de URLs em
   `RoomCategory`) + bucket privado (ou público, já que é material de marketing) no Supabase
   Storage (`hotel-photos`, mesmo padrão do bucket `fnrh-signatures` já criado nesta sessão) e uma
   tela simples de upload em Cadastros > Categorias de Apartamento.
6. **Envio de imagem via uazapi**: nova função `sendUazapiImage` (ou parametrizar
   `send-reserva`/criar `send-media` genérico) usando `type: "image"` no `POST /send/media`.

### Fase C — Agente de Atendimento WhatsApp (o principal pedido do usuário)

1. No webhook (`api/uazapi/webhook/[tenantId]/route.ts`), depois de gravar a mensagem IN: se
   `AIAgentSetting.enabled` para o tenant e a conversa não estiver marcada como "assumida por um
   humano", invocar o agente.
2. **Memória de conversa**: usar as últimas N mensagens de `WhatsappMessage` daquele contato como
   histórico (já existe o dado, só precisa ser lido e formatado para o `ai` SDK).
3. Implementar as tools da Fase B como `tool()` do Vercel AI SDK (Zod schema para cada input).
4. **Guardrail de reserva**: a tool `create_reservation` lê `autoConfirmReservations` do tenant e
   decide o `status` (`CONFIRMED` vs `PRE_RESERVATION`) — nunca decidido pelo modelo.
5. **Escalonamento para humano**: se o agente não conseguir resolver, ou o hóspede pedir
   explicitamente para falar com alguém, ou a mensagem não passar por nenhuma tool com confiança
   — marcar a conversa para atendimento humano (reaproveitar o badge de "não lida" que já existe
   no Mapa de Quartos) em vez de inventar uma resposta.
6. Toggle "Atendimento por IA no WhatsApp" em Configurações, mesmo padrão visual das outras
   mensagens automáticas já existentes na tela.
7. No histórico de mensagens (`MensagensWhatsAppModal.tsx`), indicar visualmente quais respostas
   `OUT` vieram do agente (`WhatsappMessage` pode ganhar um campo `sentBy: "AI" | "HUMAN"`).

### Fase D — Agente de Monitoramento

1. Novo job no worker (`apps/worker/src/aiMonitor.ts`, mesmo padrão de `snrhosTransmit.ts`):
   roda a cada X minutos por tenant com `monitoringEnabled=true`, consulta os sinais já mapeados
   acima (FNRH travada, SNRHos falhando, uazapi desconectada) **sem precisar de LLM** para a
   detecção em si (são queries determinísticas) — o LLM entra só para **compor um resumo
   legível** quando há algo a reportar, e opcionalmente responder perguntas em linguagem natural
   do staff no futuro.
2. Alerta via WhatsApp para `AIAgentSetting.alertPhone` quando houver problema novo (evitar
   repetir o mesmo alerta a cada ciclo — guardar `lastAlertedAt` por tipo de problema).

### Fase E — UX Admin

1. Tela de configuração do agente (dentro de Configurações): liga/desliga atendimento, liga/desliga
   monitoramento, número de alerta, comportamento de reserva, prompt/persona customizável.
2. Indicador visual de mensagens respondidas por IA vs humano no histórico de conversa.
3. (Opcional, pode ficar para depois) Painel de uso/custo de IA por tenant, lendo `AIUsageLog` —
   ligado à telemetria que hoje é mock em `admin/ai-telemetry`.

## Ordem de implementação recomendada

1. Fase A completa (fundação) — sem isso nada mais funciona.
2. Fase B, itens 1 e 2 (disponibilidade + busca de reserva) — são os dois dados mais pedidos pelo
   hóspede e não dependem de nada além do banco já existente.
3. Primeira versão do agente (Fase C, só tools de leitura: disponibilidade, quartos, reserva
   existente) — já entrega valor e é testável de ponta a ponta sem risco de negócio (nada de
   escrita ainda).
4. Tool de criar reserva com o guardrail configurável.
5. Fase B restante (Serviços real, café da manhã, fotos) + tools correspondentes.
6. Fase D (monitoramento) — pode ser feita em paralelo a qualquer ponto depois da Fase A, já que
   não depende do agente de atendimento.
7. Fase E (UX admin).

## Riscos e decisões abertas para a próxima sessão

- Confirmar o ID exato do modelo Gemini no AI Gateway (comando na seção de decisões).
- Pagamento/sinal de reserva feita pelo bot: fica fora do escopo inicial (recepção cobra depois,
  igual reserva por telefone hoje) ou o bot já deve orientar/cobrar? Recomendo começar de fora do
  escopo — é uma superfície de risco financeiro maior, melhor validar o resto primeiro.
- Limite de custo/mensagens por conversa, para uma conversa "em loop" não estourar a cota de IA
  do tenant sozinha.
- Quem faz o upload inicial das fotos do hotel/quartos (a tela existe, mas alguém precisa
  fotografar e subir).
- Confirmar com o usuário se o histórico de `WhatsappMessage` (texto puro) é suficiente como
  memória de conversa, ou se vale a pena um resumo/state machine mais estruturado para fluxos
  longos (ex: coletar data de entrada → data de saída → categoria → confirmar, em várias
  mensagens).

## Verificação (a fazer a cada fase)

- Fase A: chamar o agente com um prompt de teste isolado (sem WhatsApp ainda) e confirmar que
  `AIUsageLog` grava tokens/custo corretamente e que a cota bloqueia quando esgotada.
- Fase B: testar cada endpoint novo isoladamente via `curl`/script (mesmo padrão usado nesta
  sessão para testar as rotas de FNRH).
- Fase C: enviar mensagens reais de um WhatsApp de teste para a instância uazapi do tenant demo e
  verificar a resposta, a criação de reserva com o status certo, e o escalonamento para humano
  quando aplicável.
- Fase D: forçar um `FNRHRecord` com `snrhosAttempts=5` de teste e confirmar que o alerta chega.

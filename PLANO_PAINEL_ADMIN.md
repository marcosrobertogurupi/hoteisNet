# Plano — Painel Admin da Plataforma SaaS (Hoteis.Net)

Documento de planejamento. Escopo: transformar o painel `/admin` (hoje quase todo mock) num
back-office real de operação do SaaS — gestão de assinantes, planos, financeiro (Asaas),
suporte com IA, comunicação e observabilidade.

---

## 1. O que um back-office de SaaS costuma ter (referência de mercado)

Levantamento das funções padrão de um painel de operação de SaaS multi-tenant, para não esquecer
nada no desenho. Marcado com o status atual no HoteisNet.

### 1.1. Gestão de contas / assinantes (tenant management)
- **CRUD da conta + provisionamento do ambiente** — criar o tenant já dispara a criação do ambiente
  (settings default, plano, primeiro admin, base de conhecimento vazia, sequências fiscais, etc.).
  → *Parcial: `Tenant` existe e é rico (= `Hotel.fic` do WinDev), mas não há fluxo de provisionamento;
  a tela `admin/tenants` é mock.*
- **Ciclo de vida com status** — `TRIAL → ACTIVE → OVERDUE → SUSPENDED → CANCELLED`.
  → *Enum `TenantStatus` já tem esses 5 estados, mas **nada no sistema respeita o status** — um tenant
  `SUSPENDED` continua logando e operando normalmente. Falta o "dente".*
- **Impersonation ("entrar como cliente")** para suporte, sempre com trilha de auditoria e banner
  de "você está impersonando". → *Não existe.*
- **Ações administrativas**: estender trial, trocar plano manualmente, aplicar feature flags/override
  por conta, suspender/reativar, cancelar, soft-delete + retenção, exclusão definitiva (LGPD).
  → *Só existe override de cota de CPF e de IA por tenant.*
- **Notas internas, tags, responsável (CSM), health score / risco de churn.** → *Não existe.*

### 1.2. Catálogo de planos (packaging)
- CRUD de planos com preço **por ciclo** (mensal / semestral / anual), limites (quartos, usuários,
  tokens de IA, consultas CPF/CNPJ), features incluídas, dias de trial.
- Add-ons / itens avulsos, cupons/descontos, preço promocional, *grandfathering* (manter preço
  antigo de quem já assina quando o preço de tabela muda).
  → *`SaaSPlan` existe mas só tem `priceMonthly` + `maxRooms`/`maxUsers`/`aiTokenQuota`. Sem ciclos,
  sem features, sem trial configurável, sem tela de CRUD.*

### 1.3. Financeiro / billing
- Integração com gateway de pagamento: criar cliente, **assinatura recorrente** por ciclo, cobrança
  (PIX / boleto / cartão), **webhooks** (pago, atrasado, estornado, chargeback).
- Faturas, histórico de pagamentos, próximas cobranças.
- **Régua de cobrança (dunning)**: atraso → aviso → 2º aviso → suspende ambiente; retry automático.
- Métricas: **MRR / ARR**, churn, LTV, ARPA, receita por plano, aging de inadimplência.
- Ações manuais: cobrança avulsa, baixa manual, crédito/desconto, reembolso, cancelar assinatura.
  → *Inexistente. `SaASSubscription` guarda `amount`/`nextBilling`/`active` mas nada gera cobrança.
  Sem modelo de fatura/pagamento. Sem Asaas.*

### 1.4. Usuários do próprio painel (equipe interna)
- RBAC com papéis (`usuario` / `admin` / `super_admin`), convite, **MFA/2FA**, log de acesso, revogação.
  → *`UserRole.SUPER_ADMIN` existe (User com `tenantId` nulo), mas é um papel único, sem subníveis,
  sem MFA, e as telas `/admin/**` **não checam** `SUPER_ADMIN` no middleware (qualquer sessão válida
  abre `/admin`; só as rotas `/api/admin/*` checam papel individualmente).*

### 1.5. Suporte ao assinante
- Fila de tickets, SLA, prioridade, categorias, histórico por conta, CSAT, macros.
- **Agente de IA com RAG** + **funil de escalonamento**: IA (por confiança) → humano N1 → especialista N2.
- Base de conhecimento versionada; "aprendizado" = vetorização das resoluções (pgvector).
  → *Modelos `SupportTicket` / `TicketMessage` / `SupportKnowledgeBase` existem. Tela `admin/support`
  é **mock** (dados fixos em React). O botão "Resolver & Vetorizar" só dispara um toast.*

### 1.6. Comunicação com assinantes
- Mensagem 1:1 e **em massa**, por WhatsApp / e-mail / in-app, com templates, agendamento e
  segmentação (por plano, status, inadimplência). Log de comunicações por conta.
- Broadcast de manutenção / changelog / **versão crítica obrigatória**.
  → *`AppReleaseControl` já força atualização de versão em todos os terminais. `uazapi.ts` só envia
  **texto e imagem** — falta áudio (PTT) e documento/anexo (PDF etc.). Sem tela de envio.*

### 1.7. Observabilidade — uso e custo
- Consumo de IA (tokens, custo USD) por tenant e por feature; cota × uso.
- **Egress do Supabase por tenant** (métrica que hoje só existe agregada no projeto inteiro).
- Créditos / consumo do Hub do Desenvolvedor (consultas CPF/CNPJ), custo, cota.
- Uso do produto: logins, quartos ativos, reservas/mês, adoção de features.
- **Alertas determinísticos** (sem gastar token de LLM): cota estourada, custo anômalo, instância
  WhatsApp caída, pagamento falho.
  → *`AIUsageLog` tem os dados reais de IA; a tela `admin/ai-telemetry` é mock. Egress por tenant é
  requisito registrado e ainda não feito. Sem alertas.*

### 1.8. Configuração global do sistema
- Status das chaves de API (AI Gateway, uazapi master, Hub do Desenvolvedor, Asaas, SMTP) — o painel
  **mostra só o status**, as chaves ficam em `env`/secret (regra 6 do CLAUDE.md).
- Temas do painel, feature flags globais, parâmetros de release.
  → *`admin/page.tsx` já tem uma aba "Configuração do Sistema" com uazapi, Hub e controle de release —
  mas mistura campos que deveriam ser `env` com estado de UI e valores hardcoded de exemplo.*

### 1.9. Auditoria & compliance
- Trilha de **toda** ação do painel: quem trocou o plano de quem, quem impersonou, quem enviou
  broadcast, quem deu baixa manual.
  → *`AuditLog` existe mas é **por tenant** — não há trilha global das ações do super admin.*

### 1.10. Dashboard executivo
- Visão única: MRR, contas ativas/trial/inadimplentes, novos no mês, churn, custo de IA/infra,
  tickets abertos, saúde das integrações.
  → *`admin/page.tsx` tem os cards, mas **todos os números são fixos no código**.*

---

## 2. Estado atual do código (resumo)

| Área | Modelo Prisma | Rota API | Tela | Situação |
|---|---|---|---|---|
| Assinantes | `Tenant` ✅ (rico) | `GET/PATCH /api/admin/tenants[/id]` (só cota CPF + IA) | `admin/page.tsx` aba + `admin/tenants` mock | 🟡 |
| Planos | `SaaSPlan` + `SaASSubscription` ✅ (básico) | — | — | 🔴 |
| Usuários do painel | `User` + `UserRole.SUPER_ADMIN` | `api/users` (multi-hotel) | `cadastros/usuarios` | 🟡 (sem subníveis/MFA) |
| Suporte | `SupportTicket`/`TicketMessage`/`SupportKnowledgeBase` ✅ | — | `admin/support` mock | 🔴 |
| Telemetria IA | `AIUsageLog` ✅ (dados reais) | — | `admin/ai-telemetry` mock | 🟡 |
| Prompt agente Atendimento/tenant | `AIAgentSetting.systemPromptExtra` ✅ | `PATCH /api/admin/tenants/[id]` ✅ | `admin/page.tsx` ✅ | 🟢 |
| Prompt agente Operacional/tenant | — (campo novo) | — | — | 🔴 (Fase 5) |
| Cota IA + bloqueio/tenant | `AIAgentSetting` ✅ | `PATCH /api/admin/tenants/[id]` ✅ | `admin/page.tsx` ✅ | 🟢 |
| Release crítico | `AppReleaseControl` ✅ | `/api/admin/release-control` ✅ | `admin/page.tsx` ✅ | 🟢 |
| Comunicação WhatsApp | `WhatsappMessage` ✅ | `lib/uazapi.ts` (texto+imagem) | — | 🟡 |
| Financeiro / Asaas | — | — | — | 🔴 |
| Auditoria global | — | — | — | 🔴 |

Gaps de segurança já identificados, a corrigir na Fase 0:
1. Middleware não restringe `/admin/**` a `SUPER_ADMIN`.
2. `TenantStatus` (`SUSPENDED`/`CANCELLED`/`OVERDUE`) não bloqueia login nem operação.
3. `admin/page.tsx` tem valores de exemplo que parecem tokens/URLs reais no código-fonte.

---

## 3. Plano por fases (cada fase é commitável e entregável isolada)

> ⚠️ **Orçamento**: isto é grande — 8 fases, integração nova com Asaas, RAG de suporte, extensão da
> lib de WhatsApp e instrumentação de egress. Não consigo ver sua cota semanal de tokens do Claude
> Code (só você vê, em `/usage`). Recomendo tratar cada fase como um projeto próprio e decidir a
> cada uma se seguimos. A ordem abaixo entrega valor cedo (cadastro real de assinante) e deixa o que
> é mais caro (Asaas, RAG) para depois.

### Fase 0 — Fundação e segurança do painel ✅ (em implementação)

Escopo enxuto, só backend/segurança — sem mexer em UI ainda (economia de tokens):
- Papéis `PLATFORM_ADMIN` / `PLATFORM_SUPPORT` no enum `UserRole` (D3), + helper `isPlatformRole`
  em `lib/sessionToken.ts`.
- Middleware: gate `/admin/**` (páginas) e `/api/admin/**` (API) para papel de plataforma
  (`SUPER_ADMIN` / `PLATFORM_ADMIN` / `PLATFORM_SUPPORT`).
- Helpers em `lib/auth.ts`: `requirePlatformRole` (qualquer papel de plataforma — visualização) e
  `requirePlatformAdmin` (`PLATFORM_ADMIN` / `SUPER_ADMIN` — edição), no padrão de `requireAdmin`.
- `getSessionUser`: rejeitar sessão cujo tenant esteja `SUSPENDED` / `CANCELLED` (assinante
  bloqueado não opera). `OVERDUE` continua operando (faixa de aviso vem numa fase de UI).
- Novo modelo `PlatformAuditLog` (sem `tenantId`) + migration com RLS habilitado (Segurança §11) +
  helper `lib/platformAudit.ts`.
- Rotas `/api/admin/tenants[/id]`: GET passa a aceitar qualquer papel de plataforma (view);
  PATCH exige `requirePlatformAdmin` (edição) e grava em `PlatformAuditLog`.

Deferido para a Fase 1 (quando a UI do painel é refeita): `/admin/login` separado com cookie
próprio (D4) e a limpeza do `admin/page.tsx` (tirar valores hardcoded, layout real **em tema claro**).

> **Tema do painel admin:** claro (light), fixo. O painel da plataforma não faz parte do sistema de
> temas do assinante. O mockup atual está todo em dark hardcoded e será refeito em claro. Sem skill
> claude.ai de tema; usar a skill de plugin `vercel:shadcn` no trabalho de UI.

### Fase 1 — Cadastro de assinante + provisionamento

**Fase 1a ✅ (08/09/2026) — backend:**
- `Tenant` ganhou `accessValidUntil` (data-limite "pago até" = `data_Reset` / `Hot_DTReset` do
  WinDev) e `internalNotes`. Demais campos (CNPJ, IE, Razão, Fantasia, endereço, telefone, e-mail,
  site, juros, regime, logo, plano) já existiam.
- `GET /api/admin/tenants` = lista real (busca `?q=`, filtro `?status=`, paginação, `_count`).
- `POST /api/admin/tenants` = criação + provisionamento transacional (`Tenant` + `SaASSubscription`
  + `AIAgentSetting` + 1º `TENANT_ADMIN` com senha temporária devolvida uma vez).
- `GET/PATCH /api/admin/tenants/[id]` = ficha completa + edição (inclui `status` para suspender/
  reativar/cancelar; CEP re-resolve cidade/UF via `lib/viaCep.ts`).
- `GET /api/admin/plans` = catálogo para o seletor de plano.
- 1º `SUPER_ADMIN` de plataforma semeado (`superadmin@hoteisnet.local`).

**Fase 1b ✅ (08/09/2026) — UI:** `admin/layout.tsx` refeito em tema claro fixo com nav real;
`admin/tenants/page.tsx` real (lista + busca + filtro + paginação + modais de cadastro/edição,
ViaCEP, senha temporária mostrada 1x). O projeto não usa shadcn/ui — reaproveitado o helper de
classes `cadastroUI(false)`. `admin/page.tsx`, `admin/ai-telemetry`, `admin/support` seguem mock
dark (convertidos nas fases seguintes).

**Fase 1c ✅ (08/09/2026):** sessão própria do painel (`lib/platformAuth.ts`, cookie
`hoteisnet_platform_session`), login em `/admin/login`, middleware gateando `/admin/**` e
`/api/admin/**` só por esse cookie (a sessão do app do hotel não abre mais o painel),
`getPlatformSession` com revalidação no banco. **Personificação** "entrar como assinante"
(`/api/admin/tenants/[id]/impersonate` + `/api/admin/impersonation/stop`), faixa
`ImpersonationBanner` no topo do app do assinante, tudo auditado em `PlatformAuditLog`.

**Fase 1 concluída.**

### Fase 2 — Catálogo de planos ✅ (08/09/2026)
- `SaaSPlan`: `priceSemiannual`/`priceAnnual` (opcionais, desconto embutido, pagamento único),
  `features` (lista), `trialDays`. `SaASSubscription`: `cycle` (`BillingCycle`).
- CRUD `/api/admin/plans` (+ `/[id]`), tela `admin/plans` em tema claro.
- Cadastro de assinante ganhou seletor de ciclo (só os ciclos com preço no plano); `amount`/
  `nextBilling`/`accessValidUntil` calculados do ciclo + `trialDays`.
- 3 planos semeados (Starter/Pro/Enterprise).
- **Pendente:** ligar `maxRooms`/`maxUsers` do plano ao enforcement nas rotas do app do assinante.

### Fase 3 — Asaas + financeiro (em andamento)
- **3a+3b ✅ (08/09/2026):** `lib/asaas.ts` (cliente REST direto), schema (`Tenant.asaasCustomerId`,
  `SaASSubscription.billingType`/`asaasSubscriptionId`/`asaasPaymentId`, modelo `SaaSInvoice`),
  `provisionBillingForTenant` no cadastro de assinante (mensal → assinatura recorrente Asaas;
  semestral/anual → cobrança única; degrada para "cobrança manual" sem chave/CNPJ),
  webhook `POST /api/asaas/webhook/[secret]` (segredo timing-safe, espelha faturas, estende
  `accessValidUntil` no pagamento, rebaixa status em atraso/chargeback, idempotente).
  Env prod: `ASAAS_API_KEY`, `ASAAS_BASE_URL=https://api.asaas.com/v3`, `ASAAS_WEBHOOK_SECRET`.
- **3c ✅ (08/09/2026):** régua de inadimplência — `apps/worker/src/saasDunning.ts` (cron 1×/h,
  determinístico): +15d de atraso → `OVERDUE` + aviso WhatsApp da plataforma (uma vez,
  `dunningStage`); +30d → `SUSPENDED`. Webhook do Asaas zera `dunningStage` no pagamento.
- **3d ✅ (08/09/2026):** tela `admin/billing` — cards MRR/ARR/inadimplência/renovações 30d,
  assinantes por status, tabela de faturas com baixa manual / cancelar / estornar, e cobrança
  avulsa (`POST /api/admin/tenants/[id]/invoices`). Rotas `GET /api/admin/billing`,
  `GET /api/admin/invoices`, `PATCH /api/admin/invoices/[id]`.

**Fase 3 concluída.**

### Fase 4 — Observabilidade e dashboards (em andamento)
- **4a ✅ (08/09/2026):** `admin/page.tsx` = dashboard real (tema claro, `GET /api/admin/dashboard`
  — MRR/ARR, assinantes por status, IA 30d por recurso, CPF, tickets, top-5 egress).
  **Egress por assinante:** `TenantEgressDaily` + `jsonForTenant` nas rotas de polling dos mapas
  + `egressMeter` (buffer em memória, flush 30s). `admin/settings` (tema claro) recolhe os
  controles reais que estavam no mock (cota CPF, IA por assinante, release crítico).
- **4b (a fazer):** `admin/ai-telemetry` real (por assinante + por recurso) e alertas
  determinísticos no worker (cota IA estourada, instância WhatsApp caída, pagamento falho).

Falta: Fase 5 (suporte IA), 6 (comunicação), 7 (config/equipe).

### Fase 2 — Catálogo de planos
- `SaaSPlan`: adicionar preço por ciclo já com o desconto embutido
  (`priceMonthly`/`priceSemiannual`/`priceAnnual`), `features Json`, `trialDays`, `active`. Manter
  `priceMonthly` durante a transição. Semestral/anual são pagamento único antecipado (D5).
- Tela CRUD de planos (só `SUPER_ADMIN`).
- Ligar os limites do plano aos pontos de enforcement que já existem (quartos, usuários, cota IA, cota CPF).

### Fase 3 — Financeiro + Asaas
- Integração Asaas (via Marketplace/SDK): criar cliente, assinatura recorrente por ciclo, cobrança
  PIX/boleto/cartão. Segredo em `env` (regra 6). Webhook `/api/asaas/webhook/[secret]` autenticado
  por segredo próprio + `timingSafeEqual` (regra 5).
- Modelos `SaaSInvoice` + `SaaSPayment` (+ RLS migration).
- Régua de cobrança (cron no `apps/worker`, checagem determinística — memória
  `background-agent-checks-must-be-token-free`): 15 dias de atraso → `OVERDUE` + aviso (WhatsApp +
  e-mail); 30 dias → `SUSPENDED`. A recorrência nativa do Asaas cuida do retry do pagamento; nosso
  cron só reflete o estado no `TenantStatus` e dispara os avisos.
- Tela Financeiro: MRR/ARR, inadimplência (aging), faturas por assinante, próximas cobranças,
  ações manuais (baixa, crédito, reembolso, cobrança avulsa, cancelar).

### Fase 4 — Observabilidade e dashboards
- Dashboard executivo real (substituir os números fixos).
- Telemetria de IA real por tenant/feature a partir de `AIUsageLog` — substitui `admin/ai-telemetry` mock.
- **Egress por tenant**: middleware/wrapper de resposta que soma bytes por `tenantId` num
  `TenantEgressDaily` (memória `admin-panel-tenant-data-volume-metric`). Não expor ao assinante.
- Consumo do Hub do Desenvolvedor consolidado (custo, uso, cota).
- Alertas determinísticos no worker: cota estourada, custo de IA anômalo, instância WhatsApp caída,
  pagamento falho — notificação para o super admin.

### Fase 5 — Suporte com IA + RAG + funil de escalonamento

**Gerenciamento de prompt dos agentes de IA por assinante (no painel admin):**
- Cada assinante tem prompt gerenciável para **os dois** agentes:
  - **Agente de Atendimento** — hoje já existe `AIAgentSetting.systemPromptExtra` (prompt cru de
    personalidade, usado em `lib/aiAgent/agent.ts`).
  - **Agente Operacional** — **campo novo** `AIAgentSetting.operationalSystemPromptExtra`
    (hoje `apps/worker/src/operationalAgent.ts` monta os prompts inline, sem persona configurável
    por tenant). Injetar esse extra nos prompts do worker.
- Tela no painel admin (uma seção por assinante, ou aba dedicada) mostrando os dois prompts lado a
  lado, com os **defaults do sistema** visíveis (read-only) + o **extra por assinante** (editável).
- Permissão (D3): papel `PLATFORM_SUPPORT` **só visualiza** os prompts; `PLATFORM_ADMIN` e
  `SUPER_ADMIN` **visualizam e editam**. O botão de salvar / os campos ficam desabilitados para
  `PLATFORM_SUPPORT`, e a rota `PATCH /api/admin/tenants/[id]` rejeita a edição desses campos vinda
  de `PLATFORM_SUPPORT` (não confiar só na UI).
- Toda edição de prompt registra em `PlatformAuditLog` (quem, quando, valor antes/depois).
- O assinante **nunca** vê nem edita o prompt cru na tela dele — continua só escolhendo presets de
  tom (memória `ai-agent-control-centralized-in-admin`).

**Suporte:**
- Conectar `admin/support` aos modelos reais (`SupportTicket`/`TicketMessage`).
- Canal de entrada: "Central de Ajuda" dentro do app do assinante (e opcionalmente WhatsApp).
- Agente de atendimento ao assinante — **Gemini via Vercel AI Gateway** (memória
  `ai-agent-uses-gemini-not-claude`), RAG sobre `SupportKnowledgeBase` + documentação do produto,
  controle de custo/chave centralizado no painel admin (memória `ai-agent-control-centralized-in-admin`).
- Funil: IA responde se confiança ≥ limite; abaixo disso escala para N1 humano; N1 pode escalar para
  N2 (especialista). SLA e prioridade por categoria.
- Vetorização real (pgvector) das resoluções aprovadas → aprendizado.

### Fase 6 — Comunicação com assinantes
- Estender `lib/uazapi.ts`: `sendUazapiAudio` (PTT) e `sendUazapiDocument` (PDF/qualquer anexo),
  além do texto/imagem que já há.
- Tela de envio: 1:1 (escolhe um usuário do assinante) e **em massa** com segmentação
  (plano / status / inadimplência). Templates + agendamento (cron do worker).
- Log de comunicações por assinante (reusar/expandir `WhatsappMessage` com escopo "plataforma→assinante").

### Fase 7 — Config global e equipe do painel
- Tela de configurações: **status** das integrações (AI Gateway, uazapi, Hub, Asaas, SMTP) lendo
  saúde real, sem expor as chaves; temas do painel; feature flags globais.
- CRUD de usuários do painel com subníveis (`usuario`/`admin`/`super_admin`), convite, **MFA/2FA**,
  log de acesso (`PlatformAuditLog`).

---

## 4. Decisões (fechadas com o usuário)

- **D1 — App:** painel admin no **mesmo Next.js** (`apps/web`, onde já está `/admin`).
- **D2 — Asaas:** **assinatura recorrente nativa do Asaas** — o Asaas gera e cobra sozinho; nós só
  reagimos aos webhooks.
- **D3 — Usuário do painel:** **reaproveitar `User`** com `tenantId` nulo, acrescentando papéis
  `PLATFORM_ADMIN` / `PLATFORM_SUPPORT` ao lado de `SUPER_ADMIN`. Regra geral de permissão no painel:
  `PLATFORM_SUPPORT` (papel "usuário") **visualiza**; `PLATFORM_ADMIN` e `SUPER_ADMIN`
  **visualizam e editam**. Aplica-se, entre outras coisas, ao gerenciamento de prompt dos agentes
  de IA por assinante (ver Fase 5).
- **D4 — Login do painel:** **`/admin/login` separado**, com cookie/sessão próprios (padrão dos apps
  satélite governança e contagem de estoque) — back-office isolado do app do assinante.
- **D5 — Ciclos semestral/anual:** **têm desconto** e são **pagamento único antecipado** (não
  parcelado) — o `SaaSPlan` guarda o preço de cada ciclo já com o desconto embutido; a assinatura
  recorrente no Asaas usa a periodicidade correspondente (SEMIANNUALLY / YEARLY).
- **D6 — Régua de inadimplência:** **15 dias** de atraso → aviso (WhatsApp + e-mail); **30 dias** →
  `SUSPENDED` (corte de acesso). Entre 15 e 30 o tenant fica `OVERDUE` e opera com faixa de aviso.

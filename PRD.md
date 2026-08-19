# Product Requirement Document (PRD) — Hoteis.Net PMS SaaS

**Versão:** 1.3.0
**Data:** 19 de Agosto de 2026
**Status:** Documento Oficial de Referência do Projeto — **atualizado a cada alteração relevante no sistema** (ver regra em `.agents/AGENTS.md`)

### Legenda de Status de Implementação
Cada funcionalidade abaixo é marcada com o status real observado no código-fonte, não apenas o planejado:
* ✅ **Implementado e funcional** — conectado ao banco de dados (Prisma/Supabase) ou a uma integração externa real, sem dados mockados.
* 🟡 **Protótipo de UI (mock)** — tela existe e é navegável, porém funciona com dados/estado local (hardcoded) e não está conectada a nenhuma API real. Viola a regra de "Proibição de Dados Mockados" e precisa ser finalizada.
* ⏳ **Planejado / não iniciado** — consta no roadmap ou na documentação, mas ainda não há código correspondente (nem tela, nem rota, nem modelo usado).

---

## 1. Visão Geral do Produto (Product Overview)

### 1.1. Propósito
O **Hoteis.Net PMS SaaS** é uma plataforma moderna de Gestão Hoteleira (Property Management System) baseada em nuvem, concebida para modernizar e substituir o sistema desktop legado desenvolvido em WinDev. O produto atende hotéis, pousadas, resorts e hospedagens de todos os portes com uma experiência de uso fluida, intuitiva, altamente performática e esteticamente impecável.

### 1.2. Principais Objetivos
1. **Migração & Modernização:** Transicionar todas as regras de negócio consolidadas do sistema WinDev desktop para uma arquitetura SaaS multi-tenant web-native.
2. **Eficiência Operacional:** Reduzir o tempo de atendimento na recepção com mapa visual interativo, check-in/out agilizado e pré-checkin digital via WhatsApp.
3. **Automação Inteligente:** Integrar comunicação ativa via WhatsApp (Uazapi API) e suporte automatizado por IA (RAG) para reduzir custos operacionais.
4. **Conformidade Legal:** Automatizar a geração e transmissão da FNRH (Ficha Nacional de Registro de Hóspedes) para o SNRHos (Ministério do Turismo).

### 1.3. Stack Tecnológico
* **Estrutura Monorepo:** Turborepo com workspaces (`apps/web`, `apps/api`, `packages/database`).
* **Frontend Web:** Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, Lucide Icons.
* **Backend API:** Rotas de API do Next.js (`apps/web/src/app/api/*`) sobre Prisma; existe também um workspace Express legado (`apps/api`) em migração.
* **Banco de Dados & ORM:** PostgreSQL / Supabase, Prisma ORM com suporte nativo a Multi-Tenancy. Algumas rotas legadas (`api/reservations/tariffs`) ainda acessam o Supabase diretamente em paralelo ao Prisma — pendência de unificação.
* **Integrações Externas:** Uazapi WhatsApp API ✅, Hub do Desenvolvedor (consulta de CPF/Receita Federal) ✅, SMTP via Nodemailer ✅, Ministério do Turismo (SNRHos) ⏳, OpenAI/Gemini para RAG ⏳.

---

## 2. Arquitetura Multi-Tenancy & Segurança

### 2.1. Isolamento de Dados por Tenant
Todas as entidades do banco de dados operacionais (apartamentos, categorias, reservas, check-ins, hóspedes, produtos, caixas, movimentações) contêm o campo obrigatório `tenantId`. O middleware de banco garante que nenhuma consulta cruze dados entre clientes SaaS distintos.

### 2.2. Autenticação e Sessão ✅
* Login por e-mail/senha validado contra `prisma.User` (senha com hash), com emissão de um JWT assinado (`jose`) armazenado em cookie de sessão `httpOnly`.
* Um segundo cookie, não-`httpOnly`, identifica o terminal/estação de atendimento para fins de auditoria (ex.: "RECEPÇÃO 01").
* `/api/auth/me` decodifica a sessão no servidor e retorna o usuário autenticado com uma flag `isAdmin`; `/api/auth/logout` limpa a sessão.
* Todo login/logout gera um registro em `AuditLog` com terminal e IP de origem.

### 2.3. Perfis de Usuários (User Roles)
* **`SUPER_ADMIN`:** Administrador geral da plataforma SaaS Hoteis.Net (gestão de tenants, planos, cotas de IA e cobrança).
* **`TENANT_ADMIN`:** Proprietário ou gerente geral do estabelecimento (acesso total às configurações, tarifários, relatórios e usuários do hotel).
* **`RECEPCIONIST`:** Operador da recepção (mapa de quartos, mapa de reservas, check-in, check-out, alteração de período, lançamentos de consumo e FNRH).
* **`GOVERNESS`:** Equipe de governança e limpeza (mudança de status de limpeza dos quartos, conferência de frigobar).
* **`FINANCIAL`:** Gestor financeiro (controle de caixa geral, contas a pagar/receber, conciliação e faturamento corporativo).

`SUPER_ADMIN` e `TENANT_ADMIN` são tratados como papéis administrativos (`isAdminRole`) para efeito de liberação de telas restritas.

---

## 3. Especificação das Funcionalidades (Feature Specifications)

### 3.1. Mapa Visual de Quartos (Room Map) ✅
* **Visão Geral em Grade:** Exibição dinâmica dos apartamentos agrupados por andares ou categorias com indicativos visuais em cores de alto contraste:
  * **Verde (`VACANT_CLEAN`):** Quarto livre e higienizado, pronto para ocupação.
  * **Amarelo/Laranja (`VACANT_DIRTY`):** Quarto vago aguardando higienização pela governança.
  * **Azul (`OCCUPIED`):** Quarto ocupado com hospedagem em andamento.
  * **Vermelho (`MAINTENANCE`):** Quarto em manutenção com data prevista de liberação.
* **Menu Contextual Dinâmico (Clique Rápido / Dropdown):**
  * Para quarto ocupado: Lançar Consumo, Alterar Período da Hospedagem, Mudar de Quarto, Visualizar Extrato da Conta, Realizar Check-out.
  * Para quarto sujo: Marcar como Limpo com 1 clique.
  * Para quarto em manutenção: Editar data de liberação ou colocar em limpeza.
  * Para quarto livre: Iniciar Check-in Avulso ou Efetuar Reserva Rápida.
* **Layout Otimizado:** Sidebar expansível/retrátil para maximizar o espaço de tela durante a operação de recepção.

### 3.2. Gestão de Reservas & Mapa em Grade (Reservation Grid) ✅
* **Grid de Reservas (Estilo Gantt / Linha do Tempo):** Visualização gráfica da ocupação dos quartos ao longo dos dias do mês.
* **Interatividade:** Duplo clique em células de datas para criar/editar reservas diretamente no mapa.
* **Prevenção de Overbooking:** Verificação automática em tempo real que bloqueia reservas conflitantes no mesmo apartamento.
* **Comunicação por WhatsApp ✅:** Envio de comprovante de reserva em PDF via Uazapi (`api/uazapi/send-reserva`), com fallback de servidor/token padrão embutido no código (pendência de segurança — mover para configuração por tenant).
* **Reservas Múltiplas em Lote ✅:** `api/reservations/batch` grava várias reservas de uma só vez dentro de uma única transação Prisma, equivalente ao botão "Salvar Reservas" da tela de Reservas Múltiplas do WinDev original — o usuário monta o lote em grade local e só é persistido no clique final; se qualquer reserva do lote colidir ou falhar, nenhuma é gravada.

### 3.3. Check-in, Hospedagem & Alteração de Período ✅
* **Entrada de Hóspedes (Check-in):** Vinculação do hóspede principal e acompanhantes, aplicação da tabela tarifária vigente e cálculo automático das diárias.
* **Modal de Alteração de Período (`AlterarPeriodoModal`):**
  * Bloqueio fixo da data de início (check-in já realizado).
  * Flexibilidade na prorrogação ou antecipação do check-out com ajuste automático do saldo devedor.
  * Checagem de colisão com reservas futuras para o mesmo apartamento.
  * **Persistência real ✅:** `api/stay/period` (PATCH) é a única fonte de verdade para `StayCheckin.expectedCheckOut` (e, se informado, a tarifa/nome da diária corrente) — alterar apenas a `Reservation` ou apenas o estado local do front não é suficiente, sob pena do Mapa de Quartos e da tela de check-out mostrarem a previsão antiga.
* **Diárias Extras por Virada Automática ✅:** `StayCheckin.extraDailiesCount` contabiliza separadamente, com fuso horário de Brasília, as diárias lançadas automaticamente pela virada (`api/stay/rollover`) além da previsão original de saída — equivalente a `hpd_qtddiariasextras` do sistema legado.
* **Ocupantes por Hospedagem ✅:** `StayCheckin.adults`/`children` registram a composição de hóspedes da diária.
* **Auditoria de Ciclo de Vida da Hospedagem ✅:** `StayCheckin` grava snapshots de quem fez o check-in, o check-out e quem operava o caixa no fechamento (`checkedInByUser*`, `checkedOutByUser*`, `closingOperator*` — equivalentes a `hpd_idusucheckin`/`hpd_idusucheckout`/`hpd_operadorfechou`). Os campos de cancelamento de hospedagem (`isCanceled`, `canceledAt`, `canceledByUser*`) já existem no schema, mas **ainda não há fluxo de UI que os grave** ⏳.
* **Totais Financeiros Consolidados ✅:** `totalAdvance`, `balanceDue` e `otherDebits` são recalculados a cada pagamento/fechamento e persistidos na própria hospedagem (equivalentes a `hpd_totaladiant`/`hpd_saldopagar`/`hpd_outrosdeb`), preservando o valor histórico mesmo após o encerramento.
* **Transferência de Débitos entre Quartos ✅:** `api/stay/transfer-debit` (POST) replica a tela `WIN_TRANSFERENCIADEBITO` do WinDev — move total ou parte do débito de uma hospedagem ativa para outra dentro de uma única transação: o quarto de origem recebe um pagamento com a forma "TRANSF.DEBITO" quitando o valor, e o quarto de destino recebe o mesmo valor incrementado em `otherDebits`. Todo movimento é auditável no novo modelo `StayDebitTransfer` (origem, destino, valor, operador, data), preservado mesmo após ambas as hospedagens encerrarem.

### 3.4. FNRH Eletrônica & SNRHos (Ministério do Turismo) ⏳
* **Status real:** apenas a intenção do produto. O modelo `FNRHRecord` existe no schema Prisma mas **não é referenciado em nenhum ponto do código**; não existe nenhuma rota de API relacionada a FNRH/SNRHos.
* O fluxo de **self check-in do hóspede** (`app/self-checkin/[id]/page.tsx`) é hoje um **protótipo de UI 🟡**: formulário de 3 etapas (dados → campos legais da FNRH → assinatura em tela) com dados de hóspede fixos ("Carlos Eduardo Silva"), ignora o parâmetro `[id]` da URL, simula a assinatura com um clique e exibe um protocolo SNRHos fictício ("GOV-894102") ao final. Nenhuma chamada de API é feita; nada é persistido nem enviado à recepção.
* **Pendente:** persistência real do FNRH, transmissão ao SNRHos, e conexão do wizard de self check-in aos dados reais da reserva/hóspede via `[id]`.

### 3.5. PDV (Ponto de Venda) & Estoque Multi-Local ✅ (parcialmente — ver ressalva)
* **Separação de Estoques (real, banco de dados):**
  * **Almoxarifado Geral:** Estoque central (`Product.generalStock`) com custo, preço de venda e alerta de estoque mínimo (`minStock`).
  * **Estoque de PDV (`POSLocation` / `POSProductStock`):** Estoques individualizados por ponto de venda. `/api/stock/pos-locations` semeia automaticamente 3 PDVs padrão por tenant no primeiro uso ("RESTAURANTE", "BAR RECEPCAO", "FRIGOBAR").
* **Transferência entre Almoxarifados ✅:** `/api/stock/transfer` move quantidade do almoxarifado central para o estoque fracionado de um PDV específico, registrando um `StockTransfer` auditável.
* **Lançamento de Consumo em Quarto ✅:** O fluxo real está em `LancarConsumoQuartoModal.tsx` (acionado a partir do mapa de quartos/hospedagem), não na página `app/consumption`. Busca produto por código de barras via `/api/stock/lookup`, permite escolher o PDV de origem e a quantidade, e grava via `/api/stay/consumo`, que dentro de uma transação de banco: debita o estoque do PDV (respeitando a flag `allowNegativeStock` por tenant) e cria uma cobrança `StayConsumption` somada ao total da hospedagem. O `DELETE` do mesmo endpoint estorna estoque e cobrança.
* **Ressalva 🟡:** `app/app/consumption/page.tsx` é uma **página duplicada e desconectada**, com carrinho e produtos mockados em estado local, sem nenhuma chamada de API — duplica (de forma não funcional) o que `LancarConsumoQuartoModal` já faz corretamente. Deve ser removida ou substituída por um atalho para o fluxo real.

### 3.6. Controle Financeiro, Frente de Caixa & Caixa Geral ✅
* **Caixa da Recepção (Turnos Operacionais):** `api/caixa/pagamento-checkin` abre automaticamente o caixa do operador se necessário, registra `CashTransaction`, recalcula o saldo devedor da hospedagem (diárias + consumo − pagamentos) e grava log de auditoria.
* **Caixa Obrigatório para Operar o Sistema ✅:** `CashRegisterGate` (montado no layout raiz de `/app`) bloqueia todo o aplicativo — nenhum usuário, incluindo `SUPER_ADMIN`/`TENANT_ADMIN`, consegue navegar em nenhuma rota sem ter um caixa próprio aberto (`api/caixa/sessao`). O operador ativo dos lançamentos de caixa é sincronizado com o usuário realmente logado (não mais um nome livre digitado), a partir do layout raiz.
* **Pagamento em Lote:** `api/caixa/pagamento-lote` replica o comportamento do WinDev legado ("Finalizar Hospedagem"), aplicando múltiplos lançamentos dentro de uma única transação atômica (`prisma.$transaction`), com rollback total em caso de item inválido.
* **Extrato da Conta:** `api/caixa/conta-quarto` lista os pagamentos já lançados contra a hospedagem e o total pago.
* **Estorno:** `api/caixa/remover-pagamento` remove um lançamento de `CashTransaction`.
* **Sangria com Plano de Contas ✅:** `api/caixa/sangria` agora vincula cada retirada a um `AccountPlan` (`CashTransaction.accountPlanId`), permitindo identificar no fechamento para onde foi cada retirada (pagamento de despesa, depósito no cofre etc.) em vez de um texto livre sem categoria.
* **Caixa Geral (visão consolidada, Admin) ✅:** tela `app/app/cash-register-geral` + `api/caixa/geral` (lista) e `api/caixa/geral/[id]` (detalhe/fechamento) dão a `SUPER_ADMIN`/`TENANT_ADMIN` uma visão de todos os caixas — abertos e fechados — de todos os operadores do tenant, com totais consolidados por meio de pagamento. `CaixaPrintPreview` gera a impressão do fechamento (própria tela de caixa e Caixa Geral compartilham o mesmo componente).
* **Faturamento Corporativo:** Gestão de contas a pagar/receber, emissão de faturas para empresas parceiras (`Company`) com limites de crédito e prazos personalizados — cadastro de empresas está implementado (ver 3.11); o módulo de faturamento corporativo consolidado (`CorporateInvoice`) ainda não foi verificado como conectado a telas de UI.

### 3.7. Governança e Manutenção ✅
* **Painel da Governança:** Painel exclusivo para camareiras e supervisão de governança ordenando os quartos por prioridade de limpeza pós check-out.
* **Controle de Manutenção:** Agendamento de reparos com bloqueio temporário de inventário de quartos.

### 3.8. Self Check-in & WhatsApp (Uazapi) ✅ (parcialmente — ver ressalvas)
* **Pre-Checkin Antecipado ⏳/🟡:** Wizard de UI existe (ver 3.4) mas ainda não está conectado a dados reais nem ao envio/recebimento via WhatsApp.
* **Gestão de Instância por Tenant ✅:** `UazapiSetting` foi reformulado para representar o ciclo de vida completo de uma instância uazapi própria do tenant (`serverUrl`, `adminToken`, `instanceId`/`instanceName`/`instanceToken`, `status` — disconnected/connecting/connected/hibernated —, `qrCodeUrl`, `pairCode`, `webhookUrl`), substituindo o modelo simplificado anterior. Rotas em `api/uazapi/instance/{connect,disconnect,status,link,webhook}` conectam/desconectam a instância, consultam status e recebem webhook — tela "Configuração do Sistema > API WhatsApp". O POST de `api/uazapi/instance/webhook` envia `enabled: true` explicitamente no payload para a uazapi — sem esse campo a uazapi salva o webhook desativado e nenhuma mensagem é entregue, mesmo com URL/eventos corretos.
* **Foto de Perfil do Contato ✅:** `api/uazapi/profile-picture` consulta `POST {serverUrl}/chat/details` da uazapi para exibir o avatar de WhatsApp do hóspede quando disponível.
* **Conversa Bidirecional com Webhook ✅:** `WhatsappMessage` (renomeado de `WhatsappSentMessage`) guarda tanto o que o hotel envia (resumo, consumo, extrato PDF, texto avulso — `direction: "OUT"`) quanto as respostas do hóspede (`direction: "IN"`, `read`), recebidas via `api/uazapi/webhook/[tenantId]`, que identifica a hospedagem em aberto pelo telefone do remetente comparando variantes com/sem o 9º dígito do celular (`brazilPhoneVariants`), já que o chatid entregue pela uazapi nem sempre usa o mesmo formato salvo no cadastro do hóspede. O payload real de entrega (`{EventType, message: {...}, chat: {...}}`) diverge do envelope genérico documentado na OpenAPI (`{event, instance, data}`) — confirmado testando com um receptor externo (webhook.site); o parser lê `body.message` como fonte primária. A tela "Mensagens WhatsApp" (`api/uazapi/messages` GET/POST/PATCH) faz polling da conversa e marca como lida ao abrir; enquanto fechada, o Mapa de Quartos mostra um badge de não lidas no card do quarto e toca um sinal sonoro configurável (Configurações > API WhatsApp) quando chega mensagem nova. O cabeçalho do modal (`MensagensWhatsAppModal`) é compacto em uma única linha (avatar, nome/quarto/datas/telefone e os três botões de envio — "Resumo hospedagem", "Consumo do quarto", "Extrato da hospedagem" — lado a lado), maximizando o espaço vertical da área de conversa.
* **Visualização de Anexos Recebidos ✅:** `WhatsappMessage` ganhou os campos `mediaUrl`/`mimeType`. A URL de mídia que vem no webhook (`data.content.URL`) é a URL criptografada original do WhatsApp (E2E) — não é utilizável diretamente num `<img>`/link. Por isso o webhook só grava o `mimeType` (metadado não criptografado, de `data.content.mimetype`); a URL pública já descriptografada é obtida sob demanda pela nova rota `api/uazapi/messages/download`, que chama `POST {serverUrl}/message/download` da uazapi passando o `messageid` e salva o resultado em `mediaUrl`/`mimeType` (retido por 2 dias no storage da uazapi, depois disso o próximo pedido rebaixa da CDN da Meta automaticamente). Na tela, cada mensagem de anexo mostra um botão "Ver anexo" — o download/descriptografia só é feito quando o operador clica (não automaticamente ao abrir a conversa), evitando chamadas desnecessárias à uazapi para anexos que ninguém vai abrir; para imagem o clique expande/recolhe um preview inline, para os demais tipos (documento, áudio, vídeo) abre o arquivo em nova aba.
* **Mensagens Automáticas Configuráveis ✅:** `WhatsappMessageSetting` (via `api/tenant/whatsapp-messages`) permite habilitar/customizar por tenant os textos de confirmação de reserva, boas-vindas no check-in, aviso de previsão de check-out e mensagem de check-out, com placeholders (`{HOTEL}`, `{HOSPEDE}`, `{QUARTO}`).
* **Envio de Extrato por WhatsApp ✅:** `api/uazapi/send-extrato` envia o extrato de consumo/hospedagem em PDF via Uazapi.
* **Dívida de segurança remanescente ⚠️:** `api/uazapi/send-reserva` e `api/uazapi/send-extrato` ainda usam fallback de servidor/token padrão embutido no código quando o tenant não tem instância própria configurada — deve ser removido (ver seção 4).
* **QR Code Expresso:** ⏳ não implementado.

### 3.9. Central de Ajuda & Suporte com Inteligência Artificial (RAG) 🟡
* **Status real:** `app/app/support/page.tsx` é um **mock de chat/ticket**, com tickets, histórico de mensagens e respostas de "IA" gerados por arrays estáticos e `setTimeout`, incluindo percentuais de "confiança" fabricados. Não existe nenhuma rota `/api/support/*`.
* Os modelos Prisma `SupportTicket`, `TicketMessage` e `SupportKnowledgeBase` existem no schema mas **não são referenciados em nenhum lugar do código de aplicação**.
* Não há embeddings, banco vetorial ou chamadas a LLM implementadas para esta funcionalidade.

### 3.10. Painel Administrativo da Plataforma (Super Admin) 🟡
* `admin/tenants`, `admin/ai-telemetry` e `admin/support` são **mocks de UI**: dados de tenants, consumo de IA/token e fila de suporte são arrays fixos em React state; nenhuma chamada de API é feita, e nenhum dos modelos `SaaSPlan`, `SaASSubscription` ou `AIUsageLog` é usado no código.
* O botão "Resolve & Vectorize RAG" em `admin/support` simula (via toast) uma vetorização no Supabase pgvector que não ocorre de fato.
* **Pendente:** conectar essas três telas aos modelos Prisma correspondentes para virarem um painel real de gestão SaaS.

### 3.11. Módulo Fiscal (NFe/NFSe) 🟡
* `app/app/fiscal/page.tsx` exibe uma lista fixa de notas "emitidas" em estado local; o botão "Emitir NFSe de Teste" apenas adiciona um objeto fictício com protocolo SEFAZ inventado — sem integração real com prefeitura/SEFAZ.
* `app/app/stock/nfe-import/page.tsx` simula a importação de XML de NFe com um `setTimeout` que popula uma tabela "De-Para" de produtos com dados fixos; a confirmação não grava nada em estoque ou contas a pagar.
* Não existem rotas `/api/*fiscal*` ou `/api/*nfe*`. **Módulo inteiro pendente de implementação real.**

### 3.12. Cadastros / Dados Mestres (Master Data)
Telas existentes em `app/app/cadastros/*`, com status de integração real:
* ✅ **Conectados ao backend (CRUD real):** Apartamentos, Empresas, Fornecedores, Hóspedes, Usuários, Plano de Contas.
* **Usuários — visão multi-hotel para Super Admin ✅:** `SUPER_ADMIN` enxerga e gerencia usuários de todos os hotéis (com filtro/seleção do tenant de destino ao criar); `TENANT_ADMIN` continua restrito aos usuários do próprio hotel e não pode criar, promover ou alterar um `SUPER_ADMIN` (proteção contra elevação de privilégio em `api/users`).
* 🟡 **Somente UI, sem persistência (pendentes de conexão):** Bancos, Colaboradores, Comandas, Formas de Pagamento, Grupos, Localidades, PDV, Pratos, Serviços.
* **Tarifas ⚠️:** existem **dois caminhos de leitura paralelos e inconsistentes** — `/api/tariffs` lê a tabela `Tariff` via Prisma; `/api/reservations/tariffs` lê uma tabela `tariffs` via cliente Supabase direto (não Prisma). A tela `app/app/tariffs/page.tsx`, por sua vez, não chama nenhuma das duas — usa `CadastroTarifasModal` com uma constante `INITIAL_TARIFFS` fixa. **Pendente:** unificar em uma única fonte de dados (Prisma) e conectar a tela real à API.

### 3.13. Integração de E-mail ✅
* `api/email/send` monta e-mails HTML (voucher, recibo, confirmação de pagamento) com anexo PDF opcional em base64, via `nodemailer`/SMTP, usando credenciais informadas pelo chamador (padrão `smtp.gmail.com` quando não especificado).
* `api/email/test` valida a conexão SMTP (`transporter.verify()`) e envia um e-mail de teste.
* A tabela `EmailSetting` existe no schema mas ainda não foi confirmada como fonte das credenciais nessas rotas — hoje elas dependem do chamador enviar host/usuário/senha a cada chamada.

### 3.14. Consulta de CPF (Hub do Desenvolvedor) ✅
* `api/stay/hub-consult-cpf` integra com a API paga do "Hub do Desenvolvedor" (`ws.hubdodesenvolvedor.com.br`) para resolver CPF em dados da Receita Federal (nome, nascimento, filiação, endereço, telefones, e-mails), agilizando o cadastro do hóspede.
* **Pendências de segurança/robustez:** há um token/contrato padrão **embutido no código-fonte** (`DEFAULT_HUB_TOKEN`/`DEFAULT_HUB_CONTRACT`) usado quando a variável de ambiente não está configurada — deve ser removido do código. O controle de cota por tenant é mantido em **memória do processo** (`TENANT_USAGE_STORE`), sendo perdido a cada reinício/deploy — precisa ser persistido no banco.

### 3.15. Dashboard Operacional ✅
* `api/dashboard/metrics` calcula, com fuso de Brasília: ocupação atual (quartos ocupados/vagos, taxa de ocupação), chegadas e saídas do dia, série histórica de ocupação x vacância dos últimos 15 dias (a partir dos snapshots horários de `RoomOccupancySnapshot`) e ranking dos quartos mais/menos ocupados nos últimos 30 dias. Métricas operacionais, não financeiras.

### 3.16. Relatórios Operacionais ✅
* `api/relatorios/quartos-ocupados`: lista quartos ocupados no momento com soma de pessoas hospedadas (hóspede principal + acompanhantes), usado para dimensionar o café da manhã.
* `api/relatorios/quartos-limpeza`: lista quartos pendentes de higienização para a governança.
* `api/relatorios/reservas-por-periodo`: lista reservas dentro de um intervalo de datas.
* Os PDFs gerados a partir desses relatórios têm exemplos de referência em `Exemplo de impressao/*.pdf` na raiz do projeto.

---

## 4. Requisitos Não-Funcionais

1. **Estética & Experiência do Usuário (UX/UI):** Interface extremamente atraente, moderna e intuitiva, seguindo princípios de Glassmorphism, paleta de cores elegantes em modo escuro/claro, tipografia limpa (Inter/Outfit) e micro-interações responsivas.
2. **Desempenho & Baixa Latência:** Renderização rápida de componentes de grade e mapa de quartos sem engasgos, com queries de banco indexadas e caching inteligente no Next.js.
3. **Disponibilidade & Escalabilidade:** Arquitetura desacoplada em nuvem pronta para suportar múltiplos hotéis em regime SaaS 24/7.
4. **Segurança & Privacidade:** Criptografia HTTPS/TLS, autenticação segura, isolamento estrito de dados entre hotéis e conformidade com a LGPD.
5. **Dívida técnica de segurança identificada (a corrigir):**
   * Credenciais padrão (token Uazapi e token/contrato do Hub do Desenvolvedor) embutidas como fallback no código-fonte — devem ser removidas e exigidas via variável de ambiente/configuração por tenant.
   * Controle de cota de consulta de CPF em memória de processo, não durável — deve migrar para persistência em banco.
   * Duas fontes de dados paralelas para tarifas (Prisma vs. Supabase direto) — risco de inconsistência, deve ser unificado.

---

## 5. Próximos Passos de Desenvolvimento (Roadmap)

* [x] **Fase 1:** Estrutura base Multi-tenant, Schema do Banco de Dados Prisma e Autenticação.
* [x] **Fase 2:** Mapa de Quartos (Room Map), Status de Governança e Ações Contextuais.
* [x] **Fase 3:** Mapa de Reservas em Grade, Duplo clique e Validação de Conflitos.
* [x] **Fase 4:** Modal de Alteração de Período de Hospedagem e Recálculo Tarifário.
* [~] **Fase 5:** Fluxo Completo de Consumo PDV e Transferência de Estoque — **núcleo funcional implementado** (transferência de estoque, lançamento de consumo em quarto via `LancarConsumoQuartoModal`/`api/stay/consumo`); pendente remover a página mock `app/consumption` e concluir os cadastros de PDV/produtos ainda não conectados (Pratos, Serviços, PDV).
* [ ] **Fase 6:** Integração com Transmissão Automática SNRHos (FNRH Eletrônica) — não iniciada; self check-in hoje é apenas protótipo de UI sem persistência.
* [ ] **Fase 7:** Módulo Completo de Faturamento Corporativo e Contas a Receber Faturadas — cadastro de Empresas pronto; emissão/consolidação de faturas (`CorporateInvoice`) ainda não conectada a UI.
* [ ] **Fase 8 (nova):** Sair do estágio de protótipo de UI para as telas de Fiscal/NFe, Painel Super Admin (tenants/telemetria IA/suporte) e Central de Ajuda com IA — hoje totalmente mockadas, sem nenhuma chamada de API.
* [ ] **Fase 9 (nova):** Unificar acesso a dados de Tarifas (eliminar rota paralela via Supabase) e migrar configuração de e-mail/WhatsApp para as tabelas `EmailSetting`/`UazapiSetting` por tenant, removendo credenciais padrão embutidas no código.
* [x] **Fase 10 (nova):** Transferência de Débitos entre Quartos (`api/stay/transfer-debit` + `StayDebitTransfer`), Reservas Múltiplas em Lote (`api/reservations/batch`), Dashboard Operacional (`api/dashboard/metrics`) e Relatórios de Governança/Café da Manhã/Reservas por Período (`api/relatorios/*`) — implementados e conectados ao banco.
* [~] **Fase 11 (nova):** Reformulação da Integração WhatsApp (Uazapi) — gestão completa de instância por tenant (`api/uazapi/instance/*`, incluindo vincular instância já existente), conversa bidirecional via webhook com histórico (`WhatsappMessage`), badge de não lidas + som configurável no Mapa de Quartos e mensagens automáticas configuráveis (`WhatsappMessageSetting`) já implementados; pendente remover o fallback de credencial padrão embutida no código em `send-reserva`/`send-extrato`/`send-text` para tenants sem instância própria configurada.
* [ ] **Fase 12 (nova):** Implementar fluxo de UI para cancelamento de hospedagem (`StayCheckin.isCanceled`/`canceledAt`/`canceledByUser*`), campos já existentes no schema mas ainda não gravados por nenhuma tela.
* [x] **Fase 13 (nova):** Caixa obrigatório para operar o sistema (`CashRegisterGate`), Caixa Geral consolidado para Admin (`app/cash-register-geral` + `api/caixa/geral`), sangria vinculada a plano de contas e gestão de usuários multi-hotel para `SUPER_ADMIN` — implementados e conectados ao banco.

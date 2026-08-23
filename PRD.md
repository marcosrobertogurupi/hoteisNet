# Product Requirement Document (PRD) — Hoteis.Net PMS SaaS

**Versão:** 1.5.0
**Data:** 20 de Agosto de 2026
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
  * **Data mínima de saída ✅:** a Dt.Saída nunca pode ser anterior a hoje e, quando o horário de virada de diária configurado em Configurações já passou no dia corrente, fica travada na data da última diária já lançada na conta (que não pode ser "desfeita" reduzindo o período) — o modal chama `api/stay/rollover` ao abrir para garantir que essa diária esteja em dia antes de calcular o limite, em vez de depender só do polling de 60s do Mapa de Quartos. A UI segue o tema claro/escuro escolhido em Configurações (antes usava cores fixas, fora do padrão do restante do app).
* **Celebração de Check-in/Despedida no Check-out ✅:** `CheckinCelebrationOverlay` e `CheckoutFarewellOverlay` exibem uma animação de boas-vindas/despedida (com nome do hóspede/número do quarto) ao concluir o check-in ou o check-out pelo Mapa de Quartos, substituindo o retorno seco de um toast de sucesso.
* **Diárias Extras por Virada Automática ✅:** `StayCheckin.extraDailiesCount` contabiliza separadamente, com fuso horário de Brasília, as diárias lançadas automaticamente pela virada (`api/stay/rollover`) além da previsão original de saída — equivalente a `hpd_qtddiariasextras` do sistema legado.
* **Ocupantes por Hospedagem ✅:** `StayCheckin.adults`/`children` registram a composição de hóspedes da diária.
* **Auditoria de Ciclo de Vida da Hospedagem ✅:** `StayCheckin` grava snapshots de quem fez o check-in, o check-out e quem operava o caixa no fechamento (`checkedInByUser*`, `checkedOutByUser*`, `closingOperator*` — equivalentes a `hpd_idusucheckin`/`hpd_idusucheckout`/`hpd_operadorfechou`). Os campos de cancelamento de hospedagem (`isCanceled`, `canceledAt`, `canceledByUser*`) já existem no schema, mas **ainda não há fluxo de UI que os grave** ⏳.
* **Totais Financeiros Consolidados ✅:** `totalAdvance`, `balanceDue` e `otherDebits` são recalculados a cada pagamento/fechamento e persistidos na própria hospedagem (equivalentes a `hpd_totaladiant`/`hpd_saldopagar`/`hpd_outrosdeb`), preservando o valor histórico mesmo após o encerramento.
* **Transferência de Débitos entre Quartos ✅:** `api/stay/transfer-debit` (POST) replica a tela `WIN_TRANSFERENCIADEBITO` do WinDev — move total ou parte do débito de uma hospedagem ativa para outra dentro de uma única transação: o quarto de origem recebe um pagamento com a forma "TRANSF.DEBITO" quitando o valor, e o quarto de destino recebe o mesmo valor incrementado em `otherDebits`. Todo movimento é auditável no novo modelo `StayDebitTransfer` (origem, destino, valor, operador, data), preservado mesmo após ambas as hospedagens encerrarem.

### 3.4. FNRH Eletrônica & SNRHos (Ministério do Turismo) 🟡
* **Pré-check-in digital do hóspede ✅ (dados) / transmissão ao governo ⏳:** o hóspede recebe um link único (`self-checkin/[token]`) por WhatsApp poucas horas antes do check-in (`WhatsappMessageSetting.preCheckinFnrh*`, disparado automaticamente pelo worker `apps/worker/src/preCheckinFnrh.ts` ou manualmente pelo botão "Disparar Wpp Uazapi"/"Reenviar Link" na Grade de Reservas), preenche seus dados (incluindo os campos de FNRH: RG/órgão expedidor, nacionalidade, raça/cor, profissão, motivo da viagem, meio de transporte, procedência/destino) e assina eletronicamente em um canvas touch real. Tudo é persistido via `POST /api/public/pre-checkin/[token]` em `Guest`/`FNRHRecord` (model já existente no schema, agora efetivamente usado e vinculado à `Reservation` via `FNRHRecord.reservationId`), com a assinatura salva em bucket privado do Supabase Storage (`fnrh-signatures`). O token de acesso (`PreCheckinLink`) é opaco, expira e é revogado/reemitido a cada reenvio.
* **Transmissão eletrônica ao SNRHos (Ministério do Turismo/Serpro) 🟡:** cliente e job construídos a partir da leitura integral do manual técnico oficial da API v2 (extraído via `pdftotext`, já que a análise automática de PDF não estava disponível), mas **ainda não testados contra credenciais reais** — o tenant só transmite se `SNRHosSetting.enabled = true` (desligado por padrão). Descobertas-chave do manual que mudaram o desenho original: a integração não é um "envio em lote depois do check-out", é um modelo Pessoa→Reserva→Hóspede com endpoint único `POST /hospedagem/registrar` (cria reserva + registra hóspedes numa chamada, retornando `link_precheckin` — um link de pré-check-in gerado pelo próprio governo, hospedado em `hom-lowcode.serpro.gov.br`); autenticação é **HTTP Basic Auth** (usuário/chave gerados no portal `fnrh.turismo.serpro.gov.br/FNRH_SRH` → "Chave das API's"), não uma API key simples, mais um header `cpf_solicitante` obrigatório em várias chamadas. URLs: produção `https://fnrh.turismo.serpro.gov.br/FNRH_API/rest/v2`, homologação `https://hom-lowcode.serpro.gov.br/FNRH_API/rest/v2`. Implementado: model `SNRHosSetting` por tenant (ambiente, usuário/chave, CPF do responsável, habilitado) com tela em Configurações; `apps/web/src/lib/snrhosClient.ts` e o job `apps/worker/src/snrhosTransmit.ts` (roda a cada 5 min, transmite `FNRHRecord`s pendentes de tenants habilitados, grava `snrhosReservaId/HospedeId/PessoaId` ou `snrhosLastError`, para após 5 tentativas). Testado de ponta a ponta com `fetch` mockado (payload e headers batem com o manual) — falta validar contra o ambiente de homologação real assim que o usuário obtiver as credenciais. `cidade_id` (código IBGE do município) é resolvido em tempo real via a tabela `Municipality` (ver seção 3.6) buscando por nome+UF; fica `0` só se o nome digitado pelo hóspede não bater com nenhum município conhecido. Campos `Guest.nationality`/`raceColor`/`disability` e `FNRHRecord.travelReason`/`transportMode` já usam os códigos exatos dos domínios oficiais do SNRHos (`GET /dominios/...`), sem camada de tradução.
* **Login gov.br/OAuth** para assinatura do hóspede (recomendado pelo Ministério do Turismo, dispensa assinatura touch) fica registrado como melhoria futura, não implementado — a assinatura hoje é touch simples.

### 3.6. Cadastro de Municípios (IBGE) ✅
* **Importado do sistema legado:** a tabela `CidadesNet` do WinDev (`PROJETO WINDEV/BANCO/HoteisBD/CidadesNet.fic`) é um arquivo binário HyperFileSQL Classic sem ferramenta de exportação disponível neste ambiente. Os 5.570 municípios (nome, código IBGE, UF, DDD) foram extraídos por engenharia reversa do layout de registro (tamanho fixo de 135 bytes, deslocamentos de campo determinados a partir do arquivo de análise `HoteisBD.xdd` e validados byte a byte contra códigos IBGE reais conhecidos — ex: São Paulo 3550308, Rio de Janeiro 3304557, todos batendo exatamente) e importados via `packages/database/scripts/import-municipalities.js`. Nomes foram normalizados para maiúsculas (a fonte legada tem uma inconsistência de encoding em ~25% dos registros onde só a letra acentuada fica em minúscula, ex: "SãO PAULO").
* **Model `Municipality`:** tabela de referência **global**, não isolada por `tenantId` — ao contrário de todos os demais cadastros do sistema — porque o código IBGE de um município é sempre o mesmo independente do assinante (decisão confirmada com o usuário).
* **Tela:** `/app/cadastros/localidades` ("Cidades, Estados & Países" no menu de Cadastros) — antes um protótipo com 4 linhas fixas, agora funcional: busca por nome/UF/código IBGE com paginação (50/página, 112 páginas), e incluir/editar/excluir restritos a `TENANT_ADMIN`/`SUPER_ADMIN` (`requireAdmin`) via `/api/cadastros/municipios` e `/api/cadastros/municipios/[id]`, já que afeta a lista compartilhada por todos os assinantes. Usuários não-admin só consultam.
* **Uso:** resolve o campo `cidade_id` (código IBGE) exigido pela API do SNRHos — ver seção 3.4.

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
* **Formas de Pagamento com Regras de Negócio ✅:** `PaymentMethod` (`api/cadastros/formas-pagamento`, tela em Cadastros) define, por forma cadastrada, quatro flags que mudam o que acontece ao lançar um pagamento — `installment` (Parcelamento: o valor vai para Contas a Receber em vez de quitar em caixa), `debitGuestBalance` (Debitar Saldo Hóspede: consome o saldo credor do hóspede em vez de dinheiro novo), `transferDebit` (a forma só pode ser usada pela Transferência de Débito entre Quartos, nunca por um lançamento normal) e `sumsToCashRegister` (Soma Caixa x Conta Corrente: se o valor entra ou não nos totais físicos do turno). Toda essa lógica está centralizada em `apps/web/src/lib/paymentProcessing.ts` (`processPaymentLine`), ponto único usado por check-in (adiantamentos), `pagamento-lote` e `pagamento-checkin` — evita que as três rotas implementem a regra de forma divergente. `CashTransaction` ganhou `countsInCashTotal` (denormalizado de `sumsToCashRegister` na criação) e `hiddenFromCashLog` (usado só pela Transferência de Débito, cujo lançamento de baixa na origem não é dinheiro real e por isso fica fora da lista de movimentações do turno, não só fora do total).
* **Saldo do Hóspede (Conta Corrente) ✅:** `Guest.balance` é o saldo consolidado; `GuestBalanceEntry` é o ledger auditável (crédito/débito, forma de pagamento, operador, hospedagem de origem) que o compõe — equivalente ao `HospedeNetMov` do sistema legado. Todo pagamento normal credita automaticamente o saldo do hóspede; formas com `debitGuestBalance` debitam esse saldo (bloqueando o lançamento se o saldo for insuficiente). Tela `app/app/cadastros/saldo-hospede` + `api/cadastros/saldo-hospede` permite buscar um hóspede por nome/CPF e consultar seu saldo atual e extrato completo.
* **Contas a Receber ✅:** `AccountsReceivable` (título vinculado a uma hospedagem, hóspede ou empresa) é criado automaticamente por `processPaymentLine` quando a forma de pagamento tem `installment` ativo, com vencimento padrão de 30 dias. Tela `app/app/cadastros/contas-receber` + `api/cadastros/contas-receber` lista títulos em aberto/pagos; `api/cadastros/contas-receber/baixa` registra baixa total ou parcial (com juros/desconto) em `ReceivableSettlement`, marcando `isPaid=true` quando o saldo devedor zera — equivalente à aba "Baixa" do `Win_ContasReceber` original.
* **Contas a Pagar ✅:** `AccountsPayable` (título vinculado a um Fornecedor, com Plano de Contas de despesa) e `PayableSettlement` seguem a mesma estrutura de Contas a Receber. Tela `app/app/cadastros/contas-pagar` + `api/cadastros/contas-pagar` (listagem) e `api/cadastros/contas-pagar/baixa` (quitação total/parcial com juros/desconto) — equivalente a `Win_ContasPagar`/`Win_GerarContasPagar` do sistema legado.

### 3.7. Governança e Manutenção ✅ (parcialmente — ver ressalva)
* **Painel da Governança:** Painel exclusivo para camareiras e supervisão de governança ordenando os quartos por prioridade de limpeza pós check-out.
* **Controle de Manutenção:** Agendamento de reparos com bloqueio temporário de inventário de quartos.
* 🟡 **Em desenvolvimento — atribuição de tarefas de limpeza:** novos models `Housekeeper`, `HousekeepingTask` e `HousekeepingSetting` no schema; `api/tenant/housekeeping-settings` (GET/PATCH) já persiste o modo de atribuição por tenant (`RECEPTION` — a recepção atribui manualmente — ou `QUEUE` — fila geral que qualquer camareira pode assumir). Ainda não há UI nem rotas conectadas aos models `Housekeeper`/`HousekeepingTask` em si.

### 3.8. Self Check-in & WhatsApp (Uazapi) ✅ (parcialmente — ver ressalvas)
* **Pre-Checkin Antecipado ⏳/🟡:** Wizard de UI existe (ver 3.4) mas ainda não está conectado a dados reais nem ao envio/recebimento via WhatsApp.
* **Gestão de Instância por Tenant ✅:** `UazapiSetting` foi reformulado para representar o ciclo de vida completo de uma instância uazapi própria do tenant (`serverUrl`, `adminToken`, `instanceId`/`instanceName`/`instanceToken`, `status` — disconnected/connecting/connected/hibernated —, `qrCodeUrl`, `pairCode`, `webhookUrl`), substituindo o modelo simplificado anterior. Rotas em `api/uazapi/instance/{connect,disconnect,status,link,webhook}` conectam/desconectam a instância, consultam status e recebem webhook — tela "Configuração do Sistema > API WhatsApp". O POST de `api/uazapi/instance/webhook` envia `enabled: true` explicitamente no payload para a uazapi — sem esse campo a uazapi salva o webhook desativado e nenhuma mensagem é entregue, mesmo com URL/eventos corretos.
* **Foto de Perfil do Contato ✅:** `api/uazapi/profile-picture` consulta `POST {serverUrl}/chat/details` da uazapi para exibir o avatar de WhatsApp do hóspede quando disponível.
* **Conversa Bidirecional com Webhook ✅:** `WhatsappMessage` (renomeado de `WhatsappSentMessage`) guarda tanto o que o hotel envia (resumo, consumo, extrato PDF, texto avulso — `direction: "OUT"`) quanto as respostas do hóspede (`direction: "IN"`, `read`), recebidas via `api/uazapi/webhook/[tenantId]`, que identifica a hospedagem em aberto pelo telefone do remetente comparando variantes com/sem o 9º dígito do celular (`brazilPhoneVariants`), já que o chatid entregue pela uazapi nem sempre usa o mesmo formato salvo no cadastro do hóspede. O payload real de entrega (`{EventType, message: {...}, chat: {...}}`) diverge do envelope genérico documentado na OpenAPI (`{event, instance, data}`) — confirmado testando com um receptor externo (webhook.site); o parser lê `body.message` como fonte primária. A tela "Mensagens WhatsApp" (`api/uazapi/messages` GET/POST/PATCH) faz polling da conversa e marca como lida ao abrir; enquanto fechada, o Mapa de Quartos mostra um badge de não lidas no card do quarto e toca um sinal sonoro configurável (Configurações > API WhatsApp) quando chega mensagem nova. O cabeçalho do modal (`MensagensWhatsAppModal`) é compacto em uma única linha (avatar, nome/quarto/datas/telefone e os três botões de envio — "Resumo hospedagem", "Consumo do quarto", "Extrato da hospedagem" — lado a lado), maximizando o espaço vertical da área de conversa.
* **Visualização de Anexos Recebidos ✅:** `WhatsappMessage` ganhou os campos `mediaUrl`/`mimeType`. A URL de mídia que vem no webhook (`data.content.URL`) é a URL criptografada original do WhatsApp (E2E) — não é utilizável diretamente num `<img>`/link. Por isso o webhook só grava o `mimeType` (metadado não criptografado, de `data.content.mimetype`); a URL pública já descriptografada é obtida sob demanda pela nova rota `api/uazapi/messages/download`, que chama `POST {serverUrl}/message/download` da uazapi passando o `messageid` e salva o resultado em `mediaUrl`/`mimeType` (retido por 2 dias no storage da uazapi, depois disso o próximo pedido rebaixa da CDN da Meta automaticamente). Na tela, cada mensagem de anexo mostra um botão "Ver anexo" — o download/descriptografia só é feito quando o operador clica (não automaticamente ao abrir a conversa), evitando chamadas desnecessárias à uazapi para anexos que ninguém vai abrir; para imagem o clique expande/recolhe um preview inline, para os demais tipos (documento, áudio, vídeo) abre o arquivo em nova aba. O auto-scroll para o fim da conversa só dispara ao abrir a janela e enquanto o operador estiver com a rolagem perto do fim (acompanhando mensagens novas) — se ele subir a tela para ler o histórico antigo, o polling de 4s não força a volta pro fim.
* **Mensagens Automáticas Configuráveis ✅:** `WhatsappMessageSetting` (via `api/tenant/whatsapp-messages`) permite habilitar/customizar por tenant os textos de confirmação de reserva, boas-vindas no check-in, aviso de previsão de check-out e mensagem de check-out, com placeholders (`{HOTEL}`, `{HOSPEDE}`, `{QUARTO}`).
* **Envio de Extrato por WhatsApp ✅:** `api/uazapi/send-extrato` envia o extrato de consumo/hospedagem em PDF via Uazapi.
* **Resiliência a Instância Fora do Ar ✅:** `fetchUazapi` (em `lib/uazapiInstance.ts`) envolve as chamadas à instância uazapi com timeout de 15s e converte falhas de rede em `UazapiUnreachableError`; as rotas `api/uazapi/{messages/download,profile-picture,send-extrato}` distinguem esse caso (`unreachable`/`checkFailed: true`, status 503) de uma resposta legítima "sem WhatsApp"/"anexo indisponível", evitando que a UI informe erroneamente que o hóspede não tem WhatsApp quando na verdade a instância está instável.
* **Dívida de segurança remanescente ⚠️:** `api/uazapi/send-reserva` e `api/uazapi/send-extrato` ainda usam fallback de servidor/token padrão embutido no código quando o tenant não tem instância própria configurada — deve ser removido (ver seção 4).
* **QR Code Expresso:** ⏳ não implementado.

### 3.9. Agentes de IA (Atendimento WhatsApp + Operacional) ✅ (parcialmente — ver ressalvas)
Plano completo e detalhado em `PLANO_AGENTE_IA.md`. Dois agentes autônomos via Vercel AI SDK
(`ToolLoopAgent`), modelo `gemini-3.7-flash` pelo **provider direto do Google**
(`GOOGLE_GENERATIVE_AI_API_KEY` — o Vercel AI Gateway está bloqueado até se cadastrar um cartão de
crédito na conta Vercel; o código já está pronto para trocar de volta).
* **Agente de Atendimento ✅** (`apps/web/src/lib/aiAgent/`): tools `check_availability`,
  `get_reservation_by_phone`, `get_guest_by_cpf` (cadastro do hotel → fallback Hub do
  Desenvolvedor), `list_room_categories`, `get_hotel_info`, `search_knowledge_base`,
  `create_reservation` (transação atômica, guardrail `autoConfirmReservations` decidido em código,
  nunca pelo modelo), `cancel_reservation` (soft-cancel, `status=CANCELLED`, nunca apaga a linha;
  gated por `AIAgentSetting.allowAgentCancelReservation`, default desligado; nunca cancela
  `CHECKED_IN` — escala pra recepção), `resend_fnrh_link` (reenvia o link de pré-check-in sob
  demanda, reaproveitando `sendPreCheckinLink`), `escalate_to_human`, `send_photo` (envia fotos
  reais de `Room.photos` via `sendUazapiImage`) e `list_services`. Ligado ao webhook da uazapi
  (`api/uazapi/webhook/[tenantId]`), com guarda para não responder por cima de um humano que
  respondeu a mesma conversa nos últimos 30min e checagem de cota/bloqueio antes de gastar tokens.
  **Interpretação de mídia ✅:** o agente também é acionado para mensagens de imagem/áudio/PDF
  recebidas do hóspede — baixa/descriptografa o anexo (`downloadUazapiMedia`) e envia os bytes como
  dado inline (base64) para o Gemini interpretar de verdade; outros tipos de anexo viram um
  placeholder de texto. **Achado importante:** passar a URL do anexo direto
  (`fileData.fileUri`, caminho documentado pelo SDK) é bloqueado pela API do Gemini com 429 no tier
  gratuito mesmo com cota de texto disponível — corrigido baixando os bytes e enviando inline
  (`fetchAsBase64`). Testado de ponta a ponta (imagem e PDF, com o agente completo).
  **Pendente:** atalho de salvar conhecimento direto da conversa.
* **`HotelService` ✅:** model real substituindo a tela mock de `cadastros/servicos` — CRUD completo
  (`api/tenant/services`, restrito a administradores), consultado pelo agente via `list_services`.
* **`Tenant.breakfastHours` ✅:** campo simples em Configurações ("Hotel (Dados)"), consultado pelo
  agente via `get_hotel_info`.
* **Agente Operacional ✅** (`apps/worker/src/operationalAgent.ts`, cron a cada 15min): detecção
  100% determinística (FNRH travada no SNRHos, pré-check-in pendente com check-in próximo, quarto
  em manutenção/sujo parado por tempo demais, WhatsApp do hotel desconectado); quando há problema
  novo, o LLM só compõe o resumo em linguagem natural e o alerta é enviado por WhatsApp
  (`OperationalAlertLog` evita repetir o mesmo alerta). Roda só para tenants com
  `monitoringEnabled=true`. **Modo `AUTONOMOUS_LIMITED` ✅ implementado** (lista de ações fechada,
  aprovada com o usuário antes de codar — nenhuma ação física/irreversível): (1) avisa a governanta
  responsável diretamente no WhatsApp dela (via `HousekeepingTask` aberta com `housekeeperId`) em
  vez de só o alerta genérico, quando um quarto fica preso em limpeza/manutenção; (2) dá uma única
  chance extra de reenvio automático a uma FNRH travada no SNRHos, resetando `snrhosAttempts` — só
  uma vez por registro, para sempre (checado via `AuditLog`), nunca um retry sem teto. Em
  `ALERT_ONLY` (padrão) o comportamento continua sendo só alertar, como antes.
* **Núcleo determinístico de execução + auditoria ✅:** toda ação de escrita que um agente executa
  (criar/cancelar reserva, reenviar FNRH, avisar governanta, resetar tentativa de FNRH) grava no
  `AuditLog` já existente do sistema, com `action` prefixado `AGENT_` e `userName: "Agente de IA"` —
  visível na nova tela **"Ações do Agente"** (`app/relatorios/agente-acoes`, `api/tenant/agent-actions`,
  card no hub de Relatórios). Os dois agentes rodam em processos/deploys separados (Vercel/web e
  Railway/worker, sem chamada de rede entre si) — por isso a "delegação" do Agente de Atendimento
  para o Operacional não é uma 2ª chamada de IA por ação (custaria latência/tokens em dobro sem
  ganho de segurança real), e sim esse núcleo de código compartilhado, auditável e determinístico.
* **Base de conhecimento (aprendizado) ✅:** `SupportKnowledgeBase` (por tenant, `agentType`
  SUPPORT/OPERATIONAL) — tela `app/cadastros/base-conhecimento` para o operador salvar
  pergunta+resposta manualmente; busca por palavras-chave (sem embeddings/vetores — suficiente para
  o volume esperado por hotel; migrar para pgvector se crescer muito).
* **Separação de controle assinante vs. admin master ✅:** `AIAgentSetting` divide claramente os
  campos editáveis pelo assinante (nome/foto do agente, preset de tom, toggles, telefone de alerta)
  dos exclusivos do admin master (`systemPromptExtra` — prompt cru de personalidade,
  `tokenQuotaOverride`, `blocked`) — nova seção em `admin/page.tsx` ("Agentes de IA — Prompt, Cota
  de Tokens e Bloqueio por Assinante"), restrita a `SUPER_ADMIN`.
* **`AIUsageLog` ✅:** grava tokens/custo real a cada chamada de qualquer um dos dois agentes; cota
  vem de `SaaSPlan.aiTokenQuota`, sobrescrita por `AIAgentSetting.tokenQuotaOverride` quando definido.
* **Ressalva:** `app/app/support/page.tsx` (Central de Ajuda voltada ao hóspede/staff, distinta dos
  dois agentes acima) continua sendo um **mock de chat/ticket** com respostas de "IA" fabricadas por
  `setTimeout` — não foi tocada nesta feature. Os modelos `SupportTicket`/`TicketMessage` também
  seguem não referenciados no código.
* **Não existe usuário `SUPER_ADMIN` real no banco ainda** (só `TENANT_ADMIN`) — o painel admin foi
  testado com uma sessão JWT sintética; criar um usuário `SUPER_ADMIN` de verdade antes de usar em
  produção.
* **Alerta de intervenção humana ✅** (`HumanEscalation`, `api/tenant/human-escalations`): fila
  separada do `AuditLog` (precisa de estado mutável pendente→resolvida) alimentada pelos dois
  agentes — `escalate_to_human` do Agente de Atendimento (com dedupe por telefone, pra não repicar
  a cada mensagem nova do hóspede enquanto espera) e cada alerta novo do Agente Operacional. Um sino
  funcional em `app/app/layout.tsx` (`HumanEscalationBell`) faz polling a cada 5s e mostra badge +
  som configurável (`playHumanInterventionSound`, timbre diferente do som de WhatsApp) — só nas
  telas Mapa de Quartos (`/app`) e Mapa de Reservas (`/app/reservations`), por allowlist explícita
  (nunca aparece em telas financeiras). Resolução é sempre manual (botão no dropdown do sino).
  **Achado que motivou a feature:** um hóspede que só tem reserva (sem check-in) não tem
  `StayCheckin` aberto, então a conversa dele é invisível em qualquer outra tela do sistema hoje —
  reconstruir uma "caixa de entrada" de WhatsApp independente de stay ficou documentado como
  pendência maior, fora de escopo desta rodada.
* **Correções de robustez do fluxo de reserva pelo agente ✅** (achadas em teste real via WhatsApp):
  o prompt agora injeta a data/hora atual de Brasília a cada chamada para o agente resolver datas
  relativas ("amanhã", "sexta que vem") sem precisar que o hóspede as digite por extenso;
  `check_availability` e `create_reservation` rejeitam qualquer check-in anterior a hoje (defesa
  contra o modelo errar o ano ao calcular a data relativa); identificação do hóspede passou a pedir
  só o CPF (nunca o nome completo digitado — `get_guest_by_cpf` já devolve o nome pra confirmação);
  e a cotação de preço (`check_availability`) passou a usar a mesma `Tariff` (por nº de adultos) da
  criação real da reserva (`resolveTariff` compartilhado), evitando cotar um valor e cobrar outro.
  A confirmação de `create_reservation` também passou a sempre informar horário de check-in/
  check-out (14:00/12:00, mesmo padrão já assumido no resto do sistema — a tela de Configurações só
  persiste esse horário no localStorage do navegador, não em campo do banco, então o agente
  server-side usa o mesmo fallback fixo).

### 3.10. Painel Administrativo da Plataforma (Super Admin) 🟡 (parcialmente — ver ressalva)
* `admin/tenants` (tela separada, não usada) e `admin/support` são **mocks de UI**: dados fixos em React state, nenhuma chamada de API. `admin/ai-telemetry` também é mock (não confundir com a seção real de IA dentro de `admin/page.tsx`, ver abaixo).
* O botão "Resolve & Vectorize RAG" em `admin/support` simula (via toast) uma vetorização no Supabase pgvector que não ocorre de fato.
* **Cota de Consultas de CPF por Assinante ✅:** dentro de `admin/page.tsx` ("Configuração do Sistema"), a tabela de cota de CPF por hotel já é real — `api/admin/tenants` (GET) lista todos os tenants com `cpfQueryQuotaMonthly`/`cpfQueryUsed` vindos do banco, e `api/admin/tenants/[id]` (PATCH) grava a nova cota mensal editada pelo Super Admin, refletindo imediatamente no limite aplicado em `api/stay/hub-consult-cpf`.
* **Agentes de IA — Prompt, Cota de Tokens e Bloqueio por Assinante ✅:** mesma seção "Configuração do Sistema" de `admin/page.tsx`, mesmas rotas `api/admin/tenants`/`api/admin/tenants/[id]` estendidas — prompt cru de personalidade por tenant (`AIAgentSetting.systemPromptExtra`), override de cota de tokens (`tokenQuotaOverride`) e bloqueio de uso (`blocked`), tudo real e persistido. Ver 3.9.
* **Pendente:** conectar as demais telas mock (`admin/tenants` standalone, `admin/ai-telemetry`, `admin/support`) aos modelos Prisma correspondentes.

### 3.11. Módulo Fiscal (NFe/NFSe) 🟡
* `app/app/fiscal/page.tsx` exibe uma lista fixa de notas "emitidas" em estado local; o botão "Emitir NFSe de Teste" apenas adiciona um objeto fictício com protocolo SEFAZ inventado — sem integração real com prefeitura/SEFAZ.
* `app/app/stock/nfe-import/page.tsx` simula a importação de XML de NFe com um `setTimeout` que popula uma tabela "De-Para" de produtos com dados fixos; a confirmação não grava nada em estoque ou contas a pagar.
* Não existem rotas `/api/*fiscal*` ou `/api/*nfe*`. **Módulo inteiro pendente de implementação real.**

### 3.12. Cadastros / Dados Mestres (Master Data)
Telas existentes em `app/app/cadastros/*`, com status de integração real:
* ✅ **Conectados ao backend (CRUD real):** Apartamentos, Empresas, Fornecedores, Hóspedes, Usuários, Plano de Contas, Formas de Pagamento (ver 3.6), Contas a Pagar (ver 3.6), Contas a Receber (ver 3.6), Saldo do Hóspede (ver 3.6), Serviços (`HotelService`, ver 3.9), Bancos, Colaboradores, Comandas, Grupos, PDV, Pratos.
* **Validação de Placa de Veículo Única ✅:** No cadastro de hóspede, ao adicionar um veículo a placa é consultada em `api/veiculos/search` antes de ser aceita — se já pertencer a outro hóspede (checagem exclui o próprio hóspede em edição), o cadastro é bloqueado e a mensagem "Veículo já cadastrado para \<nome completo do hóspede\>" é exibida, evitando duas fichas com a mesma placa.
* **Usuários — visão multi-hotel para Super Admin ✅:** `SUPER_ADMIN` enxerga e gerencia usuários de todos os hotéis (com filtro/seleção do tenant de destino ao criar); `TENANT_ADMIN` continua restrito aos usuários do próprio hotel e não pode criar, promover ou alterar um `SUPER_ADMIN` (proteção contra elevação de privilégio em `api/users`).
* **Empresa Conveniada vinculada ao Hóspede ✅:** Na ficha do hóspede (aba "Empresa Conveniada"), o vínculo deixou de ser um campo de texto livre e passou a ser uma busca no cadastro real de Empresas (`api/cadastros/empresas`, por razão social/fantasia/CNPJ), gravando `Guest.companyId`. Ao fechar a hospedagem com forma de pagamento parcelada (ex: fatura), o título de Contas a Receber é lançado em nome da empresa vinculada, mas `AccountsReceivable.guestId` sempre preserva o hóspede de origem do débito — mesmo quando faturado à empresa — para rastreabilidade; a tela de Contas a Receber exibe essa origem ("Origem: hóspede X") quando aplicável.
* 🟡 **Somente UI, sem persistência (pendentes de conexão):** Localidades.
* **Tarifas ⚠️:** existem **dois caminhos de leitura paralelos e inconsistentes** — `/api/tariffs` lê a tabela `Tariff` via Prisma; `/api/reservations/tariffs` lê uma tabela `tariffs` via cliente Supabase direto (não Prisma). A tela `app/app/tariffs/page.tsx`, por sua vez, não chama nenhuma das duas — usa `CadastroTarifasModal` com uma constante `INITIAL_TARIFFS` fixa. **Pendente:** unificar em uma única fonte de dados (Prisma) e conectar a tela real à API.

### 3.13. Integração de E-mail ✅
* `api/email/send` monta e-mails HTML (voucher, recibo, confirmação de pagamento) com anexo PDF opcional em base64, via `nodemailer`/SMTP, usando credenciais informadas pelo chamador (padrão `smtp.gmail.com` quando não especificado).
* `api/email/test` valida a conexão SMTP (`transporter.verify()`) e envia um e-mail de teste.
* A tabela `EmailSetting` existe no schema mas ainda não foi confirmada como fonte das credenciais nessas rotas — hoje elas dependem do chamador enviar host/usuário/senha a cada chamada.

### 3.14. Consulta de CPF (Hub do Desenvolvedor) ✅
* `api/stay/hub-consult-cpf` integra com a API paga do "Hub do Desenvolvedor" (`ws.hubdodesenvolvedor.com.br`) para resolver CPF em dados da Receita Federal (nome, nascimento, filiação, endereço, telefones, e-mails), agilizando o cadastro do hóspede.
* **Cota Mensal por Assinante ✅ (persistida no banco):** o controle de cota deixou de viver em memória de processo — `Tenant.cpfQueryQuotaMonthly`/`cpfQueryUsed`/`cpfQueryCycleStart` guardam limite, uso do mês corrente e início do ciclo; a rota reseta `cpfQueryUsed` automaticamente quando o ciclo vigente é de um mês anterior, e incrementa o uso a cada consulta bem-sucedida. A cota é editável por assinante no Painel SuperAdmin (ver 3.10).
* **Pendências de segurança/robustez:** há um token/contrato padrão **embutido no código-fonte** (`DEFAULT_HUB_TOKEN`/`DEFAULT_HUB_CONTRACT`) usado quando a variável de ambiente não está configurada — deve ser removido do código.

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
   * Duas fontes de dados paralelas para tarifas (Prisma vs. Supabase direto) — risco de inconsistência, deve ser unificado.

---

## 5. Próximos Passos de Desenvolvimento (Roadmap)

* [x] **Fase 1:** Estrutura base Multi-tenant, Schema do Banco de Dados Prisma e Autenticação.
* [x] **Fase 2:** Mapa de Quartos (Room Map), Status de Governança e Ações Contextuais.
* [x] **Fase 3:** Mapa de Reservas em Grade, Duplo clique e Validação de Conflitos.
* [x] **Fase 4:** Modal de Alteração de Período de Hospedagem e Recálculo Tarifário.
* [~] **Fase 5:** Fluxo Completo de Consumo PDV e Transferência de Estoque — **núcleo funcional implementado** (transferência de estoque, lançamento de consumo em quarto via `LancarConsumoQuartoModal`/`api/stay/consumo`; cadastros de Pratos e PDV agora conectados ao backend); pendente remover a página mock `app/consumption`.
* [~] **Fase 6a:** Pré-Check-in Digital / FNRH (captura de dados) — **concluída**: link único enviado via WhatsApp (manual ou automático poucas horas antes do check-in), formulário real conectado à reserva, assinatura touch e persistência em `Guest`/`FNRHRecord`/`PreCheckinLink`.
* [~] **Fase 6b:** Transmissão Eletrônica ao SNRHos (Ministério do Turismo/Serpro) — cliente (`snrhosClient.ts`), schema (`SNRHosSetting`, campos `snrhos*` em `FNRHRecord`), tela de configuração e job automático (`apps/worker/src/snrhosTransmit.ts`) implementados a partir do manual oficial da API v2 e testados com `fetch` mockado; pendente validação real contra o ambiente de homologação (aguardando credenciais).
* [x] **Fase 6c (nova):** Cadastro de Municípios (IBGE) — 5.570 municípios importados da tabela legada `CidadesNet` (WinDev/HFSQL) com CRUD completo em `/app/cadastros/localidades`, restrito a administradores; usado para resolver `cidade_id` na Fase 6b (ver seção 3.6).
* [~] **Fase 7:** Módulo Completo de Faturamento Corporativo e Contas a Receber Faturadas — cadastro de Empresas pronto; Contas a Receber/Pagar avulsas já implementadas e conectadas ao banco (`AccountsReceivable`/`AccountsPayable`, ver Fase 15); pendente a emissão/consolidação de faturas corporativas (`CorporateInvoice`) ainda não conectada a UI.
* [ ] **Fase 8 (nova):** Sair do estágio de protótipo de UI para as telas de Fiscal/NFe, Painel Super Admin (tenants/telemetria IA/suporte) e Central de Ajuda com IA — hoje totalmente mockadas, sem nenhuma chamada de API.
* [ ] **Fase 9 (nova):** Unificar acesso a dados de Tarifas (eliminar rota paralela via Supabase) e migrar configuração de e-mail/WhatsApp para as tabelas `EmailSetting`/`UazapiSetting` por tenant, removendo credenciais padrão embutidas no código.
* [x] **Fase 10 (nova):** Transferência de Débitos entre Quartos (`api/stay/transfer-debit` + `StayDebitTransfer`), Reservas Múltiplas em Lote (`api/reservations/batch`), Dashboard Operacional (`api/dashboard/metrics`) e Relatórios de Governança/Café da Manhã/Reservas por Período (`api/relatorios/*`) — implementados e conectados ao banco.
* [~] **Fase 11 (nova):** Reformulação da Integração WhatsApp (Uazapi) — gestão completa de instância por tenant (`api/uazapi/instance/*`, incluindo vincular instância já existente), conversa bidirecional via webhook com histórico (`WhatsappMessage`), badge de não lidas + som configurável no Mapa de Quartos e mensagens automáticas configuráveis (`WhatsappMessageSetting`) já implementados; pendente remover o fallback de credencial padrão embutida no código em `send-reserva`/`send-extrato`/`send-text` para tenants sem instância própria configurada.
* [ ] **Fase 12 (nova):** Implementar fluxo de UI para cancelamento de hospedagem (`StayCheckin.isCanceled`/`canceledAt`/`canceledByUser*`), campos já existentes no schema mas ainda não gravados por nenhuma tela.
* [x] **Fase 13 (nova):** Caixa obrigatório para operar o sistema (`CashRegisterGate`), Caixa Geral consolidado para Admin (`app/cash-register-geral` + `api/caixa/geral`), sangria vinculada a plano de contas e gestão de usuários multi-hotel para `SUPER_ADMIN` — implementados e conectados ao banco.
* [x] **Fase 14 (nova):** Validação de placa de veículo única no cadastro de hóspede, cota mensal de consulta de CPF persistida no banco e editável por assinante no Painel SuperAdmin (`api/admin/tenants`), e resiliência da integração uazapi a instância fora do ar (`fetchUazapi`/`UazapiUnreachableError`) — implementados e conectados ao banco.
* [x] **Fase 15 (nova):** Formas de Pagamento com regras de negócio (Parcelamento, Debitar Saldo Hóspede, Transf.Débito, Soma Caixa x Conta Corrente) centralizadas em `paymentProcessing.ts`, Saldo do Hóspede/Conta Corrente (`Guest.balance` + `GuestBalanceEntry`) e Contas a Pagar/Contas a Receber avulsas com baixa (total/parcial, juros/desconto) — implementados e conectados ao banco. Correção do loop infinito e adoção do tema claro/escuro no modal de Alterar Período, com a regra de data mínima de saída (nunca antes de hoje, travada na última diária lançada após o horário de virada). Overlays de celebração de check-in e despedida de check-out no Mapa de Quartos.
* [x] **Fase 16 (nova):** Conclusão dos cadastros auxiliares (Bancos, Colaboradores, Comandas, Grupos, PDV, Pratos) com CRUD real via API, remoção da página standalone `app/checkout` (fluxo de fechamento já coberto pelo Mapa de Quartos) e busca de Empresa Conveniada no cadastro do hóspede vinculada ao cadastro real de Empresas (`Guest.companyId`), garantindo que o Contas a Receber sempre rastreie o hóspede de origem do débito mesmo quando faturado à empresa.
* [~] **Fase 16 (nova):** Agentes de IA (Atendimento WhatsApp + Operacional) — ver detalhamento completo na seção 3.9 e em `PLANO_AGENTE_IA.md`. Agente de atendimento completo: disponibilidade, criação/cancelamento de reserva real (guardrails de auto-confirmação e de permissão de cancelamento, ambos por tenant), reenvio de FNRH sob demanda, identificação de hóspede por CPF, envio de fotos de quarto, lista de serviços/café da manhã, base de conhecimento (RAG leve) e escalonamento para humano; agente operacional com modo `AUTONOMOUS_LIMITED` implementado (avisa governanta responsável, dá uma chance extra de reenvio de FNRH travada) além do alerta padrão; núcleo de execução determinístico + tela "Ações do Agente" para auditoria; separação de controle assinante/admin master; painel admin real de prompt/cota/bloqueio por assinante. Pendente: atalho de salvar conhecimento direto da conversa.

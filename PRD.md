# Product Requirement Document (PRD) — HoteisNet PMS SaaS

**Versão:** 1.0.0  
**Data:** 11 de Agosto de 2026  
**Status:** Documento Oficial de Referência do Projeto  

---

## 1. Visão Geral do Produto (Product Overview)

### 1.1. Propósito
O **HoteisNet PMS SaaS** é uma plataforma moderna de Gestão Hoteleira (Property Management System) baseada em nuvem, concebida para modernizar e substituir o sistema desktop legado desenvolvido em WinDev. O produto atende hotéis, pousadas, resorts e hospedagens de todos os portes com uma experiência de uso fluida, intuitiva, altamente performática e esteticamente impecável.

### 1.2. Principais Objetivos
1. **Migração & Modernização:** Transicionar todas as regras de negócio consolidadas do sistema WinDev desktop para uma arquitetura SaaS multi-tenant web-native.
2. **Eficiência Operacional:** Reduzir o tempo de atendimento na recepção com mapa visual interativo, check-in/out agilizado e pré-checkin digital via WhatsApp.
3. **Automação Inteligente:** Integrar comunicação ativa via WhatsApp (Uazapi API) e suporte automatizado por IA (RAG) para reduzir custos operacionais.
4. **Conformidade Legal:** Automatizar a geração e transmissão da FNRH (Ficha Nacional de Registro de Hóspedes) para o SNRHos (Ministério do Turismo).

### 1.3. Stack Tecnológico
* **Estrutura Monorepo:** Turborepo com workspaces (`apps/web`, `apps/api`, `packages/database`).
* **Frontend Web:** Next.js 15 (App Router), React 19, TypeScript, TailwindCSS, Lucide Icons.
* **Backend API:** Node.js, Express, TypeScript, Zod.
* **Banco de Dados & ORM:** PostgreSQL / Supabase, Prisma ORM com suporte nativo a Multi-Tenancy.
* **Integrações Externas:** Uazapi WhatsApp API, Ministério do Turismo (SNRHos), OpenAI/Gemini para RAG.

---

## 2. Arquitetura Multi-Tenancy & Segurança

### 2.1. Isolamento de Dados por Tenant
Todas as entidades do banco de dados operacionais (apartamentos, categorias, reservas, check-ins, hóspedes, produtos, caixas, movimentações) contêm o campo obrigatório `tenantId`. O middleware de banco garante que nenhuma consulta cruze dados entre clientes SaaS distintos.

### 2.2. Perfis de Usuários (User Roles)
* **`SUPER_ADMIN`:** Administrador geral da plataforma SaaS HoteisNet (gestão de tenants, planos, cotas de IA e cobrança).
* **`TENANT_ADMIN`:** Proprietário ou gerente geral do estabelecimento (acesso total às configurações, tarifários, relatórios e usuários do hotel).
* **`RECEPCIONIST`:** Operador da recepção (mapa de quartos, mapa de reservas, check-in, check-out, alteração de período, lançamentos de consumo e FNRH).
* **`GOVERNESS`:** Equipe de governança e limpeza (mudança de status de limpeza dos quartos, conferência de frigobar).
* **`FINANCIAL`:** Gestor financeiro (controle de caixa geral, contas a pagar/receber, conciliação e faturamento corporativo).

---

## 3. Especificação das Funcionalidades (Feature Specifications)

### 3.1. Mapa Visual de Quartos (Room Map)
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

### 3.2. Gestão de Reservas & Mapa em Grade (Reservation Grid)
* **Grid de Reservas (Estilo Gantt / Linha do Tempo):** Visualização gráfica da ocupação dos quartos ao longo dos dias do mês.
* **Interatividade:** Duplo clique em células de datas para criar/editar reservas diretamente no mapa.
* **Prevenção de Overbooking:** Verificação automática em tempo real que bloqueia reservas conflitantes no mesmo apartamento.
* **Comunicação por WhatsApp:** Envio instantâneo de comprovantes e confirmações de reserva para o WhatsApp do hóspede.

### 3.3. Check-in, Hospedagem & Alteração de Período
* **Entrada de Hóspedes (Check-in):** Vinculação do hóspede principal e acompanhantes, aplicação da tabela tarifária vigente e cálculo automático das diárias.
* **Modal de Alteração de Período (`AlterarPeriodoModal`):**
  * Bloqueio fixo da data de início (check-in já realizado).
  * Flexibilidade na prorrogação ou antecipação do check-out com ajuste automático do saldo devedor.
  * Checagem de colisão com reservas futuras para o mesmo apartamento.

### 3.4. FNRH Eletrônica & SNRHos (Ministério do Turismo)
* **Ficha Nacional de Registro de Hóspedes:** Coleta completa de dados obrigatórios (Motivo da viagem, Meio de transporte, Última procedência, Próximo destino e documento oficial).
* **Assinatura Digital:** Suporte a coleta de assinatura em tela touch/mobile.
* **Transmissão SNRHos:** Envio automatizado dos registros de entrada e saída para a API do governo federal.

### 3.5. PDV (Ponto de Venda) & Estoque Multi-Local
* **Separação de Estoques:**
  * **Almoxarifado Geral:** Estoque central com controle de custo, preço de venda e alerta de estoque mínimo (`minStock`).
  * **Estoque de PDV (`pos_locations`):** Estoques individualizados por ponto de venda (Recepção, Frigobar dos Quartos, Restaurante Central, Bar da Piscina).
* **Transferência entre Almoxarifados:** Módulo dedicado para transferência auditada do almoxarifado central para os PDVs.
* **Lançamento de Consumo em Quarto:** Débito de itens no apartamento ocupado com baixa automática no estoque do PDV de origem.

### 3.6. Controle Financeiro, Frente de Caixa & Caixa Geral
* **Caixa da Recepção (Turnos Operacionais):** Abertura de turno com fundo de troco, lançamento de suprimentos/sangrias e fechamento de caixa auditado por operador.
* **Caixa Geral & Faturamento Corporativo:** Gestão de contas a pagar/receber, emissão de faturas faturadas para empresas parceiras (`Company`) com limites de crédito e prazos personalizados.

### 3.7. Governança e Manutenção
* **Painel da Governança:** Painel exclusivo para camareiras e supervisão de governança ordenando os quartos por prioridade de limpeza pós check-out.
* **Controle de Manutenção:** Agendamento de reparos com bloqueio temporário de inventário de quartos.

### 3.8. Self Check-in & WhatsApp (Uazapi)
* **Pre-Checkin Antecipado:** Envio automático de formulário via WhatsApp para que o hóspede preencha seus dados de FNRH antes de chegar ao estabelecimento.
* **QR Code Expresso:** Geração de QR Code para agilizar a validação na recepção.

### 3.9. Central de Ajuda & Suporte com Inteligência Artificial (RAG)
* **Atendimento Inteligente:** Resposta autônoma para dúvidas dos usuários do sistema através de modelo de IA conectado a uma base de conhecimento atualizada.
* **Escalação de Suporte:** Abertura e acompanhamento de chamados (tickets) quando a resposta da IA for insuficiente.

---

## 4. Requisitos Não-Funcionais

1. **Estética & Experiência do Usuário (UX/UI):** Interface extremamente atraente, moderna e intuitiva, seguindo princípios de Glassmorphism, paleta de cores elegantes em modo escuro/claro, tipografia limpa (Inter/Outfit) e micro-interações responsivas.
2. **Desempenho & Baixa Latência:** Renderização rápida de componentes de grade e mapa de quartos sem engasgos, com queries de banco indexadas e caching inteligente no Next.js.
3. **Disponibilidade & Escalabilidade:** Arquitetura desacoplada em nuvem pronta para suportar múltiplos hotéis em regime SaaS 24/7.
4. **Segurança & Privacidade:** Criptografia HTTPS/TLS, autenticação segura, isolamento estrito de dados entre hotéis e conformidade com a LGPD.

---

## 5. Próximos Passos de Desenvolvimento (Roadmap)

* [x] **Fase 1:** Estrutura base Multi-tenant, Schema do Banco de Dados Prisma e Autenticação.
* [x] **Fase 2:** Mapa de Quartos (Room Map), Status de Governança e Ações Contextuais.
* [x] **Fase 3:** Mapa de Reservas em Grade, Duplo clique e Validação de Conflitos.
* [x] **Fase 4:** Modal de Alteração de Período de Hospedagem e Recálculo Tarifário.
* [ ] **Fase 5:** Finalização do Fluxo Completo de Consumo PDV e Transferência de Estoque.
* [ ] **Fase 6:** Integração com Transmissão Automática SNRHos (FNRH Eletrônica).
* [ ] **Fase 7:** Módulo Completo de Faturamento Corporativo e Contas a Receber Faturadas.

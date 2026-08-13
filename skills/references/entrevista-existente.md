# Entrevista — Projeto existente

Aqui a maior parte do contexto está no código, não na cabeça da pessoa. Leia primeiro, pergunte depois — e pergunte só o que o código não conta.

## Antes de perguntar qualquer coisa

Investigue e monte um resumo do que encontrou:

- Stack, versões e dependências principais
- Arquitetura em uso (monolito, API + front separado, serverless)
- Modelo de dados atual (migrations, schema, models)
- Padrões e convenções do projeto (como os componentes são organizados, como o erro é tratado, como as rotas são nomeadas)
- Estado dos testes
- O que já existe perto do que a pessoa quer mudar — reaproveitar é quase sempre melhor que criar do lado

Abra a conversa com isso e peça confirmação. Erros de leitura aparecem na hora.

## Rodada 1 — Entender o pedido de verdade

- **Cada melhoria da lista é o quê?** Feature nova, correção de bug, refatoração, performance, UX ou débito técnico? Rotule cada item — muda como o PRD descreve.
- **Por que agora?** A motivação revela o critério de sucesso real. "Os clientes reclamam que a busca não acha nada" é diferente de "quero deixar a busca mais bonita".
- **Qual é a dor concreta hoje?** Peça um exemplo real: um caso, um print, uma reclamação.
- **Prioridade e ordem.** Se são várias melhorias, o que precisa sair primeiro? Alguma depende de outra?

## Rodada 2 — Comportamento esperado

Para cada melhoria relevante:

- **Como funciona hoje** (descreva o comportamento atual observado no código) **e como deve funcionar depois?** O contraste antes/depois é a forma mais clara de especificar mudança em sistema existente.
- **Quem é afetado?** Todos os usuários, um perfil só, admin?
- **Casos de borda**: dados legados que não se encaixam na regra nova, usuários no meio de um fluxo, registros já criados no formato antigo.

## Rodada 3 — Impacto e limites

Esta rodada é o que separa um PRD de melhoria de um pedido genérico.

- **Tem migration de dados envolvida?** Se o schema muda, o que acontece com o que já está no banco?
- **Quebra compatibilidade?** API pública, integrações, apps clientes, webhooks.
- **O que NÃO pode ser tocado?** Módulos críticos, código que outra pessoa está mexendo, áreas com histórico de quebrar.
- **Precisa manter retrocompatibilidade** ou pode ser mudança dura?
- **Tem feature flag / rollout gradual** ou vai direto pra produção?

## Rodada 4 — Execução

- **Como validar que funcionou?** Teste automatizado, roteiro manual, métrica.
- **O agente deve escrever testes?** Se o projeto já tem suíte, respeitar o padrão dela.
- **Convenções obrigatórias**: padrão de commit, branch, lint, formatação, revisão.
- **Fatiar em quantas entregas?** Proponha um fatiamento revisável e valide.

## Ao escrever o PRD depois disso

Seja específico com o código: `src/services/search.ts`, `prisma/schema.prisma`, `app/(dashboard)/clientes/page.tsx`. Um PRD de projeto existente que fala em "camada de serviço" genérica desperdiça a maior vantagem que ele tem — o código está ali para ser citado.

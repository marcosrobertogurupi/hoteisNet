# Entrevista — Projeto novo

Cardápio de perguntas, agrupadas em rodadas. Escolha o que é relevante e sempre venha com uma sugestão de resposta pronta. Pule o que a pessoa já respondeu sozinha na descrição inicial.

## Rodada 1 — Produto e público

O objetivo aqui é entender o que é a coisa. Sem isso, nada mais faz sentido.

- **Quem é o usuário principal?** Uma pessoa específica, não "todo mundo". Ex: "gerente de oficina mecânica pequena, 1 a 5 funcionários".
- **Qual dor exata isso resolve?** E como essa pessoa resolve hoje (planilha? papel? concorrente?).
- **Plataforma** — web, mobile (nativo/híbrido), desktop, CLI, extensão, API? Sugestão padrão: web responsivo, que cobre mobile sem app.
- **É um sistema de uma empresa só ou multi-empresa (multi-tenant)?** Essa decisão muda o schema inteiro do banco — pergunte cedo, nunca depois.
- **Modelo de negócio** — SaaS por assinatura, licença única, uso interno, marketplace, gratuito?

## Rodada 2 — Escopo do MVP

- **Quais são as 3 a 5 telas/funções sem as quais o produto não existe?**
- **Qual é o fluxo principal, do começo ao fim?** Ex: "usuário cadastra cliente → cria ordem de serviço → adiciona peças e mão de obra → gera PDF → marca como paga".
- **O que explicitamente NÃO entra na v1?** Force essa resposta — é a seção mais útil do PRD.
- **Tem alguma referência/concorrente?** "Parecido com o X mas focado em Y" economiza páginas de explicação.

## Rodada 3 — Usuários, dados e regras

- **Tem níveis de acesso?** (admin, operador, cliente final, somente leitura)
- **Quais são as entidades principais do sistema?** Ex: Cliente, Produto, Pedido, Pagamento. Esboce o relacionamento entre elas.
- **Regras de negócio que não são óbvias.** Ex: "desconto máximo de 15% só o gerente aprova", "estoque não pode ficar negativo". É aqui que mora o valor real do domínio.
- **Precisa de histórico/auditoria?** Quem mudou o quê e quando.

## Rodada 4 — Técnico

Se a pessoa não tem preferência, proponha uma stack e explique em uma linha por quê. Não devolva a pergunta em branco.

- **Stack** — sugestão padrão para web: Next.js + TypeScript + Tailwind + Postgres via Prisma. Para mobile: React Native/Expo. Para API pura: FastAPI ou Node/Fastify.
- **Autenticação** — e-mail/senha, magic link, OAuth (Google/Microsoft), SSO corporativo?
- **Banco de dados** — Postgres é o padrão seguro. SQLite serve se for local/single-user.
- **Integrações necessárias** — pagamento (Stripe, Asaas, Mercado Pago), e-mail transacional, WhatsApp, nota fiscal, ERP, storage de arquivos.
- **Onde vai rodar?** Vercel, Railway, VPS, on-premise, Cloudflare.
- **Precisa funcionar offline?** Muda a arquitetura por completo — pergunte se for campo/mobile.

## Rodada 5 — Qualidade e operação (opcional, mas evita dor)

- **Testes** — o agente deve escrever testes? De que tipo?
- **Volume esperado** — dezenas, milhares ou milhões de registros? Só importa se for grande.
- **Requisitos legais** — LGPD, dados de saúde, dados financeiros, retenção.
- **Idioma e localização** — só pt-BR? Moeda, fuso, formato de data.

## Perguntas que geralmente NÃO valem a pena

Não gaste rodada com: escolha de gerenciador de pacotes, estrutura de pastas, nomes de variáveis, tema claro/escuro, detalhes de CI. Ou o agente decide bem sozinho, ou dá pra ajustar depois em segundos.

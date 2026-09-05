# HoteisNet — Guia do projeto

## 🔒 Segurança — regras obrigatórias para toda rota de API nova

Este projeto é um SaaS multi-tenant (cada hotel/pousada é um tenant isolado no mesmo banco). Em 23/08/2026 uma auditoria de segurança encontrou dezenas de rotas de API que vazavam dados de hóspedes/financeiros de qualquer tenant sem autenticação, porque cada rota implementa seu próprio isolamento manualmente e isso foi esquecido/feito errado em boa parte do código (ver commit da correção para o histórico completo). As regras abaixo existem para nunca repetir isso. **Aplicam-se a toda rota nova sob `apps/web/src/app/api/**`, sem exceção — sinalize explicitamente qualquer violação ao revisar código e corrija antes de prosseguir.**

### 1. Toda rota de API autentica explicitamente — não existe rede de segurança automática

`apps/web/src/middleware.ts` só protege páginas (`/app/**`, `/admin/**`). **Rotas de API não passam por nenhum middleware central** — cada `route.ts` é responsável por checar a própria sessão. Nunca assuma que uma rota está protegida "porque fica atrás do login" da tela que a chama.

Padrão obrigatório no início de todo handler que não seja explicitamente público (login, webhook, link de pré-check-in por token):

```ts
import { getSessionUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const session = await getSessionUser(req);
  if (!session?.tenantId) {
    return NextResponse.json({ success: false, error: "Sessão inválida ou expirada." }, { status: 401 });
  }
  // ...
}
```

Para ações restritas a administradores (exclusão, configurações, cadastros mestres como bancos/plano de contas/formas de pagamento), combine com `requireAdmin`:

```ts
import { getSessionUser, requireAdmin } from "@/lib/auth";

const session = await getSessionUser(req);
const adminError = requireAdmin(session);
if (adminError) return NextResponse.json(adminError.body, { status: adminError.status });
```

As únicas rotas legitimamente sem sessão são: `/api/auth/login`, `/api/housekeeping/login`, `/api/uazapi/webhook/[tenantId]` (autenticada por segredo de webhook, não por sessão — ver regra 5), `/api/public/pre-checkin/[token]` (autenticada pelo token da URL, nunca por tenantId/reservationId do cliente) e `/api/version` (só devolve o build id da versão publicada e se ela é obrigatória — nenhum dado de tenant; consumida por abas ainda logadas e pela tela de login para avisar de versão desatualizada).

### 2. `tenantId` NUNCA vem do cliente — sempre de `session.tenantId`

Esta foi a causa da maioria dos achados críticos: rotas que liam `tenantId` do body/query da requisição (ou caíam para uma constante compartilhada tipo `DEFAULT_TENANT_ID`/`"TNT-01"` quando ausente) permitiam qualquer requisição ler/editar/apagar dados de **qualquer hotel**, bastando informar (ou nem informar) o tenant certo.

```ts
// ❌ NUNCA — tenantId do body/query é controlado pelo atacante
const { tenantId } = await req.json();
const items = await prisma.guest.findMany({ where: { tenantId } });

// ✅ SEMPRE — tenantId vem exclusivamente da sessão autenticada
const session = await getSessionUser(req);
const items = await prisma.guest.findMany({ where: { tenantId: session!.tenantId! } });
```

Isso vale tanto para `create` (nunca gravar o `tenantId` que veio no corpo) quanto para `findMany`/`findFirst`/`update`/`delete` (sempre filtrar por `session.tenantId`).

### 3. Toda escrita (`update`/`delete`) repete o filtro de tenant — nunca confie só na checagem de leitura

Um padrão que parecia seguro mas não era: checar `findFirst({ where: { id, tenantId } })` e, se existir, chamar `update({ where: { id } })` **sem repetir o tenantId na escrita**. Isso deixa a porta aberta para qualquer refactor futuro que remova/altere a checagem de leitura sem que ninguém perceba que a escrita ficou desprotegida.

```ts
// ✅ Use updateMany/deleteMany com o filtro de tenant DIRETO na escrita — nunca update/delete por id puro
const updated = await prisma.guest.updateMany({
  where: { id, tenantId: session!.tenantId! },
  data: { ... },
});
if (updated.count === 0) {
  return NextResponse.json({ success: false, error: "Não encontrado." }, { status: 404 });
}
```

Referência de boas práticas já usada no projeto: `apps/web/src/app/api/tenant/human-escalations/[id]/route.ts`, `apps/web/src/app/api/caixa/abrir/route.ts`.

### 4. IDs relacionados recebidos do cliente (guestId, cashRegisterId, roomId, companyId...) também precisam ser validados contra o tenant

Não basta proteger o registro principal — todo ID estrangeiro que o cliente manda no body (ex: `guestId` ao criar uma reserva, `cashRegisterId` ao lançar um pagamento) precisa ser confirmado como pertencente ao mesmo tenant antes de usar, senão dá para vincular um registro de um hotel a um recurso de outro:

```ts
let realGuestId: string | null = null;
if (guestId) {
  const guest = await tx.guest.findFirst({ where: { id: guestId, tenantId: session.tenantId! }, select: { id: true } });
  realGuestId = guest?.id || null; // se não achou, ignora — nunca usa o guestId "cru" do body
}
```

### 5. Webhooks e rotas verdadeiramente públicas usam segredo próprio, nunca dependem só do ID na URL

`POST /api/uazapi/webhook/[tenantId]` valida um segredo por-tenant (`UazapiSetting.webhookSecret`) via `timingSafeEqual`, além do `tenantId` da URL — um `tenantId` sozinho é adivinhável/enumerável. Ao integrar um novo provedor externo (webhook de pagamento, WhatsApp, etc.), sempre exija um segredo compartilhado configurado nos dois lados, nunca confie apenas em um identificador na URL.

`/api/public/pre-checkin/[token]` é o modelo para links públicos: o token é gerado com `randomBytes(32)`, expira, é revogado ao gerar um novo, e a rota **nunca aceita tenantId/reservationId/guestId do cliente** — tudo é resolvido a partir do próprio token no servidor.

### 6. Segredos de API de terceiros nunca vão hardcoded no código-fonte

Sempre `process.env.NOME_DA_VARIAVEL`, nunca uma string literal como fallback (nem "só para dev"). Um segredo commitado fica no histórico do git para sempre, mesmo removido depois. Ver `apps/web/src/lib/uazapiInstance.ts` (`UAZAPI_FALLBACK_SERVER_URL`/`UAZAPI_FALLBACK_INSTANCE_TOKEN`) como referência.

### 7. Rotas que fazem proxy para um serviço externo (SMTP, WhatsApp, etc.) nunca aceitam host/credenciais arbitrários do body

Se a rota existe para usar as credenciais **do próprio tenant** (ex: enviar e-mail com o SMTP configurado pelo hotel), resolva essas credenciais a partir do banco (`getTenantUazapiCredentials(session.tenantId)` é o padrão), nunca a partir de um campo livre do body — senão a rota vira um relay/SSRF aberto para qualquer host escolhido por quem chama.

### 8. Força bruta: login sempre com rate limiting + comparação timing-safe

Todo endpoint de autenticação (login, verify-admin, login de qualquer app satélite futuro) precisa usar os helpers já existentes em `lib/auth.ts`: `verifyPasswordTimingSafe` (evita enumeração de e-mail por tempo de resposta), `isAccountLocked`/`nextFailedLoginState` (bloqueio após tentativas repetidas, campos `failedLoginAttempts`/`lockedUntil` no modelo). Nunca reimplementar isso do zero por endpoint.

### 9. Desativar/rebaixar um usuário precisa invalidar sessões já emitidas

Toda alteração que reduz o acesso de um usuário (`active: false`, mudança de `role`, troca de senha) deve incrementar `User.tokenVersion` — é isso que faz `getSessionUser` rejeitar o JWT antigo imediatamente, em vez de esperar o token expirar sozinho (até 12h). Ver `apps/web/src/app/api/users/route.ts` (PATCH) como referência.

### 10. Nunca interpolar texto livre em HTML sem escapar

Qualquer campo preenchido por hóspede/usuário (nome, observações, mensagens) que for renderizado depois dentro de um template HTML (e-mail, PDF gerado via HTML, etc.) precisa passar por `escapeHtml` (`apps/web/src/lib/htmlEscape.ts`) antes de entrar no template.

---

## ⚡ Performance — regras obrigatórias para toda busca de dados

Em 27/08/2026 o projeto estourou a cota do Supabase (Free) e foi **restrito em produção** — a causa foi egress: consultas que traziam a linha inteira dos registros a cada tick de polling de 3 s (ver `PRD.md` Fase 18). **Egress (bytes de saída do banco) é a métrica limitante do Supabase** — cada campo desnecessário numa resposta, multiplicado por polling × nº de terminais × 30 dias, vira GB e vira restrição/fatura. As regras abaixo valem para **tudo que lê do banco**: rotas `apps/web/src/app/api/**`, Server Components, o worker (`apps/worker`), scripts. **Sinalize e corrija qualquer violação ao revisar código, antes de prosseguir.**

### 1. Toda leitura traz só as colunas que serão usadas — `select` explícito, sempre

Nunca `prisma.model.findMany()` / `findFirst()` "pelado" (traz todas as colunas) quando o consumidor usa 3 campos. Liste em `select` exatamente o que a resposta desenha.

```ts
// ❌ NUNCA — traz a linha inteira (notes, cpf, telefone, timestamps, flags…) para mostrar nome
const guest = await prisma.guest.findFirst({ where: { id } });
return NextResponse.json({ nome: guest.fullName, cpf: guest.cpf });

// ✅ SEMPRE
const guest = await prisma.guest.findFirst({ where: { id, tenantId: session!.tenantId! }, select: { fullName: true, cpf: true } });
```

### 2. Relações: `select` aninhado, nunca `include`

`include: { room: true }` puxa **todas** as colunas de `room`. Use `select` aninhado com os campos necessários.

```ts
// ❌ include: { room: { include: { category: true } } }
// ✅
select: { id: true, room: { select: { number: true, status: true, category: { select: { name: true } } } } }
```

### 3. Nunca fazer spread do registro do Prisma na resposta

Monte o objeto de resposta **campo a campo**, com o que o front consome. `return NextResponse.json({ ...registro })` foi a causa direta do incidente de egress — vazava dezenas de colunas que a tela nem lia, a cada 3 s.

### 4. Contar sem baixar: `_count`

Para saber se/quantos relacionados existem, use `_count`, não traga o array só para ler `.length`.

```ts
// ❌ include: { fnrhRecords: { select: { id: true } } }  →  r.fnrhRecords.length > 0
// ✅ _count: { select: { fnrhRecords: true } }           →  r._count.fnrhRecords > 0
```

### 5. Polling e listas: padrão enxuto + só a janela necessária

Endpoint consultado em loop (mapas, telas que atualizam sozinhas) **nunca** baixa histórico nem o dataset completo: filtra pela janela operacional (ex.: `/api/reservations` = hoje até 6 meses à frente) e traz só os campos que mudam / são desenhados. Se a tela precisa de dados ricos (fotos, cadastro completo) só na carga inicial, isso vem de um endpoint separado, chamado **uma vez**, não no polling.

### 6. Referências de implementação correta

- `apps/web/src/lib/mapQueries.ts` — montagem enxuta compartilhada dos payloads dos mapas.
- `apps/web/src/app/api/reservations/rooms/status/route.ts` — endpoint enxuto de polling.
- `apps/web/src/app/api/reservations/route.ts` (GET) — `select` explícito + `_count` + janela operacional.
- `apps/web/src/lib/mapVersion.ts` — resposta condicional (ETag/304): quando nada mudou, o polling nem baixa o payload.

---

## Checklist rápido ao criar/revisar uma rota de API

- [ ] A rota chama `getSessionUser` (ou é uma das 4 rotas explicitamente públicas, documentadas como tal em comentário)?
- [ ] Toda query (`findMany`/`findFirst`/`update`/`delete`/`create`) usa `session.tenantId`, nunca um `tenantId` vindo de body/query/params?
- [ ] `update`/`delete` usam `updateMany`/`deleteMany` com o filtro de tenant na própria escrita (não só numa checagem de leitura anterior)?
- [ ] Todo ID estrangeiro recebido do cliente (guestId, roomId, cashRegisterId, companyId, accountPlanId...) é revalidado contra `session.tenantId` antes de usar?
- [ ] Ações destrutivas ou de configuração exigem `requireAdmin`?
- [ ] Nenhum segredo/token de API hardcoded — sempre `process.env`?
- [ ] Se a rota faz proxy para um serviço externo, as credenciais vêm do tenant salvo no banco, nunca do body da requisição?
- [ ] Texto livre de usuário é escapado antes de virar HTML?
- [ ] Toda leitura usa `select` explícito (sem `findMany()` pelado, sem `include`, sem spread do registro na resposta), traz só os campos usados e `_count` no lugar de arrays só para contar? (ver seção ⚡ Performance)
- [ ] Se o endpoint é consultado em polling, filtra pela janela operacional e não baixa histórico/dataset completo?

Se qualquer resposta for "não", a rota não está pronta.

---

## Implementações futuras planejadas

### Métrica de volume de dados (egress) por assinante no painel do admin master

O painel do admin master (`apps/web/src/app/admin/**`) deve ganhar uma métrica de **volume de dados / egress do Supabase por assinante (tenant)**. Objetivo: identificar qual hotel está gerando mais tráfego de banco (o consumo do Supabase hoje é dominado por "Shared Pooler Egress", ~90%, que corresponde às consultas via Prisma — incluindo o polling de 3s dos mapas). Sem essa quebra por tenant não dá para saber quem puxa a fatura para cima nem cobrar/limitar de forma justa.

Abordagem sugerida: instrumentar as rotas de API (ou o cliente Prisma) para contabilizar bytes de resposta por `tenantId` e agregar por período, exibindo no painel do admin junto das demais métricas por assinante. Não expor essa métrica ao próprio tenant.

# Plano de Implementação — Governança de Quartos no modo "Fila de quartos"

## Estado da implementação — ✅ concluído e testado (26/08/2026)

Todos os itens abaixo foram implementados e verificados de ponta a ponta contra o banco real
(dev = produção), incluindo regressão do modo `RECEPTION`. Migration aplicada via `prisma db push`
+ arquivo SQL em `supabase/migrations/20260826150000_housekeeping_daily_arrumacao_and_dnd.sql`.

### Ajuste posterior (27/08/2026) — "Resolvidos hoje" saiu do app da governanta

Testando no celular de uma governanta real, o usuário decidiu que **quarto resolvido no dia
(limpeza pós check-out concluída, arrumação de quarto ocupado concluída ou "não perturbe") deve
sumir por completo da relação da governanta** — com hóspede ou sem. O bloco recolhido "Resolvidos
hoje" por andar foi removido de `apps/web/src/app/housekeeping/**`. `GET /api/housekeeping/rooms`
não retorna mais `resolvedToday` (payload só tem `pending`) e só busca tarefas `PENDING`/
`IN_PROGRESS`. O acompanhamento do que já foi feito no dia continua na recepção (Mapa de Quartos,
Governança, Histórico de Limpeza). Só afeta o modo `QUEUE`; `RECEPTION` não foi tocado.

Ajustes que só apareceram durante a implementação (além do plano):

- `GET /api/tenant/housekeeping-tasks` passou a **excluir** a arrumação diária automática ainda sem
  governanta — senão o polling ficava pesado (~47 linhas a cada 3-4s) e a tela de Governança
  mostrava um botão "Cancelar atribuição" falso em todo quarto ocupado.
- `DELETE /api/tenant/housekeeping-tasks/[id]` numa tarefa diária (`serviceDate` preenchido) agora
  só tira a governanta (devolve à fila) em vez de apagar o registro.
- `POST .../start` e `.../skip` ganham 409 limpo (em vez de erro de constraint) quando a arrumação
  do dia do quarto já foi concluída/marcada como "não perturbe".
- `serviceDate` ficou como `DateTime?` simples (não `@db.Date`), gravado com `dateOnlyBrasilia()`,
  para casar com a convenção de datas já usada no projeto (`Reservation.checkInDate` etc.).

## Contexto

O módulo de Governança de Quartos tem dois modos de atribuição, por assinante, em
Configurações → "Governança de Quartos — Modo de Atribuição de Limpeza"
(`HousekeepingSetting.assignmentMode`):

- **`RECEPTION` ("Recepção define")** — a recepção arrasta cada quarto para uma governanta na tela
  `/app/governance`; a tarefa cai no app da governanta e o fluxo segue. **Está OK e NÃO será
  alterado por este plano.**
- **`QUEUE` ("Fila de quartos")** — os quartos sujos entram numa fila geral e qualquer governanta
  assume pelo app (`/housekeeping`). **É só aqui que este plano mexe.**

### Problemas atuais no modo `QUEUE` (diagnóstico do código)

1. **A fila não filtra por situação do quarto.** Em
   `apps/web/src/app/api/housekeeping/rooms/route.ts` a regra é literalmente *"quarto ativo sem
   tarefa aberta → aparece para todas as governantas"* (`if (!r.task) return assignmentMode === "QUEUE"`),
   sem olhar `room.status`. Consequências:
   - Quarto ocupado (e, a rigor, quarto já limpo) entra na fila.
   - Assim que a governanta conclui, a tarefa vira `DONE` (não é mais "tarefa aberta") e **o quarto
     reaparece imediatamente na fila de todas** — o loop que o usuário relatou.

2. **Quarto ocupado assumido pela fila é gravado como limpeza pós check-out.**
   `apps/web/src/app/api/housekeeping/rooms/[roomId]/start/route.ts` cria a tarefa espontânea fixa
   como `type: "CHECKOUT"`. Efeitos:
   - No app a governanta vê o quarto ocupado rotulado "Limpeza pós check-out" (não sabe que há
     hóspede) — `type` também cai no default `"CHECKOUT"` no payload da listagem.
   - A limpeza **não aparece** no "Histórico de Limpeza" do Mapa de Quartos
     (`room-cleaning-history` filtra `type: "OCCUPIED"`).
   - Polui o relatório de governança (conta como checkout).

3. **Não existe "arrumação do dia".** Arrumação de quarto ocupado só nasce por atribuição manual da
   recepção. Não há geração diária nem virada de dia.

## Escopo e comportamento-alvo (modo `QUEUE`)

1. **Arrumação diária de quarto ocupado vira tarefa real.** Uma vez por dia (virada ancorada em
   `America/Sao_Paulo`), cada quarto **ocupado** ganha uma `HousekeepingTask` `type: OCCUPIED`,
   `status: PENDING`, `serviceDate = hoje`, e entra na fila geral rotulada "Arrumação c/ hóspede".
   Quarto vago sujo (`VACANT_DIRTY`) continua entrando como "Limpeza pós check-out", como hoje.
2. **Quem toca primeiro assume** → `IN_PROGRESS`, some da fila das outras governantas (mecânica que
   já existe para pós-checkout, reaproveitada).
3. **Concluiu** → "Quarto Limpo" → `DONE`; sai de "A limpar" e vai para o bloco **"Resolvidos hoje"**
   (recolhido) com quarto + horário + quem + observação.
4. **Não perturbe** — a governanta chega à porta, vê o aviso de "não perturbe" e registra isso **no
   próprio app** (botão secundário na tela do quarto). A tarefa do dia é encerrada com
   `status: SKIPPED`, `skipReason: DO_NOT_DISTURB`; o quarto sai da fila e vai para "Resolvidos hoje"
   marcado como 🚫 "Não perturbe", **não** como limpo. O status do quarto continua `OCCUPIED`.
5. **Ambos os desfechos (limpeza e não perturbe) vão para o histórico da hospedagem** — a mesma
   modal "Histórico de Limpeza" aberta pelo menu de contexto do Mapa de Quartos, escopada pela
   estadia atual.
6. **Virada de dia**: no dia seguinte os quartos ainda ocupados voltam para a fila (nova tarefa do
   dia). Um evento de "não perturbe" é por dia/por visita — se o aviso continuar amanhã, a
   governanta registra de novo.

### Decisões de negócio

| Ponto | Decisão |
|---|---|
| Quarto que fez **check-in hoje** ganha arrumação hoje? | **Não** (acabou de ser preparado para a chegada). Controlado por `HousekeepingSetting.arrumacaoSkipCheckinDay`, default `true`. |
| Quarto no **dia do check-out previsto** | **Sim**, ganha arrumação normal (hóspede ainda está até ~12h). |
| Hóspede tira o aviso e quer arrumação depois | Recepção tem botão "Devolver à fila" no quarto em `/app/governance` (recria a tarefa `PENDING` do dia). |
| Recepção pode pular arrumação preventivamente | **Fora do escopo agora.** Só a governanta reporta "não perturbe". |
| "Não perturbe" visível para a recepção | Selo "Não perturbe hoje" no card do quarto no Mapa de Quartos + entrada no Histórico de Limpeza. |
| Ligar/desligar a arrumação diária automática | `HousekeepingSetting.autoDailyArrumacao`, default `true`. Só afeta o modo `QUEUE`. |

## Mudanças no schema (`packages/database/prisma/schema.prisma`)

```prisma
enum HousekeepingTaskStatus {
  PENDING
  IN_PROGRESS
  DONE
  SKIPPED        // NOVO — tarefa encerrada sem limpeza (ex.: hóspede em "não perturbe")
}

enum HousekeepingSkipReason {   // NOVO
  DO_NOT_DISTURB
  OTHER
}

model HousekeepingTask {
  // ... campos atuais ...
  skipReason   HousekeepingSkipReason?   // NOVO — preenchido quando status = SKIPPED
  // serviceDate: dia (em America/Sao_Paulo) ao qual a arrumação diária pertence. Só é preenchido
  // para as tarefas OCCUPIED geradas automaticamente no modo QUEUE. NULL para tarefas de checkout
  // e para atribuições manuais da recepção.
  serviceDate  DateTime?  @db.Date       // NOVO

  // finishedAt passa a significar "quando a tarefa foi encerrada" — vale para DONE e para SKIPPED.
  // durationSeconds continua só para DONE.

  @@unique([roomId, type, serviceDate])  // NOVO — evita 2 arrumações diárias do mesmo quarto no
                                         // mesmo dia. Múltiplos NULL não colidem no Postgres.
  @@index([tenantId, serviceDate])       // NOVO — para a geração diária e os relatórios.
  // @@index([tenantId, status]) e @@index([roomId, status]) permanecem.
}

model HousekeepingSetting {
  // ... campos atuais ...
  autoDailyArrumacao       Boolean  @default(true)   // NOVO
  arrumacaoSkipCheckinDay  Boolean  @default(true)   // NOVO
}
```

Migration: `npx prisma migrate dev --name housekeeping_daily_arrumacao_and_dnd` (Supabase). Linhas
existentes ficam com `serviceDate = NULL` e `skipReason = NULL` — sem impacto.

## Helpers novos

### `saoPauloDateOnly(d = new Date()): Date` (`apps/web/src/lib/date.ts` ou onde já existir a lógica de fuso)

Retorna a data (00:00) do dia em `America/Sao_Paulo`. Reaproveitar o utilitário de fuso que já
existe no projeto para lógica de "hoje" no servidor; não reimplementar offset na mão.

### `ensureDailyArrumacaoTasks(tenantId: string): Promise<void>` (`apps/web/src/lib/housekeeping.ts` — arquivo novo)

Idempotente. Para o dia `hoje = saoPauloDateOnly()`:

1. Se `HousekeepingSetting.assignmentMode !== "QUEUE"` ou `autoDailyArrumacao === false` → retorna.
2. Guard de custo: cache em memória no módulo `Map<tenantId, epochMs>`; se rodou nos últimos ~60s,
   retorna sem tocar o banco.
3. `SELECT` dos quartos `active: true, status: "OCCUPIED"` do tenant, com a hospedagem ativa
   (`checkInDate`) para aplicar `arrumacaoSkipCheckinDay`.
4. `prisma.housekeepingTask.createMany({ data: [...], skipDuplicates: true })` com
   `{ tenantId, roomId, type: "OCCUPIED", status: "PENDING", serviceDate: hoje, assignedAt: null }`
   para cada quarto elegível. O `@@unique([roomId, type, serviceDate])` + `skipDuplicates` garante
   que rodar de novo não cria nada.
5. Limpeza de tarefas obsoletas: `deleteMany` das tarefas `type: "OCCUPIED", serviceDate: hoje,
   status: "PENDING", assignedAt: null` cujo quarto **não está mais** `OCCUPIED` (check-out no meio
   do dia). Tarefas já `IN_PROGRESS`/`DONE`/`SKIPPED` são preservadas (histórico).

Chamado em: `GET /api/housekeeping/rooms` (com o guard), `POST /api/housekeeping/login` (após
autenticar) e no início de `POST /api/housekeeping/rooms/[roomId]/start` (rede de segurança).
Sempre com `tenantId` vindo da sessão — nunca do cliente.

## Mudanças nas rotas de API

### 1. `GET /api/housekeeping/rooms` (reescrever o filtro e o payload)

- Chamar `ensureDailyArrumacaoTasks(session.tenantId)` no início.
- Buscar `room.status` no `select`. Buscar as tarefas do quarto em duas frentes:
  - ativa: `status in [PENDING, IN_PROGRESS]` (como hoje);
  - resolvida hoje: `type: "OCCUPIED", serviceDate: hoje, status in [DONE, SKIPPED]`.
- Nova regra de visibilidade por quarto:

  | Situação do quarto | RECEPTION | QUEUE |
  |---|---|---|
  | `VACANT_CLEAN` / `MAINTENANCE`, sem tarefa ativa | oculto | oculto |
  | `VACANT_DIRTY` | mostra se tarefa `CHECKOUT` atribuída a mim | mostra em "A limpar" se sem tarefa ativa; mostra se `IN_PROGRESS` minha; oculto se `IN_PROGRESS` de outra |
  | `OCCUPIED` com tarefa `OCCUPIED` ativa atribuída a mim | mostra (inalterado) | mostra |
  | `OCCUPIED`, arrumação do dia `PENDING` | (não se aplica) | mostra em "A limpar" (assumível) |
  | `OCCUPIED`, arrumação do dia `IN_PROGRESS` de outra | — | oculto |
  | `OCCUPIED`, arrumação do dia `DONE`/`SKIPPED` | — | mostra em "Resolvidos hoje" |

- Corrigir o rótulo: `type` no payload vem da tarefa real; para quarto `OCCUPIED` sem tarefa é
  `"OCCUPIED"`, não `"CHECKOUT"`.
- Payload por andar passa a ter dois grupos:

  ```jsonc
  {
    "floor": "1",
    "pending":  [ { "id", "number", "category", "roomStatus", "taskId", "type", "status", "notes", "startedAt" } ],
    "resolvedToday": [ { "id", "number", "category", "outcome": "CLEANED" | "DND",
                         "resolvedAt", "resolvedByName", "notes" } ]
  }
  ```

### 2. `POST /api/housekeeping/rooms/[roomId]/start`

- `ensureDailyArrumacaoTasks` no início.
- Se o quarto está `OCCUPIED`: deve existir a tarefa `OCCUPIED` do dia (`PENDING`) — transiciona
  para `IN_PROGRESS` como já faz no caminho da recepção. Se não existir (ex.: dia do check-in com
  `arrumacaoSkipCheckinDay`), cria `type: "OCCUPIED"`, `serviceDate: hoje`, `IN_PROGRESS`.
- Se o quarto está `VACANT_DIRTY`: cria `type: "CHECKOUT"` como hoje (`serviceDate: null`).
- Some o `type: "CHECKOUT"` hardcoded do branch de criação espontânea.
- Mantém a guarda "uma limpeza `IN_PROGRESS` por governanta" e o 409 "já assumido por outra".

### 3. `POST /api/housekeeping/rooms/[roomId]/skip` (NOVO)

- Auth: `getHousekeeperSession`.
- Body: `{ reason?: "DO_NOT_DISTURB", note?: string }` (default `DO_NOT_DISTURB`).
- Valida `roomId` pertencente ao `session.tenantId`. Só para quarto `OCCUPIED`.
- Resolve a tarefa `OCCUPIED` do dia do quarto (chama `ensureDailyArrumacaoTasks` se preciso).
  - `IN_PROGRESS` de outra governanta → 409.
  - `DONE`/`SKIPPED` → 409 "já resolvido hoje".
  - `PENDING` (assumida por mim ou sem dono) ou `IN_PROGRESS` minha → segue.
- `update`/`updateMany` com filtro de tenant na escrita:
  `status: "SKIPPED"`, `skipReason: reason`, `housekeeperId: session.housekeeperId`,
  `finishedAt: now`, `notes: note ?? null`, `startedAt` intacto, `durationSeconds: null`.

### 4. `POST /api/housekeeping/tasks/[id]/finish`

Sem mudança funcional (já trata `OCCUPIED` sem mexer no status do quarto). Só revisar que
`durationSeconds` continua calculado e que não aceita finalizar tarefa `SKIPPED`.

### 5. `GET /api/tenant/room-cleaning-history`

- `where`: `type: "OCCUPIED", status: { in: ["DONE", "SKIPPED"] }, finishedAt: { gte: activeStay.checkInDate }`.
- Cada item retorna `outcome: "CLEANED" | "DND"` (derivado de `status`/`skipReason`), além de
  `housekeeperName`, `finishedAt`, `notes`.

### 6. `GET /api/tenant/housekeeping-tasks`

- Continua retornando `PENDING`/`IN_PROGRESS` em `tasks` (a tela `/app/governance` depende disso).
- Adicionar `dndTodayRoomIds: string[]` — quartos com tarefa `OCCUPIED`, `serviceDate: hoje`,
  `status: SKIPPED` — para o selo "Não perturbe hoje" no Mapa de Quartos.

### 7. `GET /api/tenant/housekeeping-report`

- Incluir `status: { in: ["DONE", "SKIPPED"] }` na busca, mas **separar**:
  - Agregações de quantidade/duração de limpeza continuam só sobre `DONE`.
  - Novo `dndCount` (geral e por governanta) sobre `SKIPPED` com `skipReason: DO_NOT_DISTURB`.
- `recentTasks` inclui as `SKIPPED` com um campo `outcome` para a UI diferenciar.

## Mudanças na UI

### A. App da governanta — `apps/web/src/app/housekeeping/page.tsx`

- Por andar, dois grupos: **"A limpar"** (de `pending`) e **"Resolvidos hoje"** (de `resolvedToday`,
  `<details>` recolhido por padrão).
- Card em "Resolvidos hoje":
  - limpeza: check verde + "Limpo às HH:MM · {governanta}" + observação.
  - não perturbe: ícone 🚫 âmbar + "Não perturbe · HH:MM · {governanta}" + observação.
- Quarto ocupado em "A limpar" usa o rótulo violeta "Arrumação c/ hóspede" (o `type` já vem certo
  depois da correção da API).
- Contador do topo ("N quartos pendentes") conta só "A limpar".
- Segue com o auto-refresh silencioso de 4s já existente.

### B. Tela do quarto — `apps/web/src/app/housekeeping/room/[id]/page.tsx`

- Estado `PENDING`: além de "Iniciar Limpeza" (primário), botão secundário **"Hóspede em Não
  Perturbe"** → diálogo de confirmação ("Isso encerra a arrumação de hoje deste quarto.") + campo
  de observação opcional → `POST /api/housekeeping/rooms/{roomId}/skip` → volta para a lista.
- Mostrar a badge violeta "Arrumação com hóspede no quarto" quando `roomStatus === "OCCUPIED"`.
- Estados `DONE`/`SKIPPED` (se a governanta abrir pelo link): visão só-leitura com o resumo do
  desfecho.

### C. Modal de histórico — `apps/web/src/components/HistoricoLimpezaModal.tsx`

- Renderiza os dois `outcome`. Entrada `DND`: badge "Não perturbe", texto "Registrado por {nome}",
  sem redação de "limpou".
- Título: "Histórico de Governança do Quarto" (subtítulo continua "hospedagem atual").
- Remover o `tenantId="tenant-hoteisnet-demo"` passado da `page.tsx` (a API usa a sessão; o prop
  vira só informativo ou é removido). Mesma limpeza no `fetch` da modal.

### D. Mapa de Quartos — `apps/web/src/app/app/page.tsx`

- Selo "Não perturbe hoje" no card do quarto quando `dndTodayRoomIds` incluir o quarto (vem do
  `syncRoomsFromDatabase`, que já consome `/api/tenant/housekeeping-tasks`).

### E. `/app/governance` — `apps/web/src/app/app/governance/page.tsx`

- Botão "Devolver à fila" no card de um quarto ocupado cujo estado do dia é `SKIPPED` → recria a
  tarefa `PENDING` do dia (`POST /api/tenant/housekeeping-tasks` com `type: OCCUPIED`, ou endpoint
  dedicado `.../reopen`). Só aparece no modo `QUEUE`.
- Remover o `?tenantId=tenant-hoteisnet-demo` do `fetch` de `/api/reservations/rooms` (a API já
  ignora e usa a sessão — apenas cruft).

### F. Configurações — `apps/web/src/app/app/settings/page.tsx` (opcional, pode ser fase 2)

- Sob "Governança de Quartos", quando o modo é "Fila de quartos", dois toggles:
  "Gerar arrumação diária automática dos quartos ocupados" (`autoDailyArrumacao`) e
  "Não gerar arrumação no dia do check-in" (`arrumacaoSkipCheckinDay`). PATCH em
  `/api/tenant/housekeeping-settings`.

## Casos de borda

- **Check-out no meio do dia**: `ensureDailyArrumacaoTasks` apaga a tarefa `PENDING` sem dono do
  quarto que deixou de estar `OCCUPIED`; se já estava `IN_PROGRESS`/`DONE`/`SKIPPED`, preserva.
- **Check-in no meio do dia**: sem arrumação naquele dia (default `arrumacaoSkipCheckinDay`).
- **Concorrência** (duas governantas no mesmo quarto): coberto pelo 409 "já assumido por outra" em
  `start` e pela mesma checagem no `skip`.
- **Fuso/virada de dia**: todo "hoje" via `saoPauloDateOnly()`. SP não tem mais horário de verão,
  mas usar `Intl`/utilitário existente, não offset fixo.
- **Tarefa `OCCUPIED` legada atribuída pela recepção** enquanto o tenant está em `QUEUE`: tratada
  como atribuída (comportamento atual), sem `serviceDate`.
- **Modo alternado `QUEUE` → `RECEPTION`**: tarefas `PENDING` do dia sem dono deixam de aparecer na
  fila (não há fila); a recepção passa a atribuir. Não é preciso limpar nada.

## Ordem de implementação

1. Schema + migration (`SKIPPED`, `HousekeepingSkipReason`, `skipReason`, `serviceDate`, unique,
   índices, 2 campos em `HousekeepingSetting`). `prisma generate`.
2. Helpers `saoPauloDateOnly` (reuso) e `ensureDailyArrumacaoTasks` + wiring (rooms GET com guard,
   login, start).
3. Reescrever o filtro e o payload de `GET /api/housekeeping/rooms`.
4. Corrigir `start` (tipo `OCCUPIED`); criar `POST .../rooms/[roomId]/skip`; revisar `finish`.
5. UI do app da governanta: dois grupos + botão "Não Perturbe" + confirmação.
6. `room-cleaning-history` + `HistoricoLimpezaModal` (entradas DND) + limpeza do `tenantId` mock.
7. `/api/tenant/housekeeping-tasks` (`dndTodayRoomIds`) + selo no Mapa de Quartos.
8. `housekeeping-report` (DND separado) + coluna/ço no relatório em Cadastros → Governantas.
9. (Opcional) toggles em Configurações; botão "Devolver à fila" em `/app/governance`.
10. Testes (abaixo).

## Testes (manuais, no dev server em localhost:3000)

- **Fila — arrumação diária**: tenant em `QUEUE`, 1 quarto ocupado → aparece 1x como "Arrumação
  c/ hóspede"; governanta A assume → some para a governanta B; A conclui → vai para "Resolvidos
  hoje" de A, fica fora de "A limpar" de B; permanece resolvido no resto do dia.
- **Não perturbe**: A abre o quarto, toca "Hóspede em Não Perturbe", confirma → tarefa `SKIPPED`;
  card em "Resolvidos hoje" como DND; aparece no Histórico de Limpeza da hospedagem; selo no Mapa
  de Quartos; contado à parte no relatório; `room.status` continua `OCCUPIED`.
- **Check-out durante o dia** remove a tarefa `PENDING` do dia daquele quarto.
- **Virada de dia** (ajustar relógio/fuso ou dado): quarto ainda ocupado volta para "A limpar".
- **Regressão `RECEPTION`**: atribuição manual, app da governanta, conclusão, histórico e relatório
  — tudo idêntico ao de hoje.
- **Segurança (CLAUDE.md)**: `POST .../rooms/[roomId]/skip` autentica sessão de governanta, valida
  `roomId` do tenant da sessão, escreve com filtro de tenant; `ensureDailyArrumacaoTasks` só usa
  `tenantId` da sessão. Nenhuma rota nova lê `tenantId` do body/query.

## Riscos

- **Escrita em rota `GET`** (`ensureDailyArrumacaoTasks` no rooms GET): mitigado pelo guard de 60s +
  `createMany({ skipDuplicates: true })` idempotente. Se incomodar, mover para um `POST
  .../ensure-daily` chamado uma vez no mount do app + no login.
- **Correção do `type` no payload** pode afetar outros consumidores da rota — `grep` por
  `housekeeping/rooms` antes de mexer (hoje só `page.tsx` e `room/[id]/page.tsx`).
- **Volume**: tenant com muitos quartos ocupados = um `SELECT` + um `createMany` por ciclo de
  geração; o guard de 60s segura o custo do polling de 4s.
- **Relatório**: garantir que `SKIPPED` nunca entre nas médias de duração de limpeza.

-- Preenche reservations."tenantId" com o tenant REAL do quarto
--
-- Por convenção histórica deste projeto toda reserva era gravada com o tenantId fixo "TNT-01",
-- e o isolamento real por hotel vinha sempre de Reservation.room.tenantId. Funcionava, mas o
-- campo de isolamento virou uma armadilha: quem escrevesse o filtro "óbvio"
-- (`where: { tenantId: session.tenantId }`) acertava a sintaxe e errava a semântica.
--
-- Isso já tinha acontecido em apps/web/src/app/api/housekeeping/rooms/route.ts, que buscava as
-- chegadas do dia por `tenantId` e por isso voltava SEMPRE vazia para qualquer hotel cujo id não
-- fosse "TNT-01" (a priorização de limpeza por chegada nunca funcionou), enquanto para o hotel
-- "TNT-01" traria reservas de todos os assinantes.
--
-- A partir daqui o campo passa a valer de verdade: as rotas gravam session.tenantId nas reservas
-- novas e esta migration acerta o histórico. As consultas que já isolam por
-- `room: { tenantId }` continuam corretas e ficam como defesa em profundidade.
--
-- Reservation.tenantId não tem chave estrangeira para tenants, então o UPDATE é seguro; o índice
-- único de "reservationNumber" é global (não por tenant) e também não é afetado.

UPDATE reservations r
SET "tenantId" = rm."tenantId"
FROM rooms rm
WHERE rm.id = r."roomId"
  AND r."tenantId" IS DISTINCT FROM rm."tenantId";

-- Os adiantamentos (sinal) da reserva carregavam o mesmo rótulo fixo.
UPDATE reservation_payments rp
SET "tenantId" = r."tenantId"
FROM reservations r
WHERE r.id = rp."reservationId"
  AND rp."tenantId" IS DISTINCT FROM r."tenantId";

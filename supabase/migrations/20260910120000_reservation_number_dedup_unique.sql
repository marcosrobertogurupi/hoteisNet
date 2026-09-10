-- Deduplicação do número de reserva histórico + índice único
--
-- Complemento da migration 20260910110000 (sequência reservation_number_seq): o número passou a
-- vir da sequência em toda criação nova, mas as reservas antigas geradas com
-- `"RES-" + Math.random()` (500..9499) podem ter duplicatas. Este passo:
--   1) renumera as duplicatas — mantém a mais antiga (menor createdAt, desempate por id) com o
--      número atual e dá um número novo da sequência para as demais;
--   2) cria um índice ÚNICO parcial sobre reservations."reservationNumber" (ignorando NULL),
--      travando duplicatas futuras no banco além da app.
--
-- Reservation.tenantId é sempre "TNT-01" nesta base (convenção histórica — ver
-- apps/web/src/app/api/reservations/route.ts), então unicidade global do número equivale a
-- unicidade por hotel.

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY "reservationNumber"
               ORDER BY "createdAt" ASC, id ASC
             ) AS rn
      FROM reservations
      WHERE "reservationNumber" IS NOT NULL
    ) ranked
    WHERE rn > 1
  LOOP
    UPDATE reservations
    SET "reservationNumber" = 'RES-' || nextval('reservation_number_seq')
    WHERE id = dup.id;
  END LOOP;
END $$;

-- Nome idêntico ao que o Prisma gera para `reservationNumber String? @unique`
-- (`<tabela>_<coluna>_key`), então um `prisma db push` posterior encontra o índice e não recria.
-- Parcial (ignora NULL) — em Postgres um índice único já permite múltiplos NULL; o WHERE só
-- deixa isso explícito e casa com o comportamento do Prisma para coluna nullable.
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_reservationNumber_key"
  ON reservations ("reservationNumber")
  WHERE "reservationNumber" IS NOT NULL;

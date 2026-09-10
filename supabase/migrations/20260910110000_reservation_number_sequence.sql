-- Numeração de reservas — sequência do banco no lugar de "RES-" + Math.random() (500..9499)
--
-- Auditoria do processo de reserva/check-in/check-out (Fase 28 do PRD): o número da reserva era
-- gerado com `"RES-" + Math.floor(500 + Math.random() * 9000)` em 6 lugares (POST /api/reservations,
-- /batch, POST /api/stay/checkin, draft-reservation, waitlist/[id]/convert, agente de IA) — só
-- ~9000 valores possíveis, sem verificação. Num hotel movimentado colisões são praticamente certas
-- ao longo de meses, gerando dois "RES-1234" distintos e atendimento/busca ambíguos.
--
-- A sequência começa em 100000 para nunca colidir com os números aleatórios antigos (500..9499)
-- já gravados. A dedup do histórico + a constraint UNIQUE vivem na migration seguinte
-- (20260910120000).
--
-- IMPORTANTE: `CREATE SEQUENCE IF NOT EXISTS` IGNORA o `START WITH` quando a sequência já existe
-- (ex.: criada antes, sem START, por outra migration/sessão) — por isso o `setval` explícito
-- abaixo: garante que o próximo `nextval` seja >= 100000 mesmo que a sequência já estivesse num
-- valor baixo. `is_called = false` faz o primeiro nextval devolver exatamente 100000.
CREATE SEQUENCE IF NOT EXISTS reservation_number_seq INCREMENT BY 1;

DO $$
BEGIN
  IF (SELECT last_value FROM reservation_number_seq) < 100000 THEN
    PERFORM setval('reservation_number_seq', 100000, false);
  END IF;
END $$;

// Ocupação EFETIVA de uma hospedagem — o maior valor entre a saída prevista e (check-in + diárias
// já lançadas). Cobre overstay: enquanto a recepção não finaliza a hospedagem, a ocupação vai no
// mínimo até o fim do dia em Brasília, mesmo que `dailiesCount` esteja momentaneamente atrasado.
//
// Espelha stayOccupiedUntil de apps/web/src/lib/reservationHelpers.ts — o worker é um processo
// separado que não importa apps/web (compila para CommonJS puro via tsc, sem bundler), então esta
// é a cópia canônica DENTRO do worker. TODO lugar em apps/worker que precisa saber se um quarto
// está ocupado deve importar daqui, nunca reimplementar a checagem com `expectedCheckOut` cru —
// isso já causou uma divergência real (ver histórico de apps/worker/src/operationalAgent.ts).
export function stayOccupiedUntil(stay: {
  checkInDate: Date;
  expectedCheckOut: Date;
  dailiesCount: number;
}): Date {
  const billedThrough = new Date(stay.checkInDate);
  billedThrough.setDate(billedThrough.getDate() + stay.dailiesCount);
  const effective = billedThrough > stay.expectedCheckOut ? billedThrough : stay.expectedCheckOut;
  if (stay.expectedCheckOut.getTime() < Date.now()) {
    return endOfDayBrasilia(new Date(Math.max(effective.getTime(), Date.now())));
  }
  return effective;
}

// Meia-noite (Brasília) do dia seguinte ao da data informada. Usado para "arredondar" a ocupação de
// um overstay para o fim do dia. `en-CA` dá AAAA-MM-DD.
function endOfDayBrasilia(d: Date): Date {
  const ymd = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  return new Date(new Date(`${ymd}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000);
}

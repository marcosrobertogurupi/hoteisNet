// Ancora a meia-noite local de Brasília (UTC-3, sem horário de verão desde 2019) de forma
// independente do fuso horário do processo Node — em produção (Vercel) o servidor roda em UTC,
// então usar getFullYear/getMonth/getDate (fuso do processo) gera referenceDate 3h adiantado
// em relação ao que é criado em ambiente local.
export function dateOnlyBrasilia(d: Date): Date {
  const brDateStr = d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [y, m, day] = brDateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0));
}

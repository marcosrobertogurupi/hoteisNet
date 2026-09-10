// Escapa texto livre antes de interpolar em template HTML (ex.: e-mails), para que um hóspede
// ou operador não consiga injetar markup/links (ex.: nome de hóspede cadastrado com HTML no
// pré-check-in público, depois interpolado sem escape num e-mail enviado pela recepção).
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

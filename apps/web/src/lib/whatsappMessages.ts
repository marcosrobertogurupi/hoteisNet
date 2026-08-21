// Substitui os placeholders suportados nos templates de mensagem de WhatsApp configurados em
// Configurações > Mensagens de WhatsApp (ex: "{HOSPEDE}", "{HOTEL}", "{QUARTO}").
export function renderWhatsappTemplate(
  template: string,
  vars: { hospede?: string; hotel?: string; quarto?: string; dataSaida?: string; horaSaida?: string; link?: string }
): string {
  return template
    .replace(/\{HOSPEDE\}/gi, vars.hospede || "")
    .replace(/\{HOTEL\}/gi, vars.hotel || "")
    .replace(/\{QUARTO\}/gi, vars.quarto || "")
    .replace(/\{DATA_SAIDA\}/gi, vars.dataSaida || "")
    .replace(/\{HORA_SAIDA\}/gi, vars.horaSaida || "")
    .replace(/\{LINK\}/gi, vars.link || "");
}

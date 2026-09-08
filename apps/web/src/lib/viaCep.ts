// Consulta de CEP no ViaCEP (serviço público dos Correios). Usado no cadastro de assinante do
// painel admin para resolver cidade/UF a partir do CEP — regra do projeto: cidade/UF nunca são
// digitadas à mão, sempre vêm do CEP (ver CLAUDE.md e memória tenant-is-the-windev-hotel-cadastro).
//
// Nunca lança: em falha de rede / CEP inexistente devolve null e o caller decide o que fazer.

export interface ViaCepResult {
  cep: string;
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

export async function lookupCep(rawCep: string | null | undefined): Promise<ViaCepResult | null> {
  const cep = String(rawCep || "").replace(/\D/g, "");
  if (cep.length !== 8) return null;

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      headers: { Accept: "application/json" },
      // O cadastro de assinante não é caminho quente; um timeout curto evita travar a requisição.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.erro) return null;
    return {
      cep,
      street: data.logradouro || null,
      neighborhood: data.bairro || null,
      city: data.localidade || null,
      state: (data.uf || "").toUpperCase() || null,
    };
  } catch {
    return null;
  }
}

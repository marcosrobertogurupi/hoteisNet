// Política mínima de senha do SaaS, aplicada em TODO ponto que grava uma senha (usuários do hotel,
// colaboradores, governantas, equipe da plataforma). Antes cada endpoint checava por conta própria
// apenas "pelo menos 6 caracteres", sem exigência de complexidade e sem barrar as senhas óbvias —
// o que torna a força bruta e o preenchimento de credenciais vazadas muito mais baratos.
//
// A regra é deliberadamente simples de explicar ao usuário: comprimento mínimo, pelo menos uma
// letra e um número, e nada que esteja na lista de senhas manjadas.

export const MIN_PASSWORD_LENGTH = 10;

// Senhas triviais mais usadas em ataques de credential stuffing, incluindo as variantes em
// português que aparecem em cadastros brasileiros. Comparação em minúsculas.
const COMMON_PASSWORDS = new Set([
  "123456789",
  "1234567890",
  "12345678910",
  "senha123456",
  "senhasenha",
  "password123",
  "password1234",
  "qwerty123456",
  "abc123456789",
  "hoteisnet123",
  "administrador",
  "admin123456",
  "recepcao123",
  "pousada123456",
  "hotel1234567",
  "iloveyou123",
  "primeiroacesso",
  "mudar123456",
  "trocar123456",
]);

/**
 * Devolve `null` quando a senha é aceitável ou a mensagem de erro a devolver ao usuário.
 * Sempre em português e explicando o que falta, para a tela poder exibir direto.
 */
export function validatePasswordStrength(password: unknown, { minLength = MIN_PASSWORD_LENGTH } = {}): string | null {
  const value = String(password ?? "");

  if (value.length < minLength) {
    return `A senha deve ter pelo menos ${minLength} caracteres.`;
  }
  if (!/[A-Za-zÀ-ÿ]/.test(value)) {
    return "A senha deve conter pelo menos uma letra.";
  }
  if (!/[0-9]/.test(value)) {
    return "A senha deve conter pelo menos um número.";
  }

  const normalized = value.toLowerCase();
  if (COMMON_PASSWORDS.has(normalized)) {
    return "Esta senha é fácil de adivinhar. Escolha outra.";
  }
  // Sequências e repetições puras ("1111111111", "abcdefghij") passam pelas regras acima mas são
  // igualmente triviais.
  if (/^(.)\1+$/.test(value)) {
    return "Esta senha é fácil de adivinhar. Escolha outra.";
  }

  return null;
}

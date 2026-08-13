# Diretrizes e Regras Gerais do Projeto HoteisNet

## Consulta Obrigatória ao Projeto Antigo (WinDev)
- Para a implementação de qualquer funcionalidade no novo projeto, é **regra geral obrigatória** consultar o arquivo de documentação/especificação das funções do projeto antigo localizado em:
  `C:\Progs\Principal\Antigravity\HoteisNet\PROJETO WINDEV\Impressao do projeto.pdf` (ou `Impressao do projeto.dbf`).
- Todas as funções, regras de negócio e rotinas detalhadas no projeto antigo original servem como referência fundamental e devem ser analisadas e seguidas na construção do novo sistema SaaS.

## Idioma Obrigatório das Respostas e Documentações
- Todas as respostas, explicações, planos de implementação (implementation_plan.md), walkthroughs e documentações geradas devem ser escritas obrigatoriamente em **Português (PT-BR)**.

## Validação de Código e Preservação do Servidor de Dev
- **NUNCA executar `npm run build` ou `next build`** enquanto o servidor de desenvolvimento (`next dev`) estiver ativo para o usuário, pois a compilação de produção sobrescreve o diretório `.next` e corrompe os chunks de CSS/JS do ambiente de desenvolvimento ativo (causando erro 500 ou exibição de HTML sem estilos no navegador).
- Para validação de código e tipos em tempo de desenvolvimento, utilize sempre **`npx tsc --noEmit`**.

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

## Proibição de Dados Mockados / Fictícios
- **NUNCA utilizar dados mockados, fictícios ou estáticos no frontend ou backend.**
- Todos os dados exibidos no SaaS (quartos, reservas, hospedagens, caixa, estoques, tarifas, governança, etc.) devem ser originados **estritamente e fielmente do banco de dados (Supabase/PostgreSQL)**.
- Quando o banco de dados estiver vazio ou uma consulta retornar zero registros, a interface deve exibir um estado limpo/vazio (ex: *"Nenhum registro encontrado"*), jamais recorrendo a fallbacks com objetos estáticos mockados.

## Manutenção Obrigatória do PRD.md
- O arquivo `PRD.md` (raiz do projeto) é o documento oficial de referência e consulta do projeto e **deve ser mantido sempre atualizado**.
- Sempre que uma funcionalidade nova for implementada, alterada ou removida, ou o roadmap/fases de desenvolvimento avançarem, o `PRD.md` deve ser atualizado no mesmo momento (seções de Especificação das Funcionalidades e Roadmap, entre outras pertinentes) para refletir fielmente o estado real do sistema.
- O `PRD.md` nunca deve ficar desatualizado em relação ao código; ele serve como fonte de consulta confiável sobre o que já existe e o que ainda está pendente no projeto.

## Segurança, Auditoria e Integridade de Dados (Banco de Dados)
- Este SaaS funciona **24/7 em nuvem**, com múltiplos usuários acessando e alterando dados simultaneamente e online. Por isso, **toda implementação que envolva consulta, alteração, inclusão ou exclusão no banco de dados deve ser tratada como uma operação crítica.**
- **Transações obrigatórias:** qualquer operação que grave, altere ou apague dados (principalmente quando envolver mais de uma tabela ou passo) deve ser executada dentro de uma transação de banco de dados (`BEGIN`/`COMMIT`/`ROLLBACK`), garantindo que, em caso de falha, queda de conexão ou erro durante a gravação, nenhuma alteração parcial fique persistida.
- **Rollback de segurança obrigatório:** todo processo de escrita no banco precisa prever rollback automático em caso de erro, exceção ou perda de conexão no meio da operação, evitando dados incompletos, duplicados ou inconsistentes.
- **Auditoria obrigatória:** operações sensíveis (inclusão, alteração e exclusão de dados de reservas, hospedagens, caixa, financeiro, estoque, tarifas, etc.) devem ser registradas em log de auditoria, contendo no mínimo: usuário responsável, data/hora, tipo de operação, dados antes/depois (quando aplicável) e origem da requisição.
- **Validação antes de persistir:** os dados devem ser validados (tipos, obrigatoriedade, regras de negócio) antes de qualquer gravação no banco, evitando dados incorretos ou inconsistentes serem salvos.
- **Confirmação de gravação:** o frontend/backend não deve assumir sucesso de uma operação de escrita sem confirmação explícita do banco; em caso de falha ou timeout de conexão durante o salvamento, a operação deve ser revertida (rollback) e o usuário deve ser informado do erro, nunca ficando com a impressão de que os dados foram salvos quando não foram.
- **Consultas seguras:** consultas ao banco devem sempre passar por camadas que previnem SQL injection (uso de queries parametrizadas/ORM), e o acesso a dados sensíveis deve respeitar as permissões do usuário autenticado.
- Essas regras se aplicam a **toda e qualquer funcionalidade** do sistema (reservas, hospedagens, caixa, financeiro, estoque, tarifas, governança, suporte, etc.), sem exceção.


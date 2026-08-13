# Templates de PRD

Duas variações. Use a que corresponde à trilha. Corte seções que não se aplicam — um PRD com seções vazias treina o leitor a ignorar seções.

---

## Variação A — Projeto novo

```markdown
# PRD — [Nome do produto]

**Versão:** 1.0 · **Data:** [data] · **Status:** pronto para execução

## 1. Resumo
[2 a 4 frases: o que é, para quem, qual dor resolve.]

## 2. Contexto e problema
Como o usuário resolve isso hoje e por que a solução atual não serve.

## 3. Usuários
| Perfil | Descrição | O que faz no sistema |
|---|---|---|

## 4. Escopo do MVP
### Dentro
1. **[Feature]** — o que é e por que é essencial
2. ...

### Fora de escopo (v1)
- [Item] — motivo / adiado para quando

## 5. Fluxo principal
Passo a passo do caminho feliz, do primeiro acesso ao objetivo cumprido.

## 6. Requisitos funcionais
Numerados e verificáveis.

**RF-01 — [Título]**
- Descrição
- Critérios de aceite:
  - [ ] [condição verificável]
  - [ ] [condição verificável]
- Casos de erro: [o que acontece quando dá errado]

## 7. Modelo de dados
Entidades, campos principais e relacionamentos.

## 8. Regras de negócio
Numeradas. As não-óbvias, específicas do domínio.

## 9. Requisitos técnicos
- Stack e versões
- Autenticação e autorização
- Integrações externas
- Hospedagem e ambientes
- Requisitos não-funcionais (performance, segurança, LGPD, acessibilidade)

## 10. Critérios de conclusão
Como saber que o MVP está pronto para uso real.

## 11. Pontos em aberto
Lista de `[A DEFINIR]` que precisam de decisão antes ou durante a execução.
```

---

## Variação B — Projeto existente

```markdown
# PRD — [Nome do projeto]: [nome do conjunto de melhorias]

**Versão:** 1.0 · **Data:** [data] · **Status:** pronto para execução

## 1. Resumo
O que muda e por quê, em 2 a 4 frases.

## 2. Estado atual do sistema
- **Stack:** [linguagens, frameworks, versões]
- **Arquitetura:** [descrição curta]
- **Áreas afetadas:** [caminhos de arquivo reais]
- **Convenções a respeitar:** [padrões observados no código]

## 3. Melhorias solicitadas
| # | Melhoria | Tipo | Prioridade |
|---|---|---|---|
| M1 | | feature / bug / refactor / perf / UX | alta/média/baixa |

## 4. Detalhamento

### M1 — [Título]
**Hoje:** [comportamento atual, com referência a arquivo]
**Depois:** [comportamento esperado]
**Por quê:** [motivação]

**Critérios de aceite**
- [ ] [verificável]
- [ ] [verificável]

**Casos de borda:** [dados legados, usuários em fluxo, formatos antigos]
**Arquivos envolvidos:** `caminho/do/arquivo.ts`

[Repetir para cada melhoria]

## 5. Impacto técnico
- **Migrations:** [há mudança de schema? o que acontece com os dados existentes?]
- **Compatibilidade:** [quebra API/integrações? precisa de retrocompatibilidade?]
- **Dependências novas:** [pacotes a adicionar e por quê]
- **Risco:** [o que pode dar errado e como mitigar]

## 6. Fora de escopo
- **Não alterar:** [arquivos/módulos intocáveis]
- **Não fazer:** [melhorias adjacentes tentadoras que ficam para depois]

## 7. Plano de execução
Etapas revisáveis, em ordem, com critério de "pronto" para cada uma.

1. **Etapa 1 — [nome]:** [escopo] → pronto quando [condição]
2. ...

## 8. Validação
Como testar: automatizado, roteiro manual, métrica de sucesso.

## 9. Pontos em aberto
Lista de `[A DEFINIR]`.
```

---

## O que faz um PRD funcionar com agente de código

- Cada requisito tem critério de aceite marcável — o agente consegue autoavaliar
- Caminhos de arquivo reais em vez de descrições abstratas de camadas
- Casos de erro escritos, não subentendidos
- "Fora de escopo" explícito, que evita iniciativa indesejada
- `[A DEFINIR]` visível em vez de suposição silenciosa

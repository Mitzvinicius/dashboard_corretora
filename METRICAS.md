# Definições de métricas — Comparativo, Retenção e Exibição TV

> Registro das regras de negócio acordadas em **10/09/2026**. O foco aqui são as
> definições e o *porquê* delas — o código muda, o critério não deveria mudar sem
> decisão explícita. Complementa o `SKILL.md`, que cobre arquitetura e integração.

---

## 1. Modelo de dados — o que faltava mapear

Três descobertas que invalidavam premissas do código antigo.

### 1.1 A coluna `SITUAÇÃO` tem seis valores, não três

O código só conhecia `Ativa`, `Cancelada` e `Vencida`. A planilha emite também:

| Situação | Significado |
|---|---|
| `Ativa` | Vigente hoje |
| `Renovada` | **A apólice antiga**, cuja sucessora nasceu como `Ativa` |
| `Vencida` | Chegou ao término e **não** foi renovada |
| `Cancelada` | Encerrada no meio da vigência |
| `Suspensa` | Suspensa |
| `Perda Total` | Encerrada por sinistro integral |

**A consequência mais importante:** a planilha já carrega o desfecho de cada apólice.
Não é preciso casar chave nenhuma para saber se uma apólice renovou — basta ler a
situação da linha antiga.

**A armadilha:** como `Renovada` é a linha *antiga* e a vigente é uma linha nova
`Ativa`, contar as duas juntas duplica o mesmo contrato. Por isso `Renovada` fica
fora de toda base de carteira.

Constantes em `main.js`: `SIT`, `SIT_DESFECHO_RENOVACAO`, `SIT_CHURN_PERDA`,
`SIT_CHURN_UNIVERSO`.

### 1.2 Colunas `APÓLICE` e `ENDOSSO`

Ambas passaram a ser mapeadas em `COL`.

> ⚠️ **`APÓLICE` não é chave única.** Endossos e faturas repetem o número da
> apólice-mãe a que estão vinculados e se distinguem pela numeração própria em
> `ENDOSSO`. Nunca usar `apolice` como identificador único de contrato.

Para isolar a apólice em si existe `isApolice(r)`: **sem número de endosso** *e*
`TIPO DOCUMENTO = 'APÓLICE'`. Cruza as duas fontes porque elas divergem em
registros legados.

---

## 2. Taxa de renovação (aba Comparativo)

### O que era

```js
qtd(tipo === 'R') / (qtd(tipo === 'R') + qtd(tipo === 'CR'))
```

Numerador e denominador do mesmo período, sem ano-base e sem rastreio de apólice.
Media *"dos movimentos de renovação lançados, quantos não foram cancelados"* —
otimista por construção, porque ignorava a apólice que venceu e não voltou.

### O que é

**Safra** (`getCompSafraData`) — a linha entra se **todas** valem:

| Critério | Regra |
|---|---|
| É apólice, não endosso | `isApolice(r)` |
| Tipo de negócio | `tipo ∈ {N, R}` |
| Venceu no período | **`fim`** (término de vigência) dentro do período |
| Chegou ao desfecho | `sit ∈ {Renovada, Vencida}` |

```
taxa de renovação = Renovadas ÷ (Renovadas + Vencidas)
```

`Ativa`, `Cancelada`, `Suspensa` e `Perda Total` ficam **fora da base** — saíram por
evento alheio à renovação (ou ainda nem venceram), então não eram candidatas.
Incluí-las diluiria a taxa com perdas que não são falha de renovação.

**Âncora em `fim`, não em `vig`.** É o único card da aba com esse recorte — todos os
outros usam início de vigência. A diferença está no `title` do card justamente para
o número não parecer incoerente com os vizinhos.

> **Cuidado com a inversão:** `Vencidas ÷ (Renovadas + Vencidas)` é a taxa de
> **perda**, o complemento. O card mostra o **aproveitamento**; as contagens cruas
> ficam no rodapé para as duas leituras coexistirem.

Casos-limite: base zerada no período → `—` (não `0%`); período anterior sem base →
valor exibido mas badge de variação `—`, para não inventar um `▲ 100%` contra zero.

---

## 3. Churn (aba Retenção)

### O que era

Denominador: tipos `R, N, ER, EN` com `sit = Ativa`.
Numerador: linhas de tipo `CN`/`CR` (os *endossos* de cancelamento).
`Vencida` não entrava no churn — só aparecia como KPI solto.

### O que é

| | Regra |
|---|---|
| **Universo** (denominador) | apólices (`isApolice`), tipo `N`/`R`, `sit ∈ {Ativa, Cancelada, Vencida}` |
| **Perda** (numerador) | `sit ∈ {Cancelada, Vencida}` |
| **Fora dos dois lados** | `Renovada`, `Suspensa`, `Perda Total` |

`Renovada` fora porque sua sucessora já está contada como `Ativa`.
`Suspensa` e `Perda Total` fora pela mesma regra da taxa de renovação — coerência
entre as duas métricas.

Implementado num agregador único (`newChurnAcc` / `accChurn` / `isChurnBase`)
consumido pelos **quatro** pontos que antes divergiam entre si:

1. KPIs da Retenção (`renderRetKPIs`)
2. Tabela de churn por produtor (`renderRetProdTable`)
3. Export Excel (`exportData('churn')`)
4. **Score de risco de churn** (`calcRiskRates`) — incluído para o dashboard não
   exibir uma taxa e pontuar o risco por outra

Rótulos que mudaram junto: `"Apólices ativas (base)"` → `"Apólices na base"` (o
denominador não é mais só ativas); no export, `"CR+CN (qtd)"` → `"Perdidas
(canc+venc)"`, com coluna `Ativas` nova.

---

## 4. Filtros globais na aba Comparativo

Os dois caminhos de dados passam pelo mesmo predicado, `matchesCompScope()` —
colaborador, grupo, ramo, seguradora, tipo de documento e emissão:

- `getCompData()` → 15 cards, gráfico e ranking, ancorados em **início** de vigência
- `getCompSafraData()` → taxa de renovação, ancorada em **término**

**Vigência global dirige o período da aba.** Precedência: override manual da aba
(botão *Comparar*, flag `compPeriodManual`) → vigência global → default
(1º de janeiro até hoje). O botão *↺ Seguir filtro global* volta ao automático.

**Emissão desloca −1 ano** no período anterior (`shiftEmissaoRangeToPrevYear`),
igual à vigência. Sem isso o período-base zeraria e toda variação viraria `+100%`.

A linha **ESCOPO** no cabeçalho da aba lista em chips quais filtros globais estão
recortando os números.

---

## 5. Tabela por seguradora e ramo — visualizações

Três modos (`compPivotView`), via `buildCompPivotRows()`:

| Modo | Conteúdo |
|---|---|
| `seg` | só as seguradoras |
| `ramo` | ramos **somados entre todas as seguradoras** |
| `ambos` | hierárquico, com recolhimento por seguradora (padrão) |

O modo `ramo` **reagrupa** de verdade; filtrar a hierarquia repetiria o mesmo ramo
uma vez por seguradora. No modo `ambos` há recolher/expandir individual (clique na
linha da seguradora) e em massa. O **export segue a visualização em tela**,
inclusive grupos recolhidos, para o arquivo não contradizer o que está à vista.

---

## 6. Exibição TV — colaboradores excluídos

```js
const TV_COLAB_EXCLUIDOS = ['CELSO', 'DENISE', 'ALESSANDRA', 'TRANSFERENCIA'];
```

Match por `normRamo(colab).startsWith(nome)` — prefixo do nome normalizado.

`TRANSFERENCIA` **não é pessoa**: é a pseudo-carteira de transferência de
corretagem, que entra como produção sem ser venda nova. Inflava o realizado e, por
tabela, a meta do mês (mesmo mês do ano anterior × 1,40).

Está como prefixo curto, e não `'TRANSFERENCIA CORRETAGEM'`, porque o match é
`startsWith`: a string cheia deixaria passar *"Transferência **DE** Corretagem"*
silenciosamente, e o erro só apareceria como número errado no telão.

Afeta os **três** consumidores da lista, todos dentro da Exibição TV: gráfico da
meta mensal, cards da campanha 360 e pódio Top 3. Nada fora da Exibição TV.

---

## 7. Pendências e decisões em aberto

- **Análise de coortes** (`renderCohorts`) segue na regra antiga: rastreia queda mês
  a mês por `sit === 'Cancelada' && r.cancel`, ou seja, depende da *data* do evento.
  `Vencida` não tem data própria — o equivalente seria o `fim`. Incluir muda a
  natureza do gráfico (misturaria cancelamento no meio da vigência com
  não-renovação no vencimento). **Não decidido.**
- **Tabela de detalhe da Retenção** filtra por `CN`/`CR`/`Vencida`, então
  `Renovada`, `Suspensa` e `Perda Total` nunca chegam nela. Os estilos de badge já
  existem para as seis situações; falta decidir se devem aparecer.
- **Cross-sell e contagem de ativas da Exibição TV** filtram `sit === 'Ativa'`.
  Excluir `Renovada` provavelmente está certo (a sucessora é que é a vigente), mas
  não foi auditado.
- **`.claude/launch.json`** aponta para `python -m http.server`, e o `python` do PATH
  é o stub da Microsoft Store — o preview não sobe. Alternativa:
  `npx http-server . -p 5500 -c-1`.
- **Branch `att_comparativo`** ficou apontando para `67f8a84`, atrás da `main`.

---

## Commits

| Commit | Conteúdo |
|---|---|
| `67f8a84` | Aba Comparativo: filtros globais no gráfico, 16 KPIs em 4 blocos, taxa de renovação por safra, ranking "Maiores variações", churn por situação, visualizações da tabela pivô |
| `a3d522f` | Ignora `.idea/`; remove `conversor_rd_ghl.html` (RD Station, em desuso desde 19/08/2026) |
| `5bb7d8b` | Exibição TV: exclui transferência de corretagem dos gráficos |

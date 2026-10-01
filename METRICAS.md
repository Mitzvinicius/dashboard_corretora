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
| `Perda Total` | Encerrada por sinistro integral. A planilha também emite `Perda total`; `normSit` padroniza a caixa na leitura |

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

> Revisado em **28/09/2026**. A versão anterior somava as `Ativa` de hoje com
> **todas** as `Cancelada`/`Vencida` da história — um estoque dividido por um fluxo,
> sem período. O churn crescia só por a planilha ter mais anos.

Churn passou a ser **de um período** (filtro *Período de análise* da aba, padrão
1º de janeiro até hoje):

```
churn = perdidas no período ÷ apólices em vigor em algum dia do período
```

**Saída** de uma apólice: `DATA CANCELAMENTO` se `Cancelada` (cai no término se a
data faltar); `TÉRMINO DE VIGÊNCIA` nas demais situações.

| | Regra |
|---|---|
| **Base** (denominador) | apólices (`isApolice`), tipo `N`/`R`, `sit ∈ {Ativa, Renovada, Cancelada, Vencida}`, com início ≤ fim do período **e** saída ≥ início do período |
| **Exceção na base** | `Renovada` com término ≤ fim do período fica fora — a sucessora já nasceu dentro do período e está contada |
| **Perda** (numerador) | `sit ∈ {Cancelada, Vencida}` com saída **dentro** do período |
| **Retida** | na base e não perdida no período (inclui quem cancelou/venceu depois do fim) |
| **Churn só cancelamento** | mesma base; no numerador, só as `Cancelada` com saída no período (sem as `Vencida`). Linha própria de cards na aba (itens, prêmio, comissão), abaixo da linha do churn total; coluna *% Só cancel.* na tabela por produtor e três colunas no export |
| **Fora dos dois lados** | `Suspensa`, `Perda Total` |
| **Ramos fora** | os mesmos excluídos da meta (`classifyRamo(r.ramo) === 'excluded'`, lista em `META_EXCLUDED_KEYS`): viagem, carta verde, acidentes pessoais, previdência, VGBL, eventos aleatórios, transporte nacional e educacional. Vale para todos os painéis da aba e o seletor de ramo nem os oferece |

**Por que a `Renovada` voltou para a base.** Olhando um período passado, a apólice
que renovou *depois* dele era a linha que representava o contrato ali — sem ela o
contrato sumia da base daquele ano. A regra do término resolve a duplicidade: cada
contrato entra uma vez, pela última apólice que começou até o fim do período.

Limite conhecido: renovação cujo término da antiga cai no último dia do período e a
sucessora começa no dia seguinte some da base daquele período. É raro e não
compensa casar chave de apólice para evitar.

Os gráficos e o detalhe apólice a apólice listam as mesmas perdas dos KPIs
(`isChurnBase` + `isChurnPerda`), então os totais batem: o detalhe mostra *X perdidas*
igual ao card, e o gráfico de motivos soma as canceladas do card. A evolução mensal
agrupa pelo mês da saída, com eixo em ano-mês do início ao fim do período.
Os endossos CN/CR não aparecem mais no detalhe — o motivo deles já foi levado para a
apólice (`applyMotivoEndosso`). Os botões de tipo CR/CN saíram da aba: a base só
aceita N/R, então eles zeravam os KPIs.

### Churn evitável (filtro *Só evitável*, ligado por padrão)

Para medir o churn que o colaborador tinha como evitar (metas trimestrais), o
cancelamento não evitável — pelo motivo (lista `MOTIVOS_NAO_EVITAVEIS`) ou por ter
sido troca de seguradora — sai de **base e perda**, em
todos os painéis da aba (`isCancelNaoEvitavel`, aplicado em `getRetData`):

| Grupo | Motivos |
|---|---|
| O bem saiu do cliente | venda do veículo, venda do imóvel |
| O contrato continuou | apólice reemitida, emitida nova proposta |
| Erro operacional | emissão indevida, apólice cancelada por erro de emissão, dados incorretos, dados do veículo incorreto |
| Sinistro integral | perda total, cancelamento de apólice – sinistro inden. |
| Outros | falecido |

**Sem motivo conta como evitável** (decisão de 28/09/2026). Também evitáveis:
solicitação do segurado, a pedido do cliente, falta de pagamento, pedido do corretor,
restrições técnicas/financeiras. Com o filtro ligado, o card *Churn — Itens* mostra
também a taxa com todos os motivos e quantos saíram pelo motivo e pela troca de
seguradora (abaixo).

**Motivo vem primeiro do endosso.** O Quiver costuma gravar o motivo no endosso de
cancelamento (CN/CR), não na apólice: em 2026, 23 apólices canceladas só tinham
motivo no endosso. `applyMotivoEndosso` copia para a apólice o motivo do endosso mais
recente (vínculo seguradora + número da apólice); o motivo da própria apólice só vale
sem endosso com motivo. Vale para o dashboard inteiro, não só para a Retenção.

**Troca de seguradora pelo saldo do cliente** (`applyTrocaSeguradora`). É prática da
corretora cancelar a apólice e reemitir em outra cia — muitas vezes como `R`, para
aproveitar o bônus de renovação — e o motivo quase nunca registra isso. A regra
compara o número de apólices do cliente (CPF/CNPJ + ramo):

- **antes** = a cancelada + as outras em vigor 15 dias antes do cancelamento (a nova
  costuma nascer uns dias antes de o cancelamento ser lançado), ou no início da
  cancelada se ela começou depois disso
- **depois** = as em vigor 90 dias depois do cancelamento — ou hoje, enquanto os 90
  dias não passaram (a cancelada recente conta como perda até a troca aparecer)

`depois ≥ antes` → troca, não evitável. Cobre também o caso do bônus aproveitado em
dois itens (2 apólices, 1 cancela, sai 1 R + 1 N, saldo 3). A marca `r.trocaSeg` vai
na apólice e nos endossos CN/CR dela.

A apólice cancelada entra sempre no *antes*, mesmo cancelada no próprio dia do
início: em 2026, 19 foram canceladas antes de começar a vigorar.

Em 2026 (149 apólices canceladas, ramos da meta): 58 trocas (5 com saldo maior),
91 com saldo menor. Combinando motivo e saldo, sobram 77 cancelamentos evitáveis — o
churn de itens cai de 2,64% (todos) para 1,43% (só evitável).

Limites conhecidos: cada cancelamento é avaliado sozinho, então dois cancelamentos do
mesmo cliente e ramo na mesma janela compartilham o saldo (6 casos em 2026); e uma
vencida de outro item do cliente dentro da janela derruba o *depois*, fazendo a troca
parecer perda.

Implementado num agregador único (`newChurnAcc` / `accChurn` / `isChurnBase`)
consumido pelos pontos que antes divergiam entre si:

1. KPIs da Retenção (`renderRetKPIs`)
2. Tabela de churn por produtor (`renderRetProdTable`)
3. Export Excel (`exportData('churn')`)
4. Gráficos e detalhe da Retenção (`renderRetCharts`, `getRetDetailRows`)

A Visão Geral calculava um churn (`canceladas ÷ linhas`) que nenhum card exibia;
o cálculo foi removido.

**A taxa de churn do Comparativo tem regra própria** (decisão de 28/09/2026), porque a
aba compara com o ano anterior (`calcChurnComp`):

```
churn = 1 − renovações (R) do período ÷ apólices N + R do mesmo período do ano anterior
```

Conta apólices (`isApolice`, sem endossos/faturas), em **todos os ramos**, com os
filtros globais; as duas pontas ancoradas no início de vigência. O valor do período
anterior faz a mesma conta um ano antes (usa o período de dois anos atrás como base).
Pode ficar negativo quando entram mais renovações do que havia de base — renovação
de apólice vinda de outra corretora, por exemplo. Antes era `(CN + CR) ÷ produção`.

O painel *Apólices em risco de não renovação* (score por seguradora/ramo/colaborador)
e a *Análise de coorte* foram removidos da aba em 28/09/2026: não traziam dado
confiável para o momento da empresa.

Rótulos que mudaram junto: `"Apólices ativas (base)"` → `"Apólices na base"` (o
denominador não é mais só ativas); no export, `"CR+CN (qtd)"` → `"Perdidas
(canc+venc)"`. Na revisão de 28/09: `Ativas` → `Retidas`, colunas `Período` e
`Canceladas` novas, e `"Comissão estorno"` → `"Comissão perdida"` (vencida não gera
estorno, então o nome antigo inflava o que era estorno de fato).

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

## 6.1 Exibição TV — carteira acumulada por ano

Gráfico *"Carteira acumulada — apólices ativas por ano"* (`buildTvAnoCarteira`).

**Anos fechados** são um retrato por data, não pelo status de hoje: para cada ano
Y, conta as apólices que já tinham vigência iniciada e ainda não tinham terminado
ou sido canceladas em 31/12 de Y. Usa `vig`/`fim`/`cancel`, nunca `sit` — o status
atual só descreve o presente, e uma apólice em vigor em 2022 hoje aparece como
"Renovada".

**O ano corrente é o retrato de hoje:** a carteira ativa inteira (`sit === 'Ativa'`),
venha a apólice do ano que vier. Antes contava só o que tinha vigência iniciada
dentro do próprio ano, o que fazia a última barra parecer uma queda da carteira
quando era só o ano ainda não ter fechado. Contar por `sit === 'Ativa'` (e não pela
janela `vig→fim` em hoje) evita contar duas vezes o contrato renovado com
antecedência — ver §1.1.

### O que não entra na carteira

Dois filtros, por motivos diferentes:

```js
const TV_CARTEIRA_MIN_DIAS = 350;                          // duração
const TV_CARTEIRA_RAMOS_FORA = ['VIAGEM', 'CARTA VERDE'];  // ramo
```

A **duração** tira o que é temporário/acessório (vigência menor que ~12 meses).
Sozinha ela não bastava: tem o furo do `!r.fim` — apólice sem término de vigência
preenchido passa por qualquer ramo — e viagem anual (multi-viagem) dura 365 dias.

Daí o filtro por **nome do ramo**, decidido em 22/09/2026: viagem e carta verde não
são carteira recorrente e não devem contar como apólice ativa no telão.

A lista é curta de propósito e **não** é o `classifyRamo() === 'excluded'` da aba
Metas. Aquela lista também derruba acidentes pessoais, previdência/VGBL, eventos
aleatórios, transporte nacional e educacional — que ficam fora da *meta*, mas
continuam sendo carteira de verdade e seguem contando aqui.

O filtro vale para **todos os anos**, inclusive os fechados, senão a série
compararia critérios diferentes entre uma barra e outra.

### Crescimento ano a ano

Cada barra traz, acima do valor, a variação percentual contra a barra anterior
(verde pra cima, vermelho pra baixo), no mesmo formato da faixa de variação do
gráfico mensal. O primeiro ano da série não tem com o que comparar e fica sem o
rótulo; ano seguinte a um zerado também, porque não há base para o percentual.
O tooltip repete a variação com a diferença absoluta e o ano de referência.

Vale só neste gráfico. Em "Clientes por nível" as barras são faixas, não uma série
temporal — comparar o nível 2 com o nível 1 não significaria nada.

### Onde mais o critério vale

Os dois filtros valem também em **"Clientes por nível"** (`tvExClientes`), que conta
apólices ativas por cliente para atribuir o nível. É o mesmo painel: sem isso, um
cliente subiria de nível por duas apólices de viagem enquanto o gráfico ao lado as
ignora.

Fora da Exibição TV nada muda — a aba **Cross-sell** tem a sua própria contagem de
apólices ativas (`buildCrossMap`), sem filtro de duração nem de ramo, e segue assim.

---

## 8. Seguros saúde — planilha `saude_fernando.xlsx`

O ERP não consegue lançar a remuneração do saúde: **agenciamento** (antecipação sobre o
prêmio líquido das 3 primeiras parcelas) e depois **2% ao ano** sobre o saldo. Por isso a
apólice chega na produção com prêmio e comissão **zerados** e não somava em meta nenhuma.

Os valores do contrato vêm de `saude_fernando.xlsx`, na mesma pasta Dashboard do
SharePoint. O nome não começa com `producao`, então o arquivo não é lido como planilha
de produção. O modelo com os cabeçalhos pode ser baixado no painel **Fontes**.

É uma linha por contrato:

| Campo no dash | Origem |
|---|---|
| prêmio | `PRÊMIO LÍQUIDO`, como está — já é o total do contrato |
| comissão | `TOTAL RECEBIDO` (se vazio: `AGENCIAMENTO R$ + COMISSÃO R$`) |

`PARCELA` (valor mensal), `QTD. PARCELAS`, `% AGENCIAMENTO` e `% COMISSÃO` só alimentam
as fórmulas da própria planilha; o dash não as lê.

Até 25/09/2026 o dash multiplicava `PRÊMIO LÍQUIDO` por `QTD. PARCELAS`. Como a
planilha já traz o total ali, o prêmio saía 24 vezes maior: mais de R$ 3 milhões
desde julho.

Valor vazio, zero ou negativo não sobrescreve o que já veio do ERP. Linha sem prêmio e sem
comissão é ignorada, com aviso.

### Vínculo com a produção (`applySaudeManual`)

- **1ª tentativa, `APÓLICE`:** busca entre as linhas de ramo Saúde. A linha que recebe os
  valores é a apólice em si, N ou R, com preferência para `isApolice`. Quando há
  renovações com o mesmo número, `TIPO DE NEGÓCIO` e `INÍCIO DE VIGÊNCIA` desempatam.
- **2ª tentativa, sem apólice ou com apólice ainda não cadastrada no ERP:** o saúde
  costuma existir na produção como linha N de ramo Saúde **sem número de apólice e sem
  data de emissão**. A busca é pelo `CPF/CNPJ` (se vazio, pelo nome do cliente), com
  início de vigência a até 31 dias do informado. Sem vigência na planilha, só vincula se
  houver um único candidato.
- **Nada encontrado:** a linha é criada a partir da planilha. Nesse caso
  `INÍCIO DE VIGÊNCIA` é obrigatório. `COLABORADOR` vazio vira o Fernando.

### Faturas mensais × valor cheio

Cada fatura paga entra na produção como **endosso (EN/ER)**, com o prêmio e a comissão
do mês. O valor cheio fica na linha N/R. Somar os dois duplicaria o contrato. Por isso
as faturas da apólice, dentro da vigência do contrato, são marcadas (`saudeFaturaDe`), e
`saudeFaturaConta()` só as deixa somar quando o filtro de tipo exclui a linha cheia:

| Filtro de tipo | Soma |
|---|---|
| nenhum | valor cheio |
| N ou R (com ou sem EN/ER) | valor cheio |
| só EN/ER | faturas do mês |

A regra vale em:
- `applyFilters` (Visão Geral e Produção);
- `matchesCompScope` (Comparativo);
- `getRetData`, com os botões de tipo da própria aba (Retenção);
- `filterMetasData` e `getMetasRealizadoData` (Metas);
- o gráfico por períodos e o LTV do Cross-sell (sem filtro, ou seja, valor cheio).

A meta de novos da Exibição TV usa só `tipo === 'N'`, então nunca vê as faturas.

**Consequência:** o contrato inteiro conta no mês do início de vigência, como qualquer
apólice. Um recorte de vigência que pegue só meses posteriores mostra zero para esse
contrato, e não as faturas daqueles meses.

---

## 6.1 Carteira ativa de hoje (Exibição TV)

A barra do ano corrente no gráfico de carteira e a contagem de *Clientes por nível*
usam `tvCarteiraAtivaHoje`: apólices (`isApolice`) N/R com `SITUAÇÃO = Ativa`, fora
viagem/carta verde e vigência < 350 dias, e com duas proteções contra arquivo de ano
anterior desatualizado:

- `Ativa` com término vencido há mais de 15 dias não conta;
- o mesmo número de apólice na mesma seguradora conta uma vez (fica o início mais recente).

Motivo: em set/2026 o `producao_2025.xlsx` estava parado e o gráfico mostrava 7.736
apólices contra ~7.570 do relatório de ativas do ERP — 103 `Ativa` já vencidas e 35
números repetidos. O painel de fontes passou a apontar esse caso (coluna *Ativas
vencidas*, ver `contarAtivasVencidas`). As proteções não substituem reexportar o
arquivo: o churn continua dependendo da situação correta.

## 7. Pendências e decisões em aberto

- **Prêmio em risco (Comparativo)** ainda soma as canceladas que começaram no
  período, pela regra antiga. Não é taxa de churn, mas diverge do *prêmio perdido*
  da aba Retenção.
- **Cross-sell e contagem de ativas da Exibição TV** filtram `sit === 'Ativa'`.
  Excluir `Renovada` provavelmente está certo (a sucessora é que é a vigente), mas
  não foi auditado.
- **Branch `att_comparativo`** ficou apontando para `67f8a84`, atrás da `main`.

---

## Commits

| Commit | Conteúdo |
|---|---|
| `67f8a84` | Aba Comparativo: filtros globais no gráfico, 16 KPIs em 4 blocos, taxa de renovação por safra, ranking "Maiores variações", churn por situação, visualizações da tabela pivô |
| `a3d522f` | Ignora `.idea/`; remove `conversor_rd_ghl.html` (RD Station, em desuso desde 19/08/2026) |
| `5bb7d8b` | Exibição TV: exclui transferência de corretagem dos gráficos |

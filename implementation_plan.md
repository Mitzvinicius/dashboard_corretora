# Planejamento: Nova Aba de Sinistros e Rentabilidade

Este documento descreve as etapas técnicas e alterações arquiteturais propostas para adicionar a gestão e os indicadores de "Sinistros" no seu dashboard, suportando múltiplas fontes de dados (Produção e Sinistros).

## User Review Required

> [!IMPORTANT]
> **Carregamento dos Dados:** Como você planeja enviar a tabela de Sinistros? 
> **Opção A:** Através de uma segunda aba (planilha) dentro do *mesmo arquivo Excel* que você já faz o upload.
> **Opção B:** Um botão/zona de upload separado, permitindo subir as duas tabelas em arquivos independentes e distintos.
>
> *(Por favor, responda esta pergunta antes de prosseguirmos com a implementação!)*

---

## 1. Modificações na Leitura de Dados (`main.js`)

Atualmente, o sistema lê um único arquivo (`ALL / FD`). Para o novo contexto:
- **Novo Repositório de Dados:** Criaremos os arrays `CLAIMS = []` e `FD_CLAIMS = []`.
- **Mapeamento de Colunas (Upload de Sinistros):** 
  Precisaremos ler campos vitais como: Status do Sinistro (Aberto, Em Análise, Finalizado, Pago), Valor em Aberto, Valor Indenizado/Pago, Cliente, Ramo e Seguradora.
- **Cruzamento de Dados (Join):**
  Para agregar Sinistros + Produção, criaremos funções para agrupar as duas estruturas baseadas nos fatores em comum: **Seguradora**, **Ramo**, ou **Período**.

## 2. Nova Interface Gráfica (`index.html`)

### 2.1 Navegação
- Adicionar uma nova aba: `<button class="tab-btn" onclick="showTab('sinistros',this)">Sinistros</button>` no menu principal.

### 2.2 Estrutura da Aba "Sinistros"
A nova aba será uma *tab-pane* estruturada da seguinte forma:

*   **Bloco 1: KPIs (Indicadores Principais)**
    *   Total de sinistros abertos (Quantidade)
    *   Em andamento (Quantidade)
    *   Finalizados (Quantidade)
    *   Pagos (Quantidade)
    *   Valor em Aberto / Em análise (Soma em R$)
    *   Valor Pago Total (Soma em R$)

*   **Bloco 2: Análise Gráfica Visual**
    *   **Gráfico de Evolução (Linhas):** Prêmios Gerados (Receita) x Sinistros Pagos (Despesa) por Seguradora ao longo do tempo (Mês a Mês).
    *   **Gráfico de Distribuição por Ramo (Barras/Donut):** Mostrando a frequência e ou Severidade dos sinistros em cada Ramo de atuação.

*   **Bloco 3: Tabelas Integradas e Relatórios**
    1.  **Tabela de Sinistralidade por Seguradora:** 
        *   Colunas: Seguradora | Prêmio Emitido | Valor Indenizado | Sinistralidade % (Indenizações / Prêmio Bruto).
    2.  **Tabela de Rentabilidade por Seguradora:**
        *   Colunas: Seguradora | Prêmio Bruto (Gerado) | Comissão Paga a Nós | Sinistros Indenizados | Rentabilidade Final %.
    3.  **Tabela de Indenizações por Ramos:**
        *   Colunas: Ramo | Qtd. Sinistros | Valor Indenizado.
    4.  **Tabela de Clientes e Indenizações:**
        *   Colunas: Cliente | Seguradora | Ramo | Status | Valor Indenizado.

## 3. Alterações de Visual / Estilos (`styles.css`)

- Nenhuma grande mudança arquitetural no CSS é necessária, visando a reutilização do _Design System_ já existente.
- Criação de **Badges de Status** específicos para sinistros (ex: Verde para "Pago", Laranja para "Em Análise", Vermelho para "Finalizado Sem Pagamento").
- O gráfico de "Evolução Sinistralidade" usará as marcações de linha com duas cores contrastantes (ex: Azul Profundo para Prêmios, Laranja/Vermelho para Sinistros).

---

## Próximos Passos (Após a sua Aprovação)

1. Ajustar o módulo do `<input type="file">` e tratamento do Excel (XLSX) para interpretar a nova fonte de dados.
2. Criar as estruturas de cálculo de cruzamento consolidado de Seguradoras (Prêmio vs Sinistro vs Comissões).
3. Construir as interfaces, tabelas de rentabilidade e gráficos propostos.

Aguardo seu feedback sobre a **Opção de Upload (mesmo arquivo vs. arquivo separado)** ou qualquer alteração neste escopo para começarmos!

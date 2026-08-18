# Dashboard Santolin — Visão geral e integração SharePoint

> **Status:** ✅ Integração SharePoint → Dashboard **funcionando** (fluxo MSAL no browser implementado).
> O diagnóstico original que descrevia a integração como "não implementada" virou histórico — ver seção 7.

## 1. Contexto do projeto

Dashboard de produção da Santolin Seguros. É um app **estático** (HTML/CSS/JS puro, sem build step) que lê três planilhas Excel e renderiza KPIs, gráficos (Chart.js) e tabelas.

O projeto tem duas camadas independentes, **ambas funcionando**:

| Camada | Arquivo | Papel |
|--------|---------|-------|
| Sync server-side | `scripts/sync_producao.py` | Puxa os Excel de e-mails e os sobe para o SharePoint |
| Dashboard browser-side | `index.html` + `main.js` | Autentica via MSAL no Azure AD, baixa os Excel do SharePoint (Graph API), parseia e renderiza |

O fluxo é: **Python sync (e-mail → SharePoint)** → **browser (MSAL → Graph API → render)**.

> ⚠️ **Não alterar o fluxo de dados Azure/MSAL/SharePoint** (seções de autenticação e fetch em `main.js`). Está validado e funcionando; mudanças de UI/cálculo devem se limitar à camada de render.

---

## 2. Arquivos principais

| Arquivo | Descrição |
|---------|-----------|
| `index.html` | HTML **único/canônico** do dashboard (era `dashboard.html`; renomeado em 2026 ao remover a cópia obsoleta). É aqui que mudanças de marcação devem ser feitas. |
| `main.js` | Toda a lógica do dashboard (~2.8k linhas), organizada por seções. |
| `styles.css` | Estilos (~2.5k linhas). |
| `auth.html` | Página de redirect do OAuth (recebe o retorno do login MSAL). |
| `scripts/sync_producao.py` | Sync server-side (e-mail → SharePoint). |
| `launch_dashboard.py` | Servidor local para abrir o dashboard. |
| `Abrir Dashboard.bat` | Atalho para subir o servidor sem terminal. |

### Estrutura de `main.js` (seções)

State → Column mapping → Formatters → Tab navigation → Collapsible sections → Multi-select → Cancel filter → File handling → **Azure AD / SharePoint (MSAL)** → Global filters → e uma seção por aba: **Visão Geral, Produção, Retenção & Churn, Sinistros & Rentabilidade, Comparativo de Períodos, Metas** (esta inclui o **Acompanhamento semanal** e o **Modo apresentação / kickoff**).

---

## 3. Fluxo de autenticação e fetch (browser)

Implementado na seção `// ── Azure AD / SharePoint (MSAL) ──` de `main.js`.

**Entrada:** os cards da landing chamam `chooseProd()` e `chooseSin()`. Cada um obtém um token e dispara o download.

```
chooseProd() / chooseSin()
  └─ _getSpToken()                 # token via cache (silencioso) ou loginPopup
       └─ _buildMsal()             # cria PublicClientApplication (cache em localStorage)
  └─ _spFetchAndLoad(token, mode)
       ├─ _spGetDriveId(token)     # GET /sites/{host} → /sites/{id}/drives → acha a lib "Santolin"
       ├─ GET /drives/{id}/root:/Dashboard/{arquivo}.xlsx:/content  (cada planilha)
       └─ applySharePointData(payloads, warnings)   # parseia e abre o dashboard
```

**Estratégia "Brave-friendly"** (comentada no código): sem `ssoSilent` (evita iframe + cookies de terceiros); `acquireTokenSilent` só quando há conta em cache; `loginPopup` direto disparado pelo clique quando não há conta.

**Fallback:** se o fetch do SharePoint falhar, `_spFallback(mode)` cai para a tela de **upload manual** (produção) ou para o card de upload de sinistros — o usuário ainda consegue trabalhar arrastando os Excel.

---

## 4. Configuração Azure / SharePoint

| Parâmetro | Valor |
|-----------|-------|
| SharePoint hostname | `santolinseguros.sharepoint.com` |
| Biblioteca | `Santolin` |
| Pasta | `Dashboard` |
| Arquivos esperados | `producao.xlsx`, `sinistrosAvisados.xlsx`, `sinistrosPagamentos.xlsx` |
| Tenant ID | `59190e65-5cad-4885-9f2d-77a59385667b` |
| **App ID — browser (SPA / MSAL)** | `18d14ac5-16fc-46f4-8ffa-95f880138247` |
| App ID — sync (Python, client credentials) | `b5812845-04d8-4b4a-b754-bdd435ab09b9` |
| Scope (browser, delegado) | `Files.Read.All` |
| Redirect URI (SPA) | `http://localhost:5500/auth.html` |

**Registro no Azure AD (app do browser):** plataforma **SPA**, redirect `http://localhost:5500/auth.html`, permissão delegada **Microsoft Graph → Files.Read.All** com consentimento de administrador.

> Como é fluxo **delegado** + popup, o dashboard precisa ser servido via `http://localhost` (não funciona em `file://`). Use `launch_dashboard.py` / `Abrir Dashboard.bat`.

---

## 5. Como rodar localmente

1. `python launch_dashboard.py` (ou o `Abrir Dashboard.bat`) — sobe o servidor estático na porta 5500.
2. Abre o browser em `http://localhost:5500`.
3. Clicar em **Produção** ou **Sinistros** → login Microsoft (popup) → os Excel são baixados do SharePoint e o dashboard é renderizado.
4. Se o SharePoint estiver indisponível, usar o **upload manual** (arrastar os `.xlsx`).

---

## 6. Aba Metas — particularidades

- **Base da meta** = mesmo período do filtro de vigência, porém **um ano antes**; meta = base × (1 + % de crescimento) para Novos/Renovações.
- **Classificação de ramos:** `excluded` (não entram na meta), `pessoais`, `patrimoniais`.
- **Nomenclatura de ramos:** a lista oficial fica em `RAMOS_OFICIAIS` (main.js). `canonRamo()` unifica variações de caixa/acento do mesmo ramo na leitura da planilha; nomes fora da lista são preservados como vieram. Fora da meta hoje: viagem, carta verde, acidentes pessoais, previdência (incl. VGBL), eventos aleatórios, transporte nacional e educacional.
- **Acompanhamento semanal:** divide o período em semanas de calendário (domingo→sábado); a **Semana 1 sempre começa no dia 1** (fragmento inicial só é fundido na semana seguinte se tiver **≤3 dias**); a **última semana pode ser parcial**.
- **Modo apresentação (kickoff):** ao abrir, oferece **Fechamento de mês** (consolida o mês anterior + evolução semanal por equipe + meta do mês atual) ou **Resultado por semana** (um botão por semana do mês filtrado). Slides por equipe: Pessoais, Patrimoniais e Geral, com gráficos Meta × Realizado.
- Todas as comparações de data usam **início de vigência** (string `YYYY-MM-DD`), consistente entre as abas e evitando bug de fuso.

---

## 7. Histórico — diagnóstico original (RESOLVIDO)

> Esta seção é mantida apenas como registro. **Os bugs abaixo já foram corrigidos**: o fluxo MSAL no browser foi implementado, `chooseProd()`/`chooseSin()` existem e baixam os arquivos do SharePoint.

Quando o diagnóstico foi escrito, o projeto estava em duas fases:
- **Fase 1** (concluída): infraestrutura server-side — sync Python + `applySharePointData()` como hook receptor.
- **Fase 2** (à época, não concluída): autenticação e fetch client-side.

Bugs então identificados — **todos resolvidos hoje**:

1. ~~`chooseProd()` / `chooseSin()` não existiam~~ → implementados (disparam o fluxo MSAL).
2. ~~MSAL.js não era carregado no HTML~~ → biblioteca `@azure/msal-browser` carregada via CDN; `_buildMsal()` cria o `PublicClientApplication`.
3. ~~Sem código de fetch do SharePoint~~ → `_spGetDriveId` + `_spFetchAndLoad` baixam os três Excel e chamam `applySharePointData()`.
4. ~~`auth.html` era um stub órfão~~ → passou a ser o redirect URI registrado do app SPA.

A solução adotada foi equivalente à **Opção B** do diagnóstico original (MSAL.js no browser, fluxo delegado), com registro de um app **SPA** dedicado (`18d14ac5…`) — separado do app de sync server-side.

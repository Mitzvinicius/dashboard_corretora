# Sync de relatórios — Outlook → SharePoint

Script Python que, para cada relatório configurado em `REPORTS`, pega o e-mail mais recente da caixa compartilhada com a keyword no assunto e anexo Excel, sobrescreve o arquivo correspondente em `/Santolin/Dashboard/` no SharePoint e move o e-mail para a subpasta `Processados`.

Relatórios configurados (default):

| Keyword no assunto | Arquivo final no SharePoint |
|---|---|
| `producao` | `producao.xlsx` |
| `sinistroaberto` | `sinistrosAvisados.xlsx` |
| `sinistropgto` | `sinistrosPagamentos.xlsx` |

Pensado para rodar agendado no **Task Scheduler do Windows**, sem interação humana, usando autenticação **app-only** (client credentials).

---

## 1. Configurar o Azure AD

Crie um **novo registro de aplicativo** (separado do app do dashboard, porque aquele é SPA e este precisa ser cliente confidencial).

1. Portal Azure → **Microsoft Entra ID** → **Registros de aplicativo** → **Novo registro**
   - Nome: `Dashboard Sync (Outlook → SharePoint)`
   - Tipos de conta: **Apenas neste diretório organizacional**
   - URI de redirecionamento: deixar em branco
   - Clicar em **Registrar**
2. Anote o **ID do aplicativo (cliente)** — vai no `AZURE_CLIENT_ID`.
3. **Certificados e segredos** → **Novo segredo do cliente**
   - Descrição: `sync-producao`
   - Validade: 24 meses (renovar antes de expirar)
   - Anote o **Valor** (só aparece uma vez!) — vai no `AZURE_CLIENT_SECRET`.
4. **Permissões de API** → **Adicionar permissão** → **Microsoft Graph** → **Permissões de aplicativo**:
   - `Mail.ReadWrite` (ler e mover e-mails)
   - `Files.ReadWrite.All` (gravar no SharePoint)
   - Clicar em **Adicionar permissões**.
5. Ainda em **Permissões de API**: clicar em **Conceder consentimento de administrador para [tenant]** e confirmar.
   Status das duas permissões deve ficar verde com "Concedido para…".

### (Opcional, recomendado) Restringir acesso à caixa compartilhada

Por padrão, `Mail.ReadWrite` (app-only) dá ao app acesso a **todas** as caixas do tenant. Para restringir apenas à caixa compartilhada, crie uma **Application Access Policy** via PowerShell:

```powershell
# Conectar ao Exchange Online (precisa do módulo ExchangeOnlineManagement)
Connect-ExchangeOnline

# Criar uma policy restringindo o app à caixa compartilhada
New-ApplicationAccessPolicy -AppId <CLIENT_ID> `
  -PolicyScopeGroupId <email-da-caixa-compartilhada> `
  -AccessRight RestrictAccess `
  -Description "Sync producao - somente caixa compartilhada"
```

Sem isso, o script funciona, mas o app tem permissão técnica para ler outras caixas. Para uso interno controlado, geralmente é aceitável.

---

## 2. Setup local

### Pré-requisitos
- Python 3.10+ (`python --version`)
- pip atualizado

### Instalação

```bash
cd scripts
python -m pip install -r requirements.txt
```

### Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Editar `.env` e preencher:

```
AZURE_TENANT_ID=59190e65-5cad-4885-9f2d-77a59385667b
AZURE_CLIENT_ID=<ID do app criado no passo 1>
AZURE_CLIENT_SECRET=<segredo gerado no passo 1>
SHARED_MAILBOX=caixa-compartilhada@santolinseguros.com.br
```

> **Nunca commite o `.env`** — ele já está no `.gitignore`.

---

## 3. Teste manual

Antes de agendar, valide rodando manualmente:

```bash
python sync_producao.py
```

Saída esperada (no console e em `sync_producao.log`):

```
2026-04-29 14:30:01 | INFO | === Inicio do sync ===
2026-04-29 14:30:01 | INFO | Caixa: relatorios.dash@santolinconsultoria.com.br | Relatorios configurados: 3
2026-04-29 14:30:02 | INFO | Token OK
2026-04-29 14:30:02 | INFO | E-mails recentes carregados: 100
2026-04-29 14:30:03 | INFO | [producao] 'ENC: Agendamento de Relatorio: producao' (2026-04-29T13:15:00Z)
2026-04-29 14:30:04 | INFO | [producao] Anexo baixado: RptAnaliseProducao.XLSX (9660 KB)
2026-04-29 14:30:06 | INFO | [producao] Upload OK -> /Santolin/Dashboard/producao.xlsx
2026-04-29 14:30:07 | INFO | [producao] E-mail movido para 'Processados'
2026-04-29 14:30:08 | INFO | [sinistroaberto] 'ENC: Agendamento de Relatorio: sinistroaberto' (2026-04-29T13:20:00Z)
... (mesmos passos para sinistroaberto e sinistropgto)
2026-04-29 14:30:18 | INFO | === Resumo: 3 ok / 0 falha / 0 sem e-mail ===
```

Se rodar de novo imediatamente (todos já em Processados), deve logar:

```
2026-04-29 14:31:00 | WARNING | [producao] Sem e-mail novo — pulando
2026-04-29 14:31:00 | WARNING | [sinistroaberto] Sem e-mail novo — pulando
2026-04-29 14:31:00 | WARNING | [sinistropgto] Sem e-mail novo — pulando
2026-04-29 14:31:00 | INFO | === Resumo: 0 ok / 0 falha / 3 sem e-mail ===
```

### Adicionando ou removendo relatórios

Edite a lista `REPORTS` no topo de `sync_producao.py`:

```python
REPORTS = [
    {"keyword": "producao",       "sp_filename": "producao.xlsx"},
    {"keyword": "sinistroaberto", "sp_filename": "sinistrosAvisados.xlsx"},
    {"keyword": "sinistropgto",   "sp_filename": "sinistrosPagamentos.xlsx"},
    # Adicione aqui mais relatórios no mesmo formato.
]
```

- `keyword` — substring case-insensitive procurada no assunto do e-mail
- `sp_filename` — nome final do arquivo em `/Santolin/Dashboard/` (sobrescreve se já existir)

Cuidado para que as keywords sejam **distintas o suficiente** entre si — se um e-mail tiver duas keywords no assunto, ele será processado e movido para Processados após o primeiro match (e o segundo relatório vai ficar sem fonte).

### Política de saída do script

- **Exit code `0`**: pelo menos um relatório processado com sucesso, ou todos pulados por falta de e-mail novo.
- **Exit code `1`**: todos os relatórios que tinham e-mail correspondente falharam (nenhum upload bem-sucedido).

Para o Task Scheduler isso significa que falhas parciais (ex: 2 OK + 1 falha) não disparam alerta, mas falhas totais sim.

---

## 4. Agendar no Task Scheduler do Windows

1. Abra o **Agendador de Tarefas** (Task Scheduler).
2. **Criar Tarefa…** (não "Criar Tarefa Básica" — precisa das opções avançadas).
3. **Geral**:
   - Nome: `Sync Producao Dashboard`
   - Marcar **Executar quer o usuário esteja conectado ou não**
   - Marcar **Executar com privilégios mais altos**
   - Configurar para: Windows 10
4. **Disparadores** → **Novo…**
   - Iniciar a tarefa: **Em uma agenda**
   - **Diariamente**, repetir a tarefa a cada **1 hora** durante **1 dia** (ajuste a frequência)
5. **Ações** → **Nova…**
   - Ação: **Iniciar um programa**
   - Programa/script: `C:\Caminho\para\Python\python.exe` (ex: `C:\Users\mitzr\AppData\Local\Programs\Python\Python312\python.exe`)
   - Adicione argumentos: `sync_producao.py`
   - Iniciar em: `C:\Users\mitzr\Desktop\One Drive\OneDrive\Documentos\Projetos Code\dash20\scripts`
6. **Configurações**:
   - **Parar a tarefa se ela executar por mais de**: `10 minutos`
   - **Não iniciar nova instância** se já estiver em execução
   - **Se a tarefa falhar, reiniciar a cada**: 5 minutos, até 3 tentativas

Quando salvar, será solicitada a senha do usuário Windows que vai executar a tarefa.

### Verificar se está rodando

- Pasta `scripts/` → arquivo `sync_producao.log` mostra cada execução.
- Histórico do Task Scheduler (precisa estar habilitado na barra lateral) mostra exit code de cada execução.

---

## 5. Troubleshooting

| Erro | Causa provável | Solução |
|---|---|---|
| `Falha na autenticacao: invalid_client` | client secret incorreto ou expirado | Gerar novo segredo no Azure AD |
| `[buscar e-mails] HTTP 403` | Permissão `Mail.ReadWrite` não foi concedida pelo admin | Voltar ao passo 1.5 e clicar em "Conceder consentimento" |
| `[upload SharePoint] HTTP 403` | Permissão `Files.ReadWrite.All` não foi concedida | Idem acima |
| `Biblioteca 'Santolin' nao encontrada` | Nome da biblioteca mudou no SharePoint | Ajustar `SP_LIBRARY` em `sync_producao.py` |
| `Nenhum anexo .xlsx encontrado` | E-mail tem só PDF/imagem, ou o ERP mudou o formato | Verificar manualmente o e-mail |
| `Variaveis ausentes em .env` | `.env` não preenchido ou na pasta errada | Conferir `scripts/.env` |

Logs ficam em `scripts/sync_producao.log` (append, sem rotação automática — apague periodicamente se crescer demais).

"""
Sync de relatorios — Outlook (caixa compartilhada) -> SharePoint.

Roda agendado via Task Scheduler do Windows. Para cada relatorio configurado em
REPORTS, procura o e-mail mais recente na caixa compartilhada com o assunto
contendo a keyword + anexo, baixa o anexo Excel, sobrescreve o arquivo
correspondente em /Santolin/Dashboard/ no SharePoint e move o e-mail para a
subpasta "Processados".

Relatorios atuais:
  - 'producao'       -> producao.xlsx
  - 'sinistroaberto' -> sinistrosAvisados.xlsx
  - 'sinistropgto'   -> sinistrosPagamentos.xlsx

Para adicionar/remover relatorios, edite a lista REPORTS abaixo.

Dependencias: msal, requests, python-dotenv (ver requirements.txt).
Configuracao: variaveis de ambiente em .env (ver .env.example).
"""

import base64
import logging
import os
import sys
import traceback
from pathlib import Path

import msal
import requests
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Configuracao
# ---------------------------------------------------------------------------

SP_HOSTNAME = "santolinseguros.sharepoint.com"
SP_LIBRARY = "Santolin"          # nome da biblioteca de documentos no SharePoint
SP_FOLDER = "Dashboard"          # subpasta dentro da biblioteca

PROCESSED_FOLDER_NAME = "Processados"

# Lista de relatorios a sincronizar.
# keyword     = substring (case-insensitive) procurada no assunto do e-mail
# sp_filename = nome final do arquivo em /Santolin/Dashboard/
REPORTS = [
    {"keyword": "producao",       "sp_filename": "producao.xlsx"},
    {"keyword": "sinistroaberto", "sp_filename": "sinistrosAvisados.xlsx"},
    {"keyword": "sinistropgto",   "sp_filename": "sinistrosPagamentos.xlsx"},
]

GRAPH = "https://graph.microsoft.com/v1.0"

SCRIPT_DIR = Path(__file__).resolve().parent
LOG_FILE = SCRIPT_DIR / "sync_producao.log"
ENV_FILE = SCRIPT_DIR / ".env"


# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stdout),
    ],
)
log = logging.getLogger("sync_producao")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class GraphError(Exception):
    """Erro retornado pela Graph API."""


def graph_check(resp: requests.Response, ctx: str) -> requests.Response:
    """Levanta GraphError com mensagem útil se a resposta não for 2xx."""
    if resp.ok:
        return resp
    try:
        msg = resp.json().get("error", {}).get("message", resp.text)
    except ValueError:
        msg = resp.text
    raise GraphError(f"[{ctx}] HTTP {resp.status_code}: {msg}")


# ---------------------------------------------------------------------------
# Autenticacao (client credentials)
# ---------------------------------------------------------------------------

def get_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        raise GraphError(
            f"Falha na autenticacao: {result.get('error')} - {result.get('error_description')}"
        )
    return result["access_token"]


# ---------------------------------------------------------------------------
# Outlook
# ---------------------------------------------------------------------------

def fetch_recent_messages(token: str, mailbox: str) -> list[dict]:
    """Pega os 100 e-mails mais recentes da caixa, sem filtro no servidor.

    Graph rejeita varias combinacoes de $filter + $orderby em mailboxes
    compartilhadas (HTTP 400 'restriction is too complex'). A estrategia
    mais robusta e nao usar nem $filter nem $orderby no servidor: filtramos
    todo o resto em Python.
    """
    headers = {"Authorization": f"Bearer {token}"}
    params = {
        "$top": "100",
        "$select": "id,subject,receivedDateTime,from,hasAttachments",
    }
    url = f"{GRAPH}/users/{mailbox}/messages"
    resp = graph_check(requests.get(url, headers=headers, params=params, timeout=30),
                       "buscar e-mails")
    items = resp.json().get("value", [])
    # Ordena defensivamente por receivedDateTime desc (caso o default mude)
    items.sort(key=lambda m: m.get("receivedDateTime") or "", reverse=True)
    return items


def find_message_by_keyword(messages: list[dict], keyword: str) -> dict | None:
    """Encontra o e-mail mais recente da lista que tem anexo e a keyword no assunto."""
    kw = keyword.lower()
    for msg in messages:
        if not msg.get("hasAttachments"):
            continue
        if kw in (msg.get("subject") or "").lower():
            return msg
    return None


def download_excel_attachment(token: str, mailbox: str, message_id: str) -> tuple[bytes, str]:
    """Baixa o primeiro anexo Excel (.xlsx) do e-mail."""
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH}/users/{mailbox}/messages/{message_id}/attachments"
    resp = graph_check(requests.get(url, headers=headers, timeout=60), "listar anexos")
    attachments = resp.json().get("value", [])

    excel = next(
        (a for a in attachments if a.get("name", "").lower().endswith(".xlsx")),
        None,
    )
    if not excel:
        raise GraphError("Nenhum anexo .xlsx encontrado no e-mail")

    if excel.get("@odata.type") != "#microsoft.graph.fileAttachment":
        raise GraphError(f"Anexo nao e fileAttachment: {excel.get('@odata.type')}")

    content = base64.b64decode(excel["contentBytes"])
    return content, excel["name"]


def get_or_create_processed_folder(token: str, mailbox: str) -> str:
    """Retorna o ID da pasta 'Processados', criando-a se nao existir."""
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH}/users/{mailbox}/mailFolders"
    params = {"$filter": f"displayName eq '{PROCESSED_FOLDER_NAME}'"}
    resp = graph_check(requests.get(url, headers=headers, params=params, timeout=30),
                       "buscar pasta Processados")
    folders = resp.json().get("value", [])
    if folders:
        return folders[0]["id"]

    log.info("Pasta '%s' nao existe — criando", PROCESSED_FOLDER_NAME)
    resp = graph_check(
        requests.post(url, headers=headers, json={"displayName": PROCESSED_FOLDER_NAME}, timeout=30),
        "criar pasta Processados",
    )
    return resp.json()["id"]


def move_email(token: str, mailbox: str, message_id: str, dest_folder_id: str) -> None:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH}/users/{mailbox}/messages/{message_id}/move"
    graph_check(
        requests.post(url, headers=headers, json={"destinationId": dest_folder_id}, timeout=30),
        "mover e-mail",
    )


# ---------------------------------------------------------------------------
# SharePoint
# ---------------------------------------------------------------------------

def get_santolin_drive_id(token: str) -> str:
    """Encontra o ID do drive (biblioteca de documentos) chamado 'Santolin'."""
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH}/sites/{SP_HOSTNAME}/drives"
    resp = graph_check(requests.get(url, headers=headers, timeout=30), "listar drives")
    drives = resp.json().get("value", [])

    target = next(
        (d for d in drives if d.get("name", "").lower() == SP_LIBRARY.lower()),
        None,
    )
    if not target:
        nomes = ", ".join(f'"{d.get("name")}"' for d in drives)
        raise GraphError(f"Biblioteca '{SP_LIBRARY}' nao encontrada. Disponiveis: {nomes}")
    return target["id"]


def upload_to_sharepoint(token: str, drive_id: str, content: bytes, sp_filename: str) -> None:
    """Sobrescreve o arquivo na pasta /Dashboard/ via simple upload (<250MB)."""
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }
    path = f"/{SP_FOLDER}/{sp_filename}"
    url = f"{GRAPH}/drives/{drive_id}/root:{path}:/content"
    graph_check(requests.put(url, headers=headers, data=content, timeout=120),
                "upload SharePoint")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    load_dotenv(ENV_FILE)

    tenant_id = os.environ.get("AZURE_TENANT_ID")
    client_id = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")
    mailbox = os.environ.get("SHARED_MAILBOX")

    missing = [k for k, v in {
        "AZURE_TENANT_ID": tenant_id,
        "AZURE_CLIENT_ID": client_id,
        "AZURE_CLIENT_SECRET": client_secret,
        "SHARED_MAILBOX": mailbox,
    }.items() if not v]
    if missing:
        log.error("Variaveis ausentes em .env: %s", ", ".join(missing))
        return 1

    log.info("=== Inicio do sync ===")
    log.info("Caixa: %s | Relatorios configurados: %d", mailbox, len(REPORTS))

    token = get_token(tenant_id, client_id, client_secret)
    log.info("Token OK")

    messages = fetch_recent_messages(token, mailbox)
    log.info("E-mails recentes carregados: %d", len(messages))

    drive_id = get_santolin_drive_id(token)
    folder_id = get_or_create_processed_folder(token, mailbox)

    successes, failures, skipped = 0, 0, 0
    for report in REPORTS:
        kw = report["keyword"]
        filename = report["sp_filename"]
        try:
            msg = find_message_by_keyword(messages, kw)
            if not msg:
                log.warning("[%s] Sem e-mail novo — pulando", kw)
                skipped += 1
                continue

            log.info("[%s] '%s' (%s)", kw, msg.get("subject"), msg.get("receivedDateTime"))

            content, name = download_excel_attachment(token, mailbox, msg["id"])
            log.info("[%s] Anexo baixado: %s (%d KB)", kw, name, len(content) // 1024)

            upload_to_sharepoint(token, drive_id, content, filename)
            log.info("[%s] Upload OK -> /%s/%s/%s", kw, SP_LIBRARY, SP_FOLDER, filename)

            move_email(token, mailbox, msg["id"], folder_id)
            log.info("[%s] E-mail movido para '%s'", kw, PROCESSED_FOLDER_NAME)

            successes += 1
        except Exception as e:
            log.error("[%s] FALHOU: %s", kw, e)
            failures += 1

    log.info("=== Resumo: %d ok / %d falha / %d sem e-mail ===",
             successes, failures, skipped)

    # Exit 1 so se TODOS os processados falharam (parcial = 0)
    if failures > 0 and successes == 0:
        return 1
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        log.error("Falha nao tratada:\n%s", traceback.format_exc())
        sys.exit(1)

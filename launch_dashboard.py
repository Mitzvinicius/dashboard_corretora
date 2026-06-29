"""
Servidor local do Dashboard Santolin.

Baixa os três Excel da pasta Dashboard no SharePoint usando as credenciais
do scripts/.env e abre o dashboard em http://localhost:8080

Uso:
    python launch_dashboard.py

Dependências: msal, requests, python-dotenv
    pip install -r scripts/requirements.txt
"""

import json
import os
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import msal
import requests
from dotenv import load_dotenv

# ── Configuração ────────────────────────────────────────────────────────────────

PORT        = 8080
GRAPH       = "https://graph.microsoft.com/v1.0"
SP_HOSTNAME = "santolinseguros.sharepoint.com"
SP_LIBRARY  = "Santolin"
SP_FOLDER   = "Dashboard"

SP_FILES = {
    "producao":            "producao.xlsx",
    "sinistrosAvisados":   "sinistrosAvisados.xlsx",
    "sinistrosPagamentos": "sinistrosPagamentos.xlsx",
}

BASE_DIR  = Path(__file__).resolve().parent
CACHE_DIR = BASE_DIR / "scripts" / "cache"
ENV_FILE  = BASE_DIR / "scripts" / ".env"

_cache: dict[str, bytes] = {}

# ── SharePoint ───────────────────────────────────────────────────────────────────

def get_token(tenant_id: str, client_id: str, client_secret: str) -> str:
    app = msal.ConfidentialClientApplication(
        client_id=client_id,
        client_credential=client_secret,
        authority=f"https://login.microsoftonline.com/{tenant_id}",
    )
    result = app.acquire_token_for_client(scopes=["https://graph.microsoft.com/.default"])
    if "access_token" not in result:
        raise RuntimeError(f"Autenticação falhou: {result.get('error_description')}")
    return result["access_token"]


def get_drive_id(token: str) -> str:
    headers = {"Authorization": f"Bearer {token}"}
    resp = requests.get(f"{GRAPH}/sites/{SP_HOSTNAME}/drives", headers=headers, timeout=30)
    resp.raise_for_status()
    drives = resp.json().get("value", [])
    target = next((d for d in drives if d.get("name", "").lower() == SP_LIBRARY.lower()), None)
    if not target:
        nomes = ", ".join(f'"{d.get("name")}"' for d in drives)
        raise RuntimeError(f"Biblioteca '{SP_LIBRARY}' não encontrada. Disponíveis: {nomes}")
    return target["id"]


def download_file(token: str, drive_id: str, filename: str) -> bytes | None:
    headers = {"Authorization": f"Bearer {token}"}
    url = f"{GRAPH}/drives/{drive_id}/root:/{SP_FOLDER}/{filename}:/content"
    resp = requests.get(url, headers=headers, timeout=120)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.content


def fetch_sharepoint_files() -> None:
    load_dotenv(ENV_FILE)
    tenant_id     = os.environ.get("AZURE_TENANT_ID")
    client_id     = os.environ.get("AZURE_CLIENT_ID")
    client_secret = os.environ.get("AZURE_CLIENT_SECRET")

    missing = [k for k, v in {
        "AZURE_TENANT_ID":     tenant_id,
        "AZURE_CLIENT_ID":     client_id,
        "AZURE_CLIENT_SECRET": client_secret,
    }.items() if not v]
    if missing:
        raise RuntimeError(f"Variáveis ausentes no scripts/.env: {', '.join(missing)}")

    print("→ Autenticando com Azure AD...")
    token = get_token(tenant_id, client_id, client_secret)
    print("  Token OK")

    print("→ Localizando biblioteca SharePoint...")
    drive_id = get_drive_id(token)
    print("  Drive encontrado")

    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    for key, filename in SP_FILES.items():
        print(f"→ Baixando {filename}...")
        try:
            content = download_file(token, drive_id, filename)
        except Exception as e:
            content = None
            print(f"  Erro ao baixar: {e}")

        if content:
            _cache[key] = content
            (CACHE_DIR / filename).write_bytes(content)
            print(f"  ✓ {len(content) // 1024} KB")
        else:
            cached = CACHE_DIR / filename
            if cached.exists():
                _cache[key] = cached.read_bytes()
                print(f"  ⚠ Não encontrado no SP — usando cache local ({len(_cache[key]) // 1024} KB)")
            else:
                print(f"  ✗ Não encontrado (arquivo ignorado)")


# ── HTTP Server ──────────────────────────────────────────────────────────────────

MIME = {
    ".html": "text/html; charset=utf-8",
    ".js":   "application/javascript; charset=utf-8",
    ".css":  "text/css; charset=utf-8",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


class DashHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silencia logs de acesso padrão

    def _send_bytes(self, data: bytes, content_type: str, status: int = 200) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]

        # /api/status — lista quais arquivos foram carregados
        if path == "/api/status":
            body = json.dumps({"files": {k: len(v) for k, v in _cache.items()}}).encode()
            self._send_bytes(body, "application/json")
            return

        # /api/{key} — retorna o Excel correspondente
        if path.startswith("/api/"):
            key = path[5:]
            if key in _cache:
                self._send_bytes(_cache[key], MIME[".xlsx"])
            else:
                self.send_response(404)
                self.end_headers()
            return

        # Arquivos estáticos
        if path == "/":
            path = "/index.html"

        filepath = BASE_DIR / path.lstrip("/")
        if filepath.is_file():
            ext = filepath.suffix.lower()
            mime = MIME.get(ext, "application/octet-stream")
            self._send_bytes(filepath.read_bytes(), mime)
        else:
            self.send_response(404)
            self.end_headers()


# ── Entry point ──────────────────────────────────────────────────────────────────

def main() -> None:
    print("=== Dashboard Santolin — Servidor Local ===\n")

    try:
        fetch_sharepoint_files()
    except Exception as e:
        print(f"\n✗ Erro ao carregar do SharePoint: {e}")
        sys.exit(1)

    if not _cache:
        print("\n✗ Nenhum arquivo encontrado. Verifique a conexão e o scripts/.env")
        sys.exit(1)

    server = HTTPServer(("localhost", PORT), DashHandler)
    url = f"http://localhost:{PORT}/index.html"

    print(f"\n→ Dashboard disponível em {url}")
    print("→ Pressione Ctrl+C para encerrar\n")

    threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n→ Servidor encerrado.")
        server.server_close()


if __name__ == "__main__":
    main()

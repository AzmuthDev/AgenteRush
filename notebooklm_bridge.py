"""
RUSH_VERSO // NOTEBOOKLM REST BRIDGE FOR N8N
Servidor local de ponte que conecta o n8n diretamente aos seus Cadernos do Google NotebookLM.
Porta padrão: 5055
"""

import asyncio
import json
import os
import sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

try:
    from notebooklm import NotebookLMClient
except ImportError:
    print("[ERRO] Biblioteca notebooklm-py não encontrada. Execute: pip install notebooklm-py")
    sys.exit(1)

PORT = int(os.environ.get("NOTEBOOKLM_PORT", 5055))
DEFAULT_NOTEBOOK_ID = os.environ.get("NOTEBOOKLM_DEFAULT_NOTEBOOK_ID", "")

class BridgeHandler(BaseHTTPRequestHandler):
    def _set_headers(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers(204)

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/" or path == "/health":
            self.handle_health()
        elif path == "/notebooks":
            self.handle_list_notebooks()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint não encontrado"}).encode("utf-8"))

    def do_POST(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/ask":
            self.handle_ask()
        else:
            self._set_headers(404)
            self.wfile.write(json.dumps({"error": "Endpoint não encontrado"}).encode("utf-8"))

    def handle_health(self):
        storage_path = os.path.expanduser("~/.notebooklm/profiles/default/storage_state.json")
        is_authenticated = os.path.exists(storage_path)

        res = {
            "service": "NotebookLM Bridge for n8n",
            "status": "online",
            "authenticated": is_authenticated,
            "storage_path": storage_path,
            "message": "Autenticado com sucesso!" if is_authenticated else "Não autenticado. Execute 'python -m notebooklm login' no terminal."
        }
        self._set_headers(200)
        self.wfile.write(json.dumps(res, indent=2, ensure_ascii=False).encode("utf-8"))

    def handle_list_notebooks(self):
        async def fetch_notebooks():
            try:
                async with NotebookLMClient.from_storage() as client:
                    notebooks = await client.notebooks.list()
                    return [
                        {
                            "id": nb.id,
                            "title": getattr(nb, "title", "Sem título"),
                            "url": f"https://notebooklm.google.com/notebook/{nb.id}"
                        }
                        for nb in notebooks
                    ], None
            except Exception as e:
                return None, str(e)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        notebooks, err = loop.run_until_complete(fetch_notebooks())
        loop.close()

        if err:
            self._set_headers(401 if "Storage file not found" in err else 500)
            self.wfile.write(json.dumps({"error": err, "hint": "Execute 'python -m notebooklm login' para autenticar."}).encode("utf-8"))
            return

        self._set_headers(200)
        self.wfile.write(json.dumps({"notebooks": notebooks, "total": len(notebooks)}, indent=2, ensure_ascii=False).encode("utf-8"))

    def handle_ask(self):
        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)

        try:
            body = json.loads(post_data.decode("utf-8") or "{}")
        except Exception:
            body = {}

        query = body.get("query") or body.get("message") or body.get("chatInput")
        notebook_id = body.get("notebook_id") or body.get("notebookId") or DEFAULT_NOTEBOOK_ID

        if not query:
            self._set_headers(400)
            self.wfile.write(json.dumps({"error": "Campo 'query' obrigatório no corpo JSON."}).encode("utf-8"))
            return

        async def query_notebook(nb_id, q):
            try:
                async with NotebookLMClient.from_storage() as client:
                    # Se não informou ID de caderno, pega o primeiro disponível
                    if not nb_id:
                        nbs = await client.notebooks.list()
                        if not nbs:
                            return None, "Nenhum caderno encontrado no seu NotebookLM."
                        nb_id = nbs[0].id

                    result = await client.chat.ask(notebook_id=nb_id, query=q)

                    citations = []
                    if hasattr(result, "citations") and result.citations:
                        for c in result.citations:
                            citations.append({
                                "source": getattr(c, "source_title", ""),
                                "text": getattr(c, "text", "")
                            })

                    return {
                        "notebook_id": nb_id,
                        "query": q,
                        "answer": getattr(result, "answer", str(result)),
                        "citations": citations
                    }, None
            except Exception as e:
                return None, str(e)

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        res, err = loop.run_until_complete(query_notebook(notebook_id, query))
        loop.close()

        if err:
            self._set_headers(500)
            self.wfile.write(json.dumps({"error": err, "success": False}).encode("utf-8"))
            return

        self._set_headers(200)
        self.wfile.write(json.dumps({"success": True, **res}, indent=2, ensure_ascii=False).encode("utf-8"))

def run_server():
    if sys.stdout.encoding != 'utf-8':
        try:
            sys.stdout.reconfigure(encoding='utf-8')
        except Exception:
            pass

    server = HTTPServer(("0.0.0.0", PORT), BridgeHandler)
    print(f"\n======================================================")
    print(f">> RUSH_VERSO // NOTEBOOKLM REST BRIDGE FOR N8N")
    print(f"   Servidor ativo em: http://localhost:{PORT}")
    print(f"   Endpoint para n8n: http://localhost:{PORT}/ask (POST)")
    print(f"   Listar cadernos:  http://localhost:{PORT}/notebooks (GET)")
    print(f"======================================================\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrando bridge...")
        server.server_close()

if __name__ == "__main__":
    run_server()

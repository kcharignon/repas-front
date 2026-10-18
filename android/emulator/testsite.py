#!/usr/bin/env python3
"""Le faux site local de l'émulateur (DRV-319) : HTTPS sur le port 443, sous un nom `*.leclercdrive.fr` que le DNS local de l'émulateur
envoie ici. Il ne contient AUCUNE donnée d'une enseigne : une page de test qui relève ce que le pont et l'agent font dans la WebView.

  GET  /              la page de test (testpage.html)
  POST /__report      la page y dépose ce qu'elle a relevé (JSON, 8 Ko au plus) ; le test de fumée le relit
  GET  /__reports     la liste des relevés, en JSON
  POST /__reset       vide la liste
  tout le reste       404 (par exemple les recherches que tenterait l'agent : elles n'aboutissent jamais)

Le journal des requêtes (méthode et chemin seulement) est dans $SITE_DIR/access.log.
"""
import json
import os
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITE_DIR = os.environ.get("SITE_DIR", "/sdk/site")
PAGE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "testpage.html")
MAX_REPORT_BYTES = 8 * 1024
MAX_REPORTS = 200

reports = []
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "faux-drive"

    def _send(self, status, body=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/__reports":
            with lock:
                body = json.dumps(reports).encode()
            self._send(200, body, "application/json")
        elif path == "/":
            with open(PAGE, "rb") as handle:
                self._send(200, handle.read(), "text/html; charset=utf-8")
        else:
            self._send(404, b"introuvable")

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        length = min(int(self.headers.get("Content-Length") or 0), MAX_REPORT_BYTES)
        raw = self.rfile.read(length)
        if path == "/__reset":
            with lock:
                reports.clear()
            self._send(204)
        elif path == "/__report":
            try:
                item = json.loads(raw)
            except ValueError:
                return self._send(400, b"JSON attendu")
            with lock:
                if len(reports) < MAX_REPORTS:
                    reports.append(item)
            self._send(204)
        else:
            self._send(404, b"introuvable")

    def log_message(self, fmt, *args):  # méthode et chemin seulement, jamais d'en-tête
        with open(os.path.join(SITE_DIR, "access.log"), "a", encoding="utf-8") as journal:
            journal.write("%s %s\n" % (self.command, self.path.split("?", 1)[0]))


def main():
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.load_cert_chain(os.path.join(SITE_DIR, "cert.pem"), os.path.join(SITE_DIR, "key.pem"))
    server = ThreadingHTTPServer(("127.0.0.1", 443), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

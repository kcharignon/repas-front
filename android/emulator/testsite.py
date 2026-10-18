#!/usr/bin/env python3
"""Les faux sites locaux de l'émulateur (DRV-319, DRV-317) : HTTPS sur le port 443, sous des noms que le DNS local de l'émulateur envoie ici.
Ils ne contiennent AUCUNE donnée réelle : des pages de test qui relèvent ce que le pont et l'agent font dans la WebView.

Selon le nom demandé (en-tête Host) :
  repas.test (le faux front Repas, DRV-317)   toute adresse hors /__ : la page repaspage.html (comme un SPA)
  courses-test.leclercdrive.fr (le faux       TOUT (hors /__) est relayé en HTTP vers le faux site Leclerc complet (Node, drive-agent/fake-leclerc, DRV-309),
  magasin, DRV-319 partie 2)                  qui tourne dans ce conteneur sur 127.0.0.1:8099 : recherche, panier, défauts simulés, cadence jugée
  autre *.leclercdrive.fr (le faux drive)     GET / (l'accueil) et GET /magasin-… (une page de magasin, DRV-320) : la page de test testpage.html ;
                                              le reste, 404 (par exemple les recherches que tenterait l'agent : elles n'aboutissent jamais)
Pour tous les noms :
  POST /__report      la page y dépose ce qu'elle a relevé (JSON, 8 Ko au plus) ; les tests de l'émulateur le relisent
  GET  /__reports     la liste des relevés, en JSON
  POST /__command     le test dépose un ordre pour le faux Repas (JSON, 16 Ko au plus : un plan en tient) ; la page le prend avec GET /__command
  GET  /__command     le plus ancien ordre en attente (JSON) ou 204
  POST /__reset       vide les relevés et les ordres

Le journal des requêtes (méthode et chemin seulement) est dans $SITE_DIR/access.log.
"""
import http.client
import json
import os
import ssl
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SITE_DIR = os.environ.get("SITE_DIR", "/sdk/site")
HERE = os.path.dirname(os.path.abspath(__file__))
DRIVE_PAGE = os.path.join(HERE, "testpage.html")
REPAS_PAGE = os.path.join(HERE, "repaspage.html")
REPAS_HOST = "repas.test"
# Le faux magasin Leclerc complet (Node), en HTTP sur la boucle locale du conteneur : seuls ces noms lui sont relayés, tels quels (en-tête Host compris,
# qu'il vérifie lui-même : il refuse tout autre nom).
FAKE_LECLERC = ("127.0.0.1", int(os.environ.get("FAKE_LECLERC_PORT", "8099")))
FAKE_LECLERC_HOSTS = {"courses-test.leclercdrive.fr"}
MAX_PROXY_BYTES = 64 * 1024
HOP_BY_HOP = {"connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade",
              "host", "content-length", "date", "server"}
MAX_REPORT_BYTES = 8 * 1024
MAX_COMMAND_BYTES = 16 * 1024
MAX_REPORTS = 200
MAX_COMMANDS = 20

reports = []
commands = []
lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "faux-sites"

    def _send(self, status, body=b"", content_type="text/plain; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _host(self):
        return (self.headers.get("Host") or "").split(":", 1)[0].lower()

    def _page(self, path):
        with open(path, "rb") as handle:
            self._send(200, handle.read(), "text/html; charset=utf-8")

    def _relay(self):
        """Relaie la requête telle quelle au faux Leclerc complet et rend sa réponse (statut, en-têtes, corps)."""
        length = min(int(self.headers.get("Content-Length") or 0), MAX_PROXY_BYTES)
        body = self.rfile.read(length) if length else None
        headers = {key: value for key, value in self.headers.items() if key.lower() not in HOP_BY_HOP}
        headers["Host"] = self.headers.get("Host", "")
        connection = http.client.HTTPConnection(*FAKE_LECLERC, timeout=60)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            reply = connection.getresponse()
            data = reply.read()
            self.send_response(reply.status)
            for key, value in reply.getheaders():
                if key.lower() not in HOP_BY_HOP:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            self._send(502, b"le faux Leclerc ne repond pas")
        finally:
            connection.close()

    def _is_fake_leclerc(self, path):
        return self._host() in FAKE_LECLERC_HOSTS and not path.startswith("/__")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if self._is_fake_leclerc(path):
            self._relay()
        elif path == "/__reports":
            with lock:
                body = json.dumps(reports).encode()
            self._send(200, body, "application/json")
        elif path == "/__command":
            with lock:
                command = commands.pop(0) if commands else None
            if command is None:
                self._send(204)
            else:
                self._send(200, json.dumps(command).encode(), "application/json")
        elif self._host() == REPAS_HOST and not path.startswith("/__"):
            self._page(REPAS_PAGE)
        elif path == "/" or path.startswith("/magasin-"):
            self._page(DRIVE_PAGE)
        else:
            self._send(404, b"introuvable")

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if self._is_fake_leclerc(path):
            return self._relay()
        limit = MAX_COMMAND_BYTES if path == "/__command" else MAX_REPORT_BYTES
        length = min(int(self.headers.get("Content-Length") or 0), limit)
        raw = self.rfile.read(length)
        if path == "/__reset":
            with lock:
                reports.clear()
                commands.clear()
            self._send(204)
        elif path in ("/__report", "/__command"):
            try:
                item = json.loads(raw)
            except ValueError:
                return self._send(400, b"JSON attendu")
            target, maximum = (reports, MAX_REPORTS) if path == "/__report" else (commands, MAX_COMMANDS)
            with lock:
                if len(target) < maximum:
                    target.append(item)
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

#!/usr/bin/env python3
"""Les faux sites locaux de l'émulateur (DRV-319, DRV-317) : HTTPS sur le port 443, sous des noms que le DNS local de l'émulateur envoie ici.
Ils ne contiennent AUCUNE donnée réelle : des pages de test qui relèvent ce que le pont et l'agent font dans la WebView.

Selon le nom demandé (en-tête Host) :
  repas.test (le faux front Repas, DRV-317)   toute adresse hors /__ : la page repaspage.html (comme un SPA)
  courses-test.leclercdrive.fr (le faux       TOUT (hors /__) est relayé en HTTP vers le faux site Leclerc complet (Node, drive-agent/fake-leclerc, DRV-309),
  magasin, DRV-319 partie 2)                  qui tourne dans ce conteneur sur 127.0.0.1:8099 : recherche, panier, défauts simulés, cadence jugée
  www.leclercdrive.fr (l'accueil de           deux modes, choisis par POST /__www (voir plus bas) :
  l'enseigne, NavigationPolicy.START_URL)       « test » (par défaut, le test de fumée) : GET / (l'accueil) et GET /magasin-… (une page de magasin,
                                                DRV-320) : la page de test testpage.html ; le reste, 404 (par exemple les recherches que tenterait
                                                l'agent : elles n'aboutissent jamais) ;
                                              « fake » (les scénarios complets, e2e.sh) : relayé comme le faux magasin vers le faux Leclerc complet,
                                                qui y sert l'accueil du magasin et son bouton « Commencer mes courses » (qui mène à une page de magasin
                                                avec sa ville sur courses-test.leclercdrive.fr) ; la racine de courses-test, elle, y est une page 404
                                                (recette réelle du 2026-10-18 : la racine de l'hôte d'un magasin est une page 404 du vrai site)
                                              dans les deux modes, GET /connexion.aspx : la page de connexion hors d'un magasin, qui dit comme le vrai
                                                site « Avant de vous authentifier, veuillez sélectionner un Drive. » (scénario 1b de e2e.sh)
  autre *.leclercdrive.fr (le faux drive)     comme www en mode « test » : GET / et GET /magasin-… : la page de test testpage.html ; le reste, 404
  *.exemple-b.test (une enseigne FICTIVE      comme www en mode « test » : GET / et GET /point-… : la page de test testpage.html ; le reste, 404 ; sert à prouver
  d'essai, DRV-707)                           l'isolement entre enseignes (profils, pont, plan refusé), jamais un vrai drive
  www.auchan.fr (le faux site d'Auchan,       TOUT (hors /__) est relayé en HTTP vers le faux site d'Auchan (Node, drive-agent/fake-auchan, DRV-717), qui tourne dans
  DRV-731)                                    ce conteneur sur 127.0.0.1:8098 ; au passage, les pages HTML reçoivent le petit script de relevé /__facts.js
  compte.auchan.fr (sa page de connexion)     une page de « connexion » de test (le mot de passe est sur un autre hôte que le site) avec le même script de relevé :
                                              l'application n'y met ni pont ni agent, et le relevé le montre (scénario 21 de e2e.sh)
Pour tous les noms :
  GET  /__facts.js    le script de relevé : ce que la page voit du pont (repasHost), déposé par /__report
  POST /__report      la page y dépose ce qu'elle a relevé (JSON, 8 Ko au plus) ; les tests de l'émulateur le relisent
  GET  /__reports     la liste des relevés, en JSON
  POST /__command     le test dépose un ordre pour le faux Repas (JSON, 16 Ko au plus : un plan en tient) ; la page le prend avec GET /__command
  GET  /__command     le plus ancien ordre en attente (JSON) ou 204
  POST /__reset       vide les relevés et les ordres
  POST /__www         {"mode": "test" | "fake"} : ce que sert www.leclercdrive.fr (voir plus haut) ; « test » au démarrage, e2e.sh passe en « fake »
                      et le remet en « test » en sortant, smoke.sh le remet en « test » avant de commencer
  GET  /__www         le mode courant, en JSON

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
# Le site mobile de l'enseigne (DRV-741) en fait partie : le faux Leclerc y redirige une adresse de magasin vers l'hôte du magasin, comme le vrai site en mode ordinateur.
FAKE_LECLERC_HOSTS = {"courses-test.leclercdrive.fr", "photos-test.leclercdrive.fr", "m-courses.leclercdrive.fr"}
# L'accueil de l'enseigne (NavigationPolicy.START_URL de l'application) : relayé au faux Leclerc seulement en mode « fake » (voir l'en-tête).
HOME_HOST = "www.leclercdrive.fr"
WWW_MODES = ("test", "fake")
# L'enseigne FICTIVE d'essai de la variante de débogage de l'application (DRV-707, `TestRetailers`) : `.test` est un domaine réservé, le DNS de l'émulateur l'envoie ici.
TEST_RETAILER_DOMAIN = "exemple-b.test"
# Le faux site d'Auchan (DRV-731) : Node, en HTTP sur la boucle locale du conteneur ; seul son nom de site lui est relayé (il vérifie lui-même l'en-tête Host).
FAKE_AUCHAN = ("127.0.0.1", int(os.environ.get("FAKE_AUCHAN_PORT", "8098")))
AUCHAN_SITE_HOST = "www.auchan.fr"
AUCHAN_LOGIN_HOST = "compte.auchan.fr"
FACTS_PATH = "/__facts.js"
FACTS_TAG = ('<script src="%s"></script>' % FACTS_PATH).encode()
state = {"www": "test"}
# La page de connexion de l'enseigne, hors d'un magasin (dans les deux modes) : le vrai site exige un magasin choisi AVANT la connexion et le dit
# (« Avant de vous authentifier, veuillez sélectionner un Drive. »). Sert au scénario 1b de e2e.sh : « Se connecter » touché trop tôt.
LOGIN_PATH = "/connexion.aspx"
LOGIN_PAGE = (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion (faux site de test)</title></head>'
    "<body><h1>Connexion</h1>"
    '<p style="color:#b00020">Avant de vous authentifier, veuillez sélectionner un Drive.</p></body></html>'
).encode()
# La page de connexion d'Auchan, sur l'hôte du mot de passe : aucune donnée, le script de relevé seulement.
AUCHAN_LOGIN_PAGE = (
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Connexion (faux site de test)</title></head>'
    '<body><h1>Connexion</h1><p>Page de connexion de test : aucun mot de passe ici.</p><script src="%s"></script></body></html>' % FACTS_PATH
).encode()
# Ce que la page relève d'elle-même : les mêmes faits que testpage.html. `hostLocked` n'est vrai que si l'application a mis son pont dans la page (l'agent
# retire alors repasHost et verrouille la propriété) ; sur une page où rien n'est injecté, la propriété n'existe jamais et `hostLocked` est faux.
FACTS_SCRIPT = """(function () {
  'use strict'
  var property = Object.getOwnPropertyDescriptor(window, 'repasHost')
  var facts = {
    kind: 'load',
    hostname: location.hostname,
    path: location.pathname,
    topFrame: window.top === window,
    hostHidden: window.repasHost === undefined,
    hostLocked: !!property && property.configurable === false && property.value === undefined,
  }
  try {
    fetch('/__report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(facts) })
  } catch (e) {
    /* le scénario verra l'absence de relevé */
  }
  // Sur l'accueil du faux Auchan seulement : le lien « Se connecter » du vrai site mène à l'hôte du mot de passe (compte.auchan.fr) ; le faux site de
  // l'agent n'en a pas, ce lien de test permet de naviguer jusque-là dans l'application.
  if (location.hostname === 'www.auchan.fr' && location.pathname === '/courses') {
    var link = document.createElement('a')
    link.id = 'repas-test-login'
    link.href = 'https://compte.auchan.fr/connexion'
    link.textContent = 'Se connecter (test)'
    link.style.cssText = 'display:inline-block;margin:16px;padding:12px;font-size:20px'
    document.body.appendChild(link)
  }
})()
""".encode("utf-8")
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

    def _relay(self, target=FAKE_LECLERC, inject_facts=False):
        """Relaie la requête telle quelle à un faux site complet (Leclerc par défaut) et rend sa réponse (statut, en-têtes, corps). `inject_facts` ajoute le
        script de relevé aux pages HTML (faux Auchan, DRV-731)."""
        length = min(int(self.headers.get("Content-Length") or 0), MAX_PROXY_BYTES)
        body = self.rfile.read(length) if length else None
        headers = {key: value for key, value in self.headers.items() if key.lower() not in HOP_BY_HOP}
        headers["Host"] = self.headers.get("Host", "")
        connection = http.client.HTTPConnection(*target, timeout=60)
        try:
            connection.request(self.command, self.path, body=body, headers=headers)
            reply = connection.getresponse()
            data = reply.read()
            if inject_facts and "text/html" in (reply.getheader("Content-Type") or "").lower():
                at = data.lower().rfind(b"</body>")
                data = data + FACTS_TAG if at < 0 else data[:at] + FACTS_TAG + data[at:]
            self.send_response(reply.status)
            for key, value in reply.getheaders():
                if key.lower() not in HOP_BY_HOP:
                    self.send_header(key, value)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except OSError:
            self._send(502, b"le faux site ne repond pas")
        finally:
            connection.close()

    def _is_test_retailer(self):
        host = self._host()
        return host == TEST_RETAILER_DOMAIN or host.endswith("." + TEST_RETAILER_DOMAIN)

    def _is_fake_leclerc(self, path):
        host = self._host()
        relayed = host in FAKE_LECLERC_HOSTS or (host == HOME_HOST and state["www"] == "fake")
        return relayed and not path.startswith("/__")

    def _is_fake_auchan(self, path):
        return self._host() == AUCHAN_SITE_HOST and not path.startswith("/__")

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == FACTS_PATH:
            self._send(200, FACTS_SCRIPT, "application/javascript; charset=utf-8")
        elif self._host() == AUCHAN_LOGIN_HOST and not path.startswith("/__"):
            self._send(200, AUCHAN_LOGIN_PAGE, "text/html; charset=utf-8")
        elif self._is_fake_auchan(path):
            self._relay(FAKE_AUCHAN, inject_facts=True)
        elif self._host() == HOME_HOST and path == LOGIN_PATH:
            self._send(200, LOGIN_PAGE, "text/html; charset=utf-8")
        elif self._is_fake_leclerc(path):
            self._relay()
        elif path == "/__reports":
            with lock:
                body = json.dumps(reports).encode()
            self._send(200, body, "application/json")
        elif path == "/__www":
            self._send(200, json.dumps({"mode": state["www"]}).encode(), "application/json")
        elif path == "/__command":
            with lock:
                command = commands.pop(0) if commands else None
            if command is None:
                self._send(204)
            else:
                self._send(200, json.dumps(command).encode(), "application/json")
        elif self._host() == REPAS_HOST and not path.startswith("/__"):
            self._page(REPAS_PAGE)
        elif path == "/" or path.startswith("/magasin-") or (self._is_test_retailer() and path.startswith("/point-")):
            self._page(DRIVE_PAGE)
        else:
            self._send(404, b"introuvable")

    def do_POST(self):
        path = self.path.split("?", 1)[0]
        if self._is_fake_auchan(path):
            return self._relay(FAKE_AUCHAN, inject_facts=True)
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
        elif path == "/__www":
            try:
                mode = json.loads(raw).get("mode")
            except (ValueError, AttributeError):
                mode = None
            if mode not in WWW_MODES:
                return self._send(400, b"mode attendu : test ou fake")
            with lock:
                state["www"] = mode
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

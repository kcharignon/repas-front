#!/usr/bin/env bash
# Test de fumée de l'application « Repas Drive » dans l'émulateur (DRV-319, première livraison). Lancé par `make android-smoke` (qui construit
# l'APK de débogage et démarre l'émulateur avant), depuis la racine du dépôt.
#
# Il ne contacte JAMAIS le vrai site Leclerc : le DNS de l'émulateur envoie tout *.leclercdrive.fr vers le faux site local du conteneur
# (testsite.py, page testpage.html), et rien d'autre ne se résout. Le test le vérifie d'abord, puis une dernière fois dans le journal du DNS.
#
# Ce qu'il prouve, dans l'ordre : l'application s'installe et démarre sans planter ; une WebView affiche la page locale de test ; le script
# d'injection et le pont ont répondu sur cette page ; le menu de débogage s'ouvre ; la commande « Diagnostic de l'agent » traverse le pont
# jusqu'à la page et à l'agent ; le test automatique fait l'aller-retour complet (application, pont, agent, pont, application) et affiche son
# rapport. Les captures d'écran et le rapport texte sont dans android/dist/smoke/.
# Code de sortie : 0 si tous les contrôles passent, 1 sinon, 3 si KVM manque.
set -u
cd "$(dirname "$0")/../.."

read -ra COMPOSE <<< "${DOCKER_COMPOSE:-docker compose}"
COMPOSE+=(--profile android-emulator)
SERVICE=android-emulator
APP=eu.kantin.repas.drive
OUT=android/dist/smoke
SITE_HOST=www.leclercdrive.fr

emu() { "${COMPOSE[@]}" exec -T "$SERVICE" "$@"; }
adb() { emu adb "$@"; }
reports() { emu curl -sk "https://127.0.0.1/__reports" 2> /dev/null; }

mkdir -p "$OUT"
for old in "${OUT:?}"/*.png "${OUT:?}"/*.txt; do [ -e "$old" ] && rm -f "$old"; done
REPORT="$OUT/rapport.txt"
: > "$REPORT"
FAILURES=0
START=$SECONDS

say() { echo "$*" | tee -a "$REPORT"; }
ok() { say "  OK  $*"; }
ko() { say "  KO  $*"; FAILURES=$((FAILURES + 1)); }
check() { # check <description> <commande…> : OK si la commande réussit
  local description=$1
  shift
  if "$@" > /dev/null 2>&1; then ok "$description"; else ko "$description"; fi
}

# Attend (timeout en secondes) que la commande réussisse.
wait_until() {
  local timeout=$1
  shift
  local until=$((SECONDS + timeout))
  while ! "$@" > /dev/null 2>&1; do
    [ "$SECONDS" -lt "$until" ] && sleep 2 || return 1
  done
}

has_report() { reports | grep -q "$1"; }
screenshot() { adb exec-out screencap -p > "$OUT/$1.png" && say "      capture : $OUT/$1.png"; }
ui() { # l'arbre de l'écran en XML (uiautomator plante parfois en sortant : on réessaie)
  local attempt xml
  for attempt in 1 2 3; do
    adb shell rm -f /sdcard/ui.xml > /dev/null 2>&1
    adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1
    xml=$(adb shell cat /sdcard/ui.xml 2> /dev/null)
    if grep -q '<hierarchy' <<< "$xml"; then
      printf '%s\n' "$xml"
      return 0
    fi
    sleep 1
  done
  return 1
}
ui_has() { ui | grep -q "$1"; }

# Touche l'élément (texte ou description) dont l'attribut correspond à l'expression ; sort en erreur s'il n'est pas à l'écran.
tap() {
  local bounds x1 y1 x2 y2 attempt
  for attempt in 1 2 3 4 5; do
    bounds=$(ui | grep -o "<node [^>]*$1[^>]*>" | head -n 1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/')
    [ -n "$bounds" ] && break
    sleep 2
  done
  [ -n "$bounds" ] || return 1
  read -r x1 y1 x2 y2 <<< "$bounds"
  adb shell input tap $(((x1 + x2) / 2)) $(((y1 + y2) / 2))
}

start_app() {
  emu curl -sk -X POST "https://127.0.0.1/__reset" > /dev/null
  adb shell am force-stop "$APP"
  adb logcat -c
  adb shell am start -W -n "$APP/.MainActivity" > /dev/null
}

say "Test de fumée de Repas Drive dans l'émulateur ($(date '+%Y-%m-%d %H:%M'))"
say

# --- 0. Où l'on en est ---------------------------------------------------------------------------------------------------------------------
say "0. Émulateur et réseau"
if [ ! -c /dev/kvm ]; then
  say "  KO  /dev/kvm manque (étape humaine : sudo modprobe kvm_intel && sudo chmod 666 /dev/kvm ; voir android/README.md)"
  exit 3
fi
if [ "$(adb shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" != "1" ]; then
  ko "l'émulateur n'est pas prêt (make android-emulator-up)"
  exit 1
fi
ok "émulateur démarré ($(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r'))"
resolved=$(adb shell ping -c 1 -W 3 "$SITE_HOST" 2>&1 | head -n 1)
if grep -q '(10\.0\.2\.2)' <<< "$resolved"; then
  ok "$SITE_HOST se résout vers la machine locale (10.0.2.2), jamais vers Internet"
else
  ko "$SITE_HOST ne se résout pas vers 10.0.2.2 : $resolved. ARRÊT, pour ne pas risquer de contacter le vrai site."
  exit 1
fi
if adb shell ping -c 1 -W 3 example.org 2>&1 | grep -q 'unknown host\|Name or service not known\|bad address'; then
  ok "un autre nom (example.org) ne se résout pas : le DNS de l'émulateur est fermé"
else
  ko "un autre nom se résout : le DNS de l'émulateur n'est pas fermé"
fi

# --- 1. Installation ---------------------------------------------------------------------------------------------------------------------
say
say "1. Installation de l'APK de débogage"
APK=/apk/repas-drive-debug.apk
if ! emu test -f "$APK"; then
  ko "$APK manque (make android)"
  exit 1
fi
adb shell pm uninstall "$APP" > /dev/null 2>&1
if adb install -t "$APK" 2>&1 | grep -q Success; then
  ok "APK installé ($(adb shell dumpsys package "$APP" | grep -m1 versionName | tr -d ' \r'))"
else
  ko "l'installation de l'APK a échoué"
  exit 1
fi
# La WebView n'ignore les erreurs de certificat que pour la clé publique du faux site (jetable, créée dans le volume de l'émulateur).
spki=$(emu cat /sdk/site/spki.b64 | tr -d '\r\n')
adb shell "echo '_ --ignore-certificate-errors-spki-list=$spki' > /data/local/tmp/webview-command-line"
ok "WebView réglée pour faire confiance au certificat du faux site, et à lui seul"

# --- 2. Lancement et page locale -----------------------------------------------------------------------------------------------------------
say
say "2. Lancement et page locale de test"
start_app
if wait_until 40 has_report '"kind": "load"'; then ok "la WebView a chargé la page locale de test"; else ko "la page locale de test ne s'est pas chargée en 40 s"; fi
check "l'application tourne (pas de plantage au lancement)" adb shell pidof "$APP"
loaded=$(reports)
for fact in '"hostname": "www.leclercdrive.fr"' '"topFrame": true' '"bridge": true' '"debug": true' '"frozen": true' '"desktopAgent": true'; do
  if grep -q "$fact" <<< "$loaded"; then ok "relevé de la page : $fact"; else ko "relevé de la page manquant : $fact"; fi
done
sleep 2
screenshot 01-page-locale

# --- 3. Menu de débogage -----------------------------------------------------------------------------------------------------------------
say
say "3. Menu de débogage"
if tap 'content-desc="Menu"'; then ok "bouton Menu touché"; else ko "bouton Menu introuvable à l'écran"; fi
if wait_until 10 ui_has 'Test automatique (débogage)'; then
  ok "le menu est ouvert et propose « Test automatique (débogage) »"
else
  ko "le menu de débogage ne s'est pas ouvert"
fi
check "le menu propose aussi « Plan d'essai (débogage) »" ui_has "Plan d.essai (débogage)"
sleep 1
screenshot 02-menu

# --- 4. Pont application -> page -> agent ----------------------------------------------------------------------------------------------
say
say "4. Diagnostic de l'agent (application vers page, par le pont)"
if tap 'text="Diagnostic de l.agent"'; then ok "entrée « Diagnostic de l'agent » touchée"; else ko "entrée « Diagnostic de l'agent » introuvable"; fi
if wait_until 15 has_report '"kind": "message", "command": "diagnostic"'; then
  ok "la page a reçu la commande « diagnostic » par le pont"
else
  ko "la page n'a pas reçu la commande « diagnostic »"
fi
if wait_until 15 has_report '"kind": "agent-ui", "mounted": true'; then
  ok "l'agent injecté a monté son interface dans la page"
else
  ko "l'agent n'a pas monté son interface"
fi
sleep 3
screenshot 03-diagnostic-agent

# --- 5. Test automatique : aller-retour complet --------------------------------------------------------------------------------------
say
say "5. Test automatique (application, pont, agent, pont, application)"
start_app
wait_until 40 has_report '"kind": "load"' || ko "la page locale ne s'est pas rechargée"
if tap 'content-desc="Menu"' && wait_until 10 ui_has 'Test automatique (débogage)' && tap 'text="Test automatique (débogage)"'; then
  ok "« Test automatique (débogage) » lancé"
else
  ko "le test automatique n'a pas pu être lancé depuis le menu"
fi
if wait_until 120 ui_has 'Rapport du test automatique'; then
  ok "le rapport du test automatique s'est affiché (l'agent a répondu à l'application par le pont)"
else
  ko "pas de rapport du test automatique en 120 s"
fi
sleep 6 # le temps que l'aperçu du presse-papiers d'Android s'efface
screenshot 04-rapport-selftest
screen=$(ui)
if grep -q 'Arrêt : UNSUPPORTED_PAGE' <<< "$screen"; then
  ok "le rapport dit « UNSUPPORTED_PAGE » : normal, la page de test n'est pas une page de magasin du drive"
else
  ko "le rapport n'a pas la fin attendue (« Arrêt : UNSUPPORTED_PAGE » sur la page de test)"
fi
grep -o 'Agent : [^&]*\|Verdict : [^&]*' <<< "$screen" | sed 's/^/      rapport : /' | tee -a "$REPORT"

# --- 6. Bilan --------------------------------------------------------------------------------------------------------------------------------
say
say "6. Bilan"
check "l'application tourne toujours" adb shell pidof "$APP"
crashes=$(adb logcat -d -b crash 2> /dev/null | grep -c "Process: $APP")
if [ "$crashes" = "0" ]; then ok "aucun plantage dans le journal d'Android"; else ko "$crashes trace(s) de plantage dans le journal d'Android"; fi
if adb logcat -d 2> /dev/null | grep -q "ANR in $APP"; then ko "l'application a cessé de répondre (ANR)"; else ok "aucun « l'application ne répond pas »"; fi
forwarded=$(emu grep -c forwarded /sdk/site/dns.log 2> /dev/null)
names=$(emu grep -o "query\[[A-Z]*\] [^ ]*leclercdrive[^ ]*" /sdk/site/dns.log 2> /dev/null | awk "{print \$2}" | sort -u | tr "\n" " ")
others=$(emu grep -c "REFUSED" /sdk/site/dns.log 2> /dev/null)
if [ "${forwarded:-0}" = "0" ]; then
  ok "le DNS n'a transmis aucune demande à Internet (noms Leclerc demandés : ${names:-aucun}, tous résolus localement ; ${others:-0} réponses de refus pour tout le reste)"
else
  ko "le DNS a transmis $forwarded demande(s) à Internet"
fi
say
if [ "$FAILURES" -eq 0 ]; then
  say "RÉSULTAT : le test de fumée a réussi en $((SECONDS - START)) s. Captures et rapport : $OUT/"
  exit 0
fi
say "RÉSULTAT : $FAILURES contrôle(s) en échec ($((SECONDS - START)) s). Captures et rapport : $OUT/"
adb logcat -d -t 80 -s AndroidRuntime:E RepasDrive:W chromium:E 2> /dev/null > "$OUT/journal-android.txt"
say "Journal d'Android (extrait) : $OUT/journal-android.txt"
exit 1

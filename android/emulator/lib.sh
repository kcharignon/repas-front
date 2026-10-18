#!/usr/bin/env bash
# Les outils communs aux essais de l'émulateur (DRV-319) : `smoke.sh` (le test de fumée, `make android-smoke`) et `e2e.sh` (les scénarios complets,
# `make android-e2e`). Ce fichier se lit avec `source`, depuis la racine du dépôt, après avoir fixé OUT (le dossier des captures et du rapport).
#
# Ils ne contactent JAMAIS le vrai site Leclerc ni le vrai Repas : le DNS de l'émulateur envoie tout *.leclercdrive.fr et repas.test vers les faux
# sites locaux du conteneur, et rien d'autre ne se résout (`check_network` le vérifie avant d'ouvrir quoi que ce soit, puis `check_dns_log` une
# dernière fois dans le journal du DNS).

read -ra COMPOSE <<< "${DOCKER_COMPOSE:-docker compose}"
COMPOSE+=(--profile android-emulator)
SERVICE=android-emulator
APP=eu.kantin.repas.drive
SITE_HOST=www.leclercdrive.fr
REPAS_HOST=repas.test
# Le faux magasin Leclerc complet (drive-agent/fake-leclerc, DRV-309) : son nom d'hôte, son numéro et l'adresse de son pilotage dans le conteneur.
FAKE_STORE_HOST=courses-test.leclercdrive.fr
FAKE_STORE_ID=000001
FAKE_CONTROL=http://127.0.0.1:8099/__fake
# L'APK de débogage construit pour viser https://repas.test/ (voir le Makefile) : l'APK de débogage ordinaire vise le vrai Repas.
APK=/apk/repas-drive-smoke.apk

emu() { "${COMPOSE[@]}" exec -T "$SERVICE" "$@"; }
adb() { emu adb "$@"; }
reports() { emu curl -sk "https://127.0.0.1/__reports" 2> /dev/null; }

# Prépare le dossier de sortie (captures et rapport texte) et le compteur d'échecs. Usage : init_output <dossier>
init_output() {
  OUT=$1
  mkdir -p "$OUT"
  for old in "${OUT:?}"/*.png "${OUT:?}"/*.txt; do [ -e "$old" ] && rm -f "$old"; done
  REPORT="$OUT/rapport.txt"
  : > "$REPORT"
  FAILURES=0
  START=$SECONDS
}

say() { echo "$*" | tee -a "$REPORT"; }
ok() { say "  OK  $*"; }
ko() { say "  KO  $*"; FAILURES=$((FAILURES + 1)); }
check() { # check <description> <commande…> : OK si la commande réussit
  local description=$1
  shift
  if "$@" > /dev/null 2>&1; then ok "$description"; else ko "$description"; fi
}

# --- Lisibilité : ce que l'on voit réellement à l'écran, en dp --------------------------------------------------------------------------------
# Le site Leclerc est affiché en mode ordinateur : une fenêtre de ~980 px CSS sur ~411 dp. L'interface de l'agent doit donc s'agrandir (facteur
# ~2,4) pour que le texte et les cibles soient lisibles et touchables ; sans cela une cible de 44 px CSS ne mesure que ~18 dp.
screen_density() { adb shell wm density 2> /dev/null | grep -o '[0-9]\+' | tail -n 1; } # dpi de l'écran (420 pour un Pixel 9)
screen_width_px() { adb shell wm size 2> /dev/null | grep -o '[0-9]\+x[0-9]\+' | tail -n 1 | cut -dx -f1; }
# Les limites, en pixels physiques, du premier élément de l'écran dont l'attribut correspond à l'expression : « x1 y1 x2 y2 ».
node_bounds() { ui | grep -o "<node [^>]*$1[^>]*>" | head -n 1 | sed -E 's/.*bounds="\[([0-9]+),([0-9]+)\]\[([0-9]+),([0-9]+)\]".*/\1 \2 \3 \4/'; }
# Sa hauteur en dp (entier) : un dp fait dpi / 160 pixels.
node_height_dp() {
  local bounds x1 y1 x2 y2
  bounds=$(node_bounds "$1")
  [ -n "$bounds" ] || return 1
  read -r x1 y1 x2 y2 <<< "$bounds"
  echo $(((y2 - y1) * 160 / $(screen_density)))
}
# Les mesures de la page du drive et de l'interface de l'agent, une ligne de JSON (voir display.mjs) : par le débogage à distance de la WebView,
# qui n'existe que dans l'APK de débogage.
display_measures() {
  local pid
  pid=$(adb shell pidof "$APP" | tr -d '\r')
  [ -n "$pid" ] || return 1
  adb forward --remove-all > /dev/null 2>&1
  adb forward tcp:9222 "localabstract:webview_devtools_remote_$pid" > /dev/null 2>&1 || return 1
  emu node /opt/repas-emulator/display.mjs 2> /dev/null
}
json_number() { grep -o "\"$2\":[0-9.]*" <<< "$1" | head -n 1 | cut -d: -f2; } # json_number <json> <clé> : un nombre (clé unique)
# Vrai si le premier nombre est au moins égal au second (nombres décimaux).
at_least() { awk -v a="$1" -v b="$2" 'BEGIN { exit !(a >= b) }'; }
# Vérifie qu'un élément de l'écran est une cible tactile d'au moins 44 dp visuels et qu'il tient dans la largeur de l'écran. Usage : touch_target <expression d'attribut> <description>
touch_target() {
  local bounds x1 y1 x2 y2 height width
  bounds=$(node_bounds "$1")
  if [ -z "$bounds" ]; then
    ko "lisibilité : \"$2\" est introuvable à l'écran"
    return
  fi
  read -r x1 y1 x2 y2 <<< "$bounds"
  height=$(((y2 - y1) * 160 / $(screen_density)))
  width=$(screen_width_px)
  if [ "$height" -ge 44 ] && [ "$x1" -ge 0 ] && [ "$x2" -le "$width" ]; then
    ok "lisibilité : \"$2\" mesure $height dp de haut à l'écran (44 dp au moins) et tient dans sa largeur"
  else
    ko "lisibilité : \"$2\" mesure $height dp de haut (44 dp au moins) et occupe de $x1 à $x2 px sur $width"
  fi
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
has_report_count() { [ "$(reports | grep -o "$1" | wc -l)" -ge "$2" ]; } # au moins N relevés de ce motif
post_command() { emu curl -sk -X POST -H 'Content-Type: application/json' -d "$1" "https://127.0.0.1/__command" > /dev/null; } # un ordre pour le faux Repas
reset_reports() { emu curl -sk -X POST "https://127.0.0.1/__reset" > /dev/null; }
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
ui_lacks() { ! ui_has "$1"; }

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

screen_held() { adb shell dumpsys window 2> /dev/null | grep -m1 mHoldScreenWindow | grep -q DriveActivity; }
screen_not_held() { ! screen_held; }
# Le relevé de drive.result de ce passage, avec cette issue. Usage : result_report <runId> <issue>
result_report() {
  reports | grep -q "\"type\": \"drive.result\", \"runId\": \"$1\", \"resultType\": \"result\", \"outcome\": \"$2\""
}

start_app() { # remet les relevés à zéro et (re)lance la coquille Repas
  reset_reports
  adb shell am force-stop "$APP"
  adb logcat -c
  adb shell am start -W -n "$APP/.MainActivity" > /dev/null
}

# --- Parties communes : l'émulateur et le réseau, l'installation, le bilan du DNS -------------------------------------------------------------
# Un nom doit se résoudre vers la machine locale (10.0.2.2). Le réseau de l'émulateur met quelques secondes à répondre après la fin du démarrage :
# « hôte inconnu » est réessayé jusqu'à une minute ; un nom qui se résout AILLEURS arrête tout aussitôt (on ne risque jamais le vrai site).
# Code de retour : 0 résolu localement, 1 jamais résolu, 2 résolu vers une autre adresse.
resolves_locally() { # resolves_locally <hôte>
  local out until=$((SECONDS + 60))
  while true; do
    out=$(adb shell ping -c 1 -W 3 "$1" 2>&1 | head -n 1)
    grep -q '(10\.0\.2\.2)' <<< "$out" && return 0
    grep -q 'unknown host\|Name or service not known\|bad address\|Network is unreachable' <<< "$out" || return 2
    [ "$SECONDS" -lt "$until" ] || return 1
    sleep 3
  done
}

# Un nom de faux site qui doit pointer vers 10.0.2.2 ; sinon, ARRÊT. Usage : local_name <hôte> <description>
local_name() {
  local code=0
  resolves_locally "$1" || code=$?
  case $code in
    0) ok "$1 ($2) se résout vers la machine locale (10.0.2.2), jamais vers Internet" ;;
    1) ko "$1 ne se résout pas (le DNS de l'émulateur ne répond pas, ou le faux site manque : make android-emulator-down puis up). ARRÊT."; exit 1 ;;
    *) ko "$1 se résout vers une autre adresse que 10.0.2.2. ARRÊT, pour ne pas risquer de contacter le vrai site."; exit 1 ;;
  esac
}

# Usage : check_network [fake-leclerc] ; avec « fake-leclerc », vérifie aussi le nom du faux magasin complet et son faux site (Node).
check_network() {
  if [ ! -c /dev/kvm ]; then
    say "  KO  /dev/kvm manque (étape humaine : sudo modprobe kvm_intel && sudo chmod 666 /dev/kvm ; voir android/README.md)"
    exit 3
  fi
  if [ "$(adb shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" != "1" ]; then
    ko "l'émulateur n'est pas prêt (make android-emulator-up)"
    exit 1
  fi
  ok "émulateur démarré ($(adb shell getprop ro.product.model | tr -d '\r'), Android $(adb shell getprop ro.build.version.release | tr -d '\r'))"
  local_name "$SITE_HOST" "le faux drive"
  local_name "$REPAS_HOST" "le faux Repas"
  if [ "${1:-}" = "fake-leclerc" ]; then
    local_name "$FAKE_STORE_HOST" "le faux magasin Leclerc"
    if emu curl -s -o /dev/null "$FAKE_CONTROL/state"; then
      ok "le faux site Leclerc complet (Node, drive-agent/fake-leclerc) répond dans le conteneur"
    else
      ko "le faux site Leclerc complet ne répond pas (make android-emulator-down puis up reconstruit l'émulateur : il lui faut Node et le dossier monté). ARRÊT."
      exit 1
    fi
  fi
  if adb shell ping -c 1 -W 3 example.org 2>&1 | grep -q 'unknown host\|Name or service not known\|bad address'; then
    ok "un autre nom (example.org) ne se résout pas : le DNS de l'émulateur est fermé"
  else
    ko "un autre nom se résout : le DNS de l'émulateur n'est pas fermé"
  fi
}

# Installe l'APK de débogage visant le faux Repas, et règle la WebView pour qu'elle fasse confiance au certificat du faux site, et à lui seul.
install_apk() {
  if ! emu test -f "$APK"; then
    ko "$APK manque (make android-smoke et make android-e2e le construisent)"
    exit 1
  fi
  adb shell pm uninstall "$APP" > /dev/null 2>&1
  if adb install -t "$APK" 2>&1 | grep -q Success; then
    ok "APK installé ($(adb shell dumpsys package "$APP" | grep -m1 versionName | tr -d ' \r'))"
  else
    ko "l'installation de l'APK a échoué"
    exit 1
  fi
  # La WebView n'ignore les erreurs de certificat que pour la clé publique du faux site (jetable, créée dans le volume de l'émulateur). Ce réglage
  # vit dans l'émulateur de test (image Google APIs « userdebug »), jamais dans l'application : l'APK de publication ne fait confiance à aucun faux certificat.
  local spki
  spki=$(emu cat /sdk/site/spki.b64 | tr -d '\r\n')
  adb shell "echo '_ --ignore-certificate-errors-spki-list=$spki' > /data/local/tmp/webview-command-line"
  ok "WebView réglée pour faire confiance au certificat du faux site, et à lui seul"
}

# Le bilan commun : l'application tourne, aucun plantage ni blocage, et le DNS n'a rien transmis à Internet.
final_checks() {
  check "l'application tourne toujours" adb shell pidof "$APP"
  local crashes forwarded names others
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
}

# La conclusion : le résultat, le journal d'Android en cas d'échec, le code de sortie. Usage : conclude <nom de l'essai>
conclude() {
  say
  if [ "$FAILURES" -eq 0 ]; then
    say "RÉSULTAT : $1 a réussi en $((SECONDS - START)) s. Captures et rapport : $OUT/"
    exit 0
  fi
  say "RÉSULTAT : $FAILURES contrôle(s) en échec ($((SECONDS - START)) s). Captures et rapport : $OUT/"
  adb logcat -d -t 80 -s AndroidRuntime:E RepasDrive:W chromium:E 2> /dev/null > "$OUT/journal-android.txt"
  say "Journal d'Android (extrait) : $OUT/journal-android.txt"
  exit 1
}

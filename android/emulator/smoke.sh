#!/usr/bin/env bash
# Test de fumée de l'application Repas dans l'émulateur (DRV-319, DRV-317). Lancé par `make android-smoke` (qui construit l'APK de débogage
# visant le faux Repas local et démarre l'émulateur avant), depuis la racine du dépôt.
#
# Il ne contacte JAMAIS le vrai site Leclerc ni le vrai Repas : le DNS de l'émulateur envoie tout *.leclercdrive.fr et repas.test vers les faux
# sites locaux du conteneur (testsite.py : testpage.html pour le drive, repaspage.html pour Repas), et rien d'autre ne se résout. Le test le
# vérifie d'abord, puis une dernière fois dans le journal du DNS.
#
# Ce qu'il prouve, dans l'ordre : l'application s'installe et démarre sans planter ; la coquille charge le faux Repas ; celui-ci voit le pont
# `repasNative`, reçoit la réponse d'`app.info`, et les messages refusés reçoivent une erreur ; le menu s'ouvre (`app.menu`) ; un lien vers un
# autre site ne s'ouvre pas dans la coquille ; le menu ouvre le drive (second écran) sur le faux site, où le script d'injection et le pont
# `repasHost` ont répondu ; la commande « Diagnostic de l'agent » traverse le pont jusqu'à l'agent ; le test automatique fait l'aller-retour
# complet et affiche son rapport ; le retour ramène à la coquille, dont la page répond encore. Les captures d'écran et le rapport texte sont
# dans android/dist/smoke/.
# Code de sortie : 0 si tous les contrôles passent, 1 sinon, 3 si KVM manque.
set -u
cd "$(dirname "$0")/../.."

read -ra COMPOSE <<< "${DOCKER_COMPOSE:-docker compose}"
COMPOSE+=(--profile android-emulator)
SERVICE=android-emulator
APP=eu.kantin.repas.drive
OUT=android/dist/smoke
SITE_HOST=www.leclercdrive.fr
REPAS_HOST=repas.test
# L'APK de débogage construit pour viser https://repas.test/ (voir le Makefile) : l'APK de débogage ordinaire vise le vrai Repas.
APK=/apk/repas-drive-smoke.apk

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
has_report_count() { [ "$(reports | grep -o "$1" | wc -l)" -ge "$2" ]; } # au moins N relevés de ce motif
post_command() { emu curl -sk -X POST -H 'Content-Type: application/json' -d "$1" "https://127.0.0.1/__command" > /dev/null; } # un ordre pour le faux Repas
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
if adb shell ping -c 1 -W 3 "$REPAS_HOST" 2>&1 | head -n 1 | grep -q '(10\.0\.2\.2)'; then
  ok "$REPAS_HOST (le faux Repas) se résout vers la machine locale (10.0.2.2)"
else
  ko "$REPAS_HOST ne se résout pas vers 10.0.2.2 : le faux Repas manque (make android-emulator-down puis up reconstruit l'émulateur). ARRÊT."
  exit 1
fi
if adb shell ping -c 1 -W 3 example.org 2>&1 | grep -q 'unknown host\|Name or service not known\|bad address'; then
  ok "un autre nom (example.org) ne se résout pas : le DNS de l'émulateur est fermé"
else
  ko "un autre nom se résout : le DNS de l'émulateur n'est pas fermé"
fi

# --- 1. Installation ---------------------------------------------------------------------------------------------------------------------
say
say "1. Installation de l'APK de débogage (qui vise https://$REPAS_HOST/)"
if ! emu test -f "$APK"; then
  ko "$APK manque (make android-smoke le construit)"
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

# --- 2. La coquille Repas ------------------------------------------------------------------------------------------------------------------
say
say "2. La coquille charge le faux Repas et lui donne le pont repasNative"
start_app
if wait_until 40 has_report '"page": "repas"'; then ok "la coquille a chargé le faux Repas"; else ko "le faux Repas ne s'est pas chargé en 40 s"; fi
check "l'application tourne (pas de plantage au lancement)" adb shell pidof "$APP"
loaded=$(reports)
for fact in '"hostname": "repas.test"' '"topFrame": true' '"native": true' '"mobileAgent": true' '"cookieSet": true'; do
  if grep -q "$fact" <<< "$loaded"; then ok "relevé du faux Repas : $fact"; else ko "relevé du faux Repas manquant : $fact"; fi
done
if wait_until 15 has_report '"type": "app.info"'; then ok "app.info a reçu sa réponse"; else ko "pas de réponse à app.info"; fi
info=$(reports | grep -o '{[^{}]*"type": "app.info"[^{}]*}' | head -n 1)
say "      réponse : ${info:-aucune}"
grep -q '"drive": true' <<< "$info" && ok "app.info annonce que le drive est utilisable" || ko "app.info n'annonce pas le drive"
sleep 2
screenshot 01-coquille-repas

say
say "   Le pont refuse ce qui n'est pas valide"
post_command '{"do":"raw","text":"pas du json"}'
if wait_until 10 has_report '"type": "error", "code": "INVALID_MESSAGE"'; then ok "un message illisible reçoit INVALID_MESSAGE"; else ko "pas de réponse au message illisible"; fi
post_command '{"do":"raw","text":"{\"v\":1,\"type\":\"inconnu\"}"}'
if wait_until 10 has_report '"type": "error", "code": "UNKNOWN_TYPE"'; then ok "un type inconnu reçoit UNKNOWN_TYPE"; else ko "pas de réponse au type inconnu"; fi
post_command '{"do":"raw","text":"{\"v\":1,\"type\":\"drive.start\",\"plan\":{}}"}'
if wait_until 10 has_report '"type": "drive.error", "code": "INVALID_PLAN"'; then ok "un plan invalide reçoit drive.error INVALID_PLAN"; else ko "pas de réponse au plan invalide"; fi

# --- 3. Menu de l'application et lien externe ---------------------------------------------------------------------------------------------
say
say "3. Menu de l'application (app.menu) et lien vers un autre site"
post_command '{"do":"app.menu"}'
if wait_until 10 ui_has 'Réglages du drive'; then ok "app.menu ouvre le menu de l'application"; else ko "le menu ne s'est pas ouvert par app.menu"; fi
check "le menu propose « Ouvrir le drive Leclerc »" ui_has 'Ouvrir le drive Leclerc'
check "le menu propose « Version et mode d.emploi »" ui_has "Version et mode d.emploi"
check "le menu propose de se déconnecter de Leclerc" ui_has 'Se déconnecter de Leclerc'
sleep 1
screenshot 02-menu-repas
adb shell input keyevent KEYCODE_BACK
sleep 1
if tap 'text="Un lien vers un autre site"'; then ok "lien externe touché"; else ko "lien externe introuvable à l'écran"; fi
sleep 3
resumed=$(adb shell dumpsys activity activities 2> /dev/null | grep -m1 -E "topResumedActivity|mResumedActivity" | tr -d '\r')
if ! grep -q "$APP/.MainActivity" <<< "$resumed" || ui_has 'Aucun navigateur'; then
  ok "le lien s'ouvre hors de la coquille (navigateur du téléphone)"
else
  ko "le lien est resté dans la coquille : $resumed"
fi
if reports | grep -q '"hostname": "example.org"'; then ko "la coquille a chargé un autre site"; else ok "la coquille n'a chargé aucun autre site"; fi
adb shell am start -n "$APP/.MainActivity" > /dev/null
sleep 2

# --- 4. Passage du plan (DRV-314) --------------------------------------------------------------------------------------------------------
say
say "4. Passage du plan : drive.start, l'agent, drive.result, abandon, interruption et reprise"
RUN_A=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa
RUN_B=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb
RUN_C=cccccccc-cccc-4ccc-8ccc-cccccccccccc
RUN_D=dddddddd-dddd-4ddd-8ddd-dddddddddddd
RUN_E=eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee
start_pass() { post_command "{\"do\":\"drive.start\",\"runId\":\"$1\"}"; }
reset_reports() { emu curl -sk -X POST "https://127.0.0.1/__reset" > /dev/null; }
screen_held() { adb shell dumpsys window 2> /dev/null | grep -m1 mHoldScreenWindow | grep -q DriveActivity; }
screen_not_held() { ! screen_held; }
ui_lacks() { ! ui_has "$1"; }
result_report() { # result_report <runId> <issue> : le relevé de drive.result de ce passage, avec cette issue
  reports | grep -q "\"type\": \"drive.result\", \"runId\": \"$1\", \"resultType\": \"result\", \"outcome\": \"$2\""
}
open_pass() { # open_pass <runId> : drive.start, puis le drive s'ouvre et reçoit le plan
  reset_reports
  start_pass "$1"
  wait_until 40 has_report '"hostname": "www.leclercdrive.fr"' && wait_until 30 has_report '"command": "plan"'
}

say "   a. Jusqu'au résultat de l'agent"
if open_pass "$RUN_A"; then
  ok "drive.start ouvre le drive sur la page du magasin du plan (faux site) et le plan arrive à l'agent par le pont"
else
  ko "drive.start n'a pas mené le plan jusqu'à l'agent"
fi
check "l'écran reste allumé pendant le passage" screen_held
if wait_until 20 has_report '"kind": "agent-ui", "mounted": true'; then ok "l'agent a monté son interface (après le chargement de la page)"; else ko "l'agent n'a pas monté son interface"; fi
sleep 2
screenshot 03-passage-agent
if tap 'text="Retourner dans Repas"'; then ok "« Retourner dans Repas » touché dans l'interface de l'agent"; else ko "le bouton de retour de l'agent est introuvable"; fi
if wait_until 20 result_report "$RUN_A" error; then
  ok "Repas reçoit drive.result : le résultat de l'agent, du même runId (issue « error » : la page de test n'est pas un magasin)"
else
  ko "Repas n'a pas reçu drive.result"
fi
if wait_until 10 ui_has 'drive.result'; then ok "l'application est revenue à l'écran Repas"; else ko "l'écran Repas n'est pas revenu"; fi
check "l'écran n'est plus maintenu allumé une fois le passage fini" screen_not_held
sleep 1
screenshot 04-passage-resultat

say "   b. Abandon par l'utilisateur"
if open_pass "$RUN_B"; then ok "second passage ouvert"; else ko "le second passage n'a pas démarré"; fi
adb shell input keyevent KEYCODE_BACK
if wait_until 10 ui_has "Abandonner l.envoi"; then ok "le retour, au bout de l'historique, demande s'il faut abandonner l'envoi"; else ko "pas de demande d'abandon"; fi
sleep 1
screenshot 05-abandon
if tap 'text="Abandonner"' && wait_until 20 result_report "$RUN_B" aborted; then
  ok "l'abandon donne un résultat aborted à Repas, et l'application revient à l'écran Repas"
else
  ko "l'abandon n'a pas donné de résultat aborted"
fi
check "le résultat porte le code CANCELLED" has_report "\"runId\": \"$RUN_B\", \"resultType\": \"result\", \"outcome\": \"aborted\", \"errorCode\": \"CANCELLED\""

say "   c. Interruption, un seul passage à la fois, reprise, drive.cancel"
if open_pass "$RUN_C"; then ok "troisième passage ouvert"; else ko "le troisième passage n'a pas démarré"; fi
adb shell am start -n "$APP/.MainActivity" > /dev/null 2>&1 # l'application revient devant : l'écran du drive est refermé, le passage reste
if wait_until 15 ui_has 'Envoi interrompu'; then ok "un passage interrompu propose de le reprendre ou de l'abandonner"; else ko "pas de proposition de reprise"; fi
sleep 1
screenshot 06-reprise
start_pass "$RUN_D"
if wait_until 15 has_report "\"type\": \"drive.error\", \"code\": \"BUSY\", \"runId\": \"$RUN_C\""; then
  ok "un second plan reçoit drive.error BUSY, avec le runId du passage en cours"
else
  ko "le second plan n'a pas reçu BUSY"
fi
if tap 'text="Reprendre"' && wait_until 40 has_report_count '"command": "plan"' 2; then
  ok "« Reprendre » rouvre le drive : le plan est renvoyé à l'agent"
else
  ko "« Reprendre » n'a pas renvoyé le plan"
fi
adb shell am start -n "$APP/.MainActivity" > /dev/null 2>&1
wait_until 15 ui_has 'Envoi interrompu' || ko "pas de proposition de reprise la seconde fois"
post_command "{\"do\":\"drive.cancel\",\"runId\":\"$RUN_C\"}"
if wait_until 15 result_report "$RUN_C" aborted; then ok "drive.cancel donne un résultat aborted à Repas"; else ko "drive.cancel n'a pas donné de résultat aborted"; fi
if wait_until 10 ui_lacks 'Envoi interrompu'; then ok "la proposition de reprise disparaît"; else ko "la proposition de reprise est restée affichée"; fi
post_command "{\"do\":\"drive.cancel\",\"runId\":\"$RUN_C\"}"
if wait_until 15 has_report '"type": "drive.error", "code": "NO_PASS"'; then ok "drive.cancel sans passage en cours reçoit NO_PASS"; else ko "pas de NO_PASS"; fi

say "   d. Application tuée pendant un passage : reprise, résultat gardé jusqu'au rechargement de la page"
if open_pass "$RUN_E"; then ok "quatrième passage ouvert"; else ko "le quatrième passage n'a pas démarré"; fi
adb shell am force-stop "$APP"
reset_reports
adb shell am start -W -n "$APP/.MainActivity" > /dev/null 2>&1
if wait_until 40 ui_has 'Envoi interrompu'; then ok "après la mort du processus, le passage non terminé (moins de 24 h) est proposé à la reprise"; else ko "le passage n'a pas survécu à la mort du processus"; fi
if tap 'text="Abandonner"' && wait_until 30 result_report "$RUN_E" aborted; then
  ok "le résultat gardé est livré à la page de Repas rechargée"
else
  ko "le résultat n'a pas été livré à la page rechargée"
fi

# --- 5. Le drive, second écran -----------------------------------------------------------------------------------------------------------
say
say "5. Le menu ouvre le drive (second écran) sur le faux site"
open_drive() {
  emu curl -sk -X POST "https://127.0.0.1/__reset" > /dev/null
  tap 'content-desc="Menu"' && wait_until 10 ui_has 'Ouvrir le drive Leclerc' && tap 'text="Ouvrir le drive Leclerc"' \
    && wait_until 40 has_report '"hostname": "www.leclercdrive.fr"'
}
if open_drive; then ok "« Ouvrir le drive Leclerc » ouvre l'écran du drive, qui a chargé la page locale"; else ko "l'écran du drive ne s'est pas ouvert"; fi
loaded=$(reports)
for fact in '"topFrame": true' '"bridge": true' '"debug": true' '"frozen": true' '"desktopAgent": true'; do
  if grep -q "$fact" <<< "$loaded"; then ok "relevé du drive : $fact"; else ko "relevé du drive manquant : $fact"; fi
done
sleep 2
screenshot 07-drive

# --- 6. Pont application -> page -> agent ----------------------------------------------------------------------------------------------
say
say "6. Diagnostic de l'agent (application vers page, par le pont)"
if tap 'content-desc="Menu"'; then ok "bouton Menu du drive touché"; else ko "bouton Menu du drive introuvable à l'écran"; fi
if wait_until 10 ui_has 'Test automatique (débogage)'; then
  ok "le menu du drive propose « Test automatique (débogage) »"
else
  ko "le menu de débogage du drive ne s'est pas ouvert"
fi
check "le menu du drive propose aussi « Plan d'essai (débogage) »" ui_has "Plan d.essai (débogage)"
sleep 1
screenshot 08-menu-drive
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
screenshot 09-diagnostic-agent

# --- 7. Test automatique : aller-retour complet --------------------------------------------------------------------------------------
say
say "7. Test automatique (application, pont, agent, pont, application)"
adb shell input keyevent KEYCODE_BACK # quitte l'écran du drive : retour à la coquille
sleep 2
if open_drive && tap 'content-desc="Menu"' && wait_until 10 ui_has 'Test automatique (débogage)' && tap 'text="Test automatique (débogage)"'; then
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
screenshot 10-rapport-selftest
screen=$(ui)
if grep -q 'Arrêt : UNSUPPORTED_PAGE' <<< "$screen"; then
  ok "le rapport dit « UNSUPPORTED_PAGE » : normal, la page de test n'est pas une page de magasin du drive"
else
  ko "le rapport n'a pas la fin attendue (« Arrêt : UNSUPPORTED_PAGE » sur la page de test)"
fi
grep -o 'Agent : [^&]*\|Verdict : [^&]*' <<< "$screen" | sed 's/^/      rapport : /' | tee -a "$REPORT"

# --- 8. Retour à la coquille ------------------------------------------------------------------------------------------------------------
say
say "8. Retour à la coquille : sa page répond encore"
adb shell input keyevent KEYCODE_BACK # ferme le rapport
sleep 1
adb shell input keyevent KEYCODE_BACK # quitte l'écran du drive
sleep 2
before=$(reports | grep -o '"type": "app.info"' | wc -l)
post_command '{"do":"app.info"}'
if wait_until 15 has_report_count '"type": "app.info"' $((before + 1)); then
  ok "la page de la coquille répond encore (app.info) après le retour du drive"
else
  ko "la page de la coquille ne répond plus après le retour du drive"
fi
sleep 1
screenshot 11-retour-coquille

# --- 9. Bilan --------------------------------------------------------------------------------------------------------------------------------
say
say "9. Bilan"
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

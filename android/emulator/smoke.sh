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
source android/emulator/lib.sh # les outils communs avec e2e.sh (DRV-319, partie 2)

init_output android/dist/smoke

say "Test de fumée de Repas Drive dans l'émulateur ($(date '+%Y-%m-%d %H:%M'))"
say

# --- 0. Où l'on en est ---------------------------------------------------------------------------------------------------------------------
say "0. Émulateur et réseau"
check_network

# --- 1. Installation ---------------------------------------------------------------------------------------------------------------------
say
say "1. Installation de l'APK de débogage (qui vise https://$REPAS_HOST/)"
install_apk

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
post_command '{"do":"raw","text":"{\"v\":1,\"type\":\"drive.setup\",\"runId\":\"pas-un-uuid\"}"}'
if wait_until 10 has_report '"type": "drive.error", "code": "INVALID_SETUP"'; then ok "une lecture du magasin sans identifiant valide reçoit drive.error INVALID_SETUP"; else ko "pas de réponse à drive.setup invalide"; fi

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
# Le drive s'ouvre sur la racine de l'hôte du plan (l'accueil du magasin, constat de la recette réelle) : l'utilisateur ouvre son magasin lui-même.
open_home() { # open_home <runId> : drive.start, puis le drive s'ouvre sur la racine de l'hôte, avec le message qui dit d'ouvrir son magasin
  reset_reports
  start_pass "$1"
  wait_until 40 has_report '"hostname": "www.leclercdrive.fr", "path": "/"' && wait_until 20 ui_has 'Commencer mes courses'
}
open_store() { tap 'text="Choisir mon magasin de test"' && wait_until 30 has_report '"command": "plan"'; } # l'utilisateur touche son magasin : le plan part vers l'agent
open_pass() { # open_pass <runId> : drive.start, l'accueil, le magasin ouvert, le plan reçu par l'agent
  open_home "$1" && open_store
}

say "   a. Jusqu'au résultat de l'agent"
if open_home "$RUN_A"; then
  ok "drive.start ouvre le drive sur la racine de l'hôte du plan (l'accueil du magasin), avec le message « Commencer mes courses »"
else
  ko "drive.start n'a pas ouvert l'accueil du drive avec son message"
fi
check "le drive ne s'est jamais ouvert sur /magasin-123456-123456/ (page 404 du vrai site)" not_reported '"path": "/magasin-123456-123456/"'
check "tant que l'utilisateur n'a pas ouvert son magasin, l'agent ne reçoit rien" not_reported '"command": "plan"'
screenshot 03a-accueil-du-drive
if open_store; then
  ok "l'utilisateur touche son magasin (lien touché) : le plan arrive à l'agent par le pont, tout seul"
else
  ko "le plan n'est pas arrivé à l'agent une fois le magasin ouvert"
fi
check "le magasin ouvert est une page de magasin avec sa ville (/magasin-123456-123456-Ville-Test/…)" \
  has_report '"path": "/magasin-123456-123456-Ville-Test/accueil.aspx"'
check "l'écran reste allumé pendant le passage" screen_held
if wait_until 20 has_report '"kind": "agent-ui", "mounted": true'; then ok "l'agent a monté son interface (après le chargement de la page)"; else ko "l'agent n'a pas monté son interface"; fi
if wait_until 15 ui_has 'Prêt à remplir ton panier'; then ok "l'agent affiche son récapitulatif, sans que l'utilisateur ait à naviguer"; else ko "l'agent n'a pas affiché son récapitulatif"; fi
sleep 2
screenshot 03-passage-agent
if tap 'text="Annuler"' && tap 'text="Retourner dans Repas"'; then ok "« Annuler » puis « Retourner dans Repas » touchés dans l'interface de l'agent"; else ko "les boutons de l'agent sont introuvables"; fi
if wait_until 20 result_report "$RUN_A" aborted; then
  ok "Repas reçoit drive.result : le résultat de l'agent, du même runId (issue « aborted » : l'utilisateur a annulé au récapitulatif)"
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
post_command "{\"do\":\"drive.setup\",\"runId\":\"$RUN_D\"}"
if wait_until 15 has_report_count "\"type\": \"drive.error\", \"code\": \"BUSY\", \"runId\": \"$RUN_C\"" 2; then
  ok "une lecture du magasin pendant un passage reçoit aussi drive.error BUSY"
else
  ko "la lecture du magasin pendant un passage n'a pas reçu BUSY"
fi
if tap 'text="Reprendre"' && wait_until 40 ui_has 'Commencer mes courses' && tap 'text="Choisir mon magasin de test"' && wait_until 40 has_report_count '"command": "plan"' 2; then
  ok "« Reprendre » rouvre le drive sur l'accueil ; une fois le magasin ouvert, le plan est renvoyé à l'agent"
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

# --- 4b. Lecture du magasin (DRV-320) ---------------------------------------------------------------------------------------------------
say
say "4b. Lecture du magasin : drive.setup, l'agent, setup-result et abandon"
RUN_F=ffffffff-ffff-4fff-8fff-ffffffffffff
RUN_G=99999999-9999-4999-8999-999999999999
start_setup() { post_command "{\"do\":\"drive.setup\",\"runId\":\"$1\"}"; }
store_report() { # store_report <runId> : Repas a reçu le magasin lu pour cette lecture (identifiant et hôte du faux site)
  reports | grep -q "\"runId\": \"$1\", \"resultType\": \"setup-result\", \"lines\": -1, \"hasStore\": true, \"storeId\": \"123456\", \"storeHost\": \"$SITE_HOST\""
}
no_setup_yet() { ! has_report '"command": "setup"'; }

say "   a. Se connecter, choisir son magasin, puis l'agent le lit"
reset_reports
start_setup "$RUN_F"
if wait_until 40 has_report '"hostname": "www.leclercdrive.fr", "path": "/"'; then
  ok "drive.setup ouvre le drive sur l'accueil (faux site)"
else
  ko "drive.setup n'a pas ouvert l'accueil du drive"
fi
if wait_until 10 ui_has 'choisis ton magasin'; then ok "le message en français simple (se connecter, choisir son magasin) est à l'écran"; else ko "le message de la lecture du magasin n'est pas à l'écran"; fi
check "l'écran reste allumé pendant la lecture" screen_held
sleep 6
check "tant que la page n'est pas celle d'un magasin, rien n'est envoyé à l'agent" no_setup_yet
screenshot 12-lecture-magasin-accueil
if tap 'text="Choisir mon magasin de test"'; then ok "magasin choisi sur le faux site (lien touché)"; else ko "le lien du magasin est introuvable à l'écran"; fi
if wait_until 30 has_report '"command": "setup"'; then ok "sur la page du magasin, l'agent reçoit le message setup par le pont"; else ko "l'agent n'a pas reçu le message setup"; fi
if wait_until 15 ui_has 'Enregistrer ce magasin'; then ok "l'agent demande confirmation (écran « Enregistrer ce magasin dans Repas ? »)"; else ko "l'agent n'a pas affiché sa confirmation"; fi
check "le message de la lecture du magasin a disparu (l'agent a pris la main)" ui_lacks 'Connecte-toi à Leclerc'
sleep 1
screenshot 13-lecture-magasin-confirmation
if tap 'text="Enregistrer"'; then ok "« Enregistrer » touché dans l'interface de l'agent"; else ko "le bouton « Enregistrer » est introuvable"; fi
if wait_until 20 store_report "$RUN_F"; then
  ok "Repas reçoit drive.result : le setup-result de l'agent (identifiant et hôte du magasin du faux site), du même runId"
else
  ko "Repas n'a pas reçu le magasin lu"
fi
if wait_until 10 ui_has 'magasin 123456'; then ok "l'application est revenue à l'écran Repas"; else ko "l'écran Repas n'est pas revenu"; fi
check "l'écran n'est plus maintenu allumé une fois la lecture finie" screen_not_held
sleep 1
screenshot 14-lecture-magasin-resultat

say "   b. Abandon par l'utilisateur"
reset_reports
start_setup "$RUN_G"
if wait_until 40 has_report '"hostname": "www.leclercdrive.fr", "path": "/"'; then ok "seconde lecture ouverte"; else ko "la seconde lecture n'a pas démarré"; fi
adb shell input keyevent KEYCODE_BACK
if wait_until 10 ui_has "Abandonner la lecture du magasin"; then ok "le retour demande s'il faut abandonner la lecture du magasin"; else ko "pas de demande d'abandon de la lecture"; fi
sleep 1
screenshot 15-lecture-magasin-abandon
if tap 'text="Abandonner"' && wait_until 20 has_report "\"runId\": \"$RUN_G\", \"resultType\": \"result\", \"outcome\": \"aborted\", \"errorCode\": \"CANCELLED\", \"lines\": 0, \"hasStore\": false"; then
  ok "l'abandon donne un résultat aborted à Repas, sans magasin"
else
  ko "l'abandon de la lecture n'a pas donné de résultat aborted"
fi
if wait_until 10 ui_has 'drive.result'; then ok "l'application est revenue à l'écran Repas"; else ko "l'écran Repas n'est pas revenu"; fi

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

# La page de Leclerc s'affiche en mode ordinateur (fenêtre de 980 px CSS sur ~411 dp) : son texte est petit. Le menu l'agrandit d'un cran, sans geste.
# On lit l'échelle de la page (dp par pixel CSS) dans la WebView : la page se zoome autour du centre de l'écran, un lien du haut de page sort du cadre.
page_scale() { json_number "$(display_measures)" scale; }
small=$(page_scale)
if tap 'content-desc="Menu"' && wait_until 10 ui_has 'Agrandir la page' && tap 'text="Agrandir la page"'; then
  sleep 2
  big=$(page_scale)
  if [ -n "$small" ] && [ -n "$big" ] && at_least "$big" "$(awk -v a="$small" 'BEGIN { print a * 1.3 }')"; then
    ok "« Agrandir la page » agrandit la page de Leclerc (échelle de la page : $small, puis $big dp par pixel CSS)"
  else
    ko "« Agrandir la page » n'a pas agrandi la page (échelle : ${small:-?}, puis ${big:-?})"
  fi
  screenshot 07b-drive-agrandi
  if tap 'content-desc="Menu"' && wait_until 10 ui_has 'Réduire la page' && tap 'text="Réduire la page"'; then
    sleep 2
    back=$(page_scale)
    if [ -n "$back" ] && at_least "$big" "$(awk -v a="$back" 'BEGIN { print a * 1.3 }')"; then
      ok "« Réduire la page » la réduit (échelle de la page : $big, puis $back)"
    else
      ko "« Réduire la page » n'a rien changé (échelle : ${back:-?})"
    fi
  else
    ko "l'entrée « Réduire la page » du menu est introuvable"
  fi
else
  ko "l'entrée « Agrandir la page » du menu est introuvable"
fi

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
final_checks
conclude "le test de fumée"

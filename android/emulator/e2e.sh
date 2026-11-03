#!/usr/bin/env bash
# Les scénarios complets de l'application Repas dans l'émulateur (DRV-319, partie 2). Lancé par `make android-e2e` (qui construit l'APK de
# débogage visant le faux Repas local et démarre l'émulateur avant), depuis la racine du dépôt.
#
# Là où le test de fumée (`smoke.sh`) prouve la coquille et le pont avec une page de test, ce fichier joue de VRAIS passages : l'agent réel, dans la
# vraie WebView du drive, contre le faux site Leclerc complet (`drive-agent/fake-leclerc`, Node, catalogue de produits inventés, panier, défauts
# simulés, cadence jugée), avec le faux Repas (`repaspage.html`) qui joue le front. Depuis DRV-754 Leclerc passe par sa VERSION MOBILE et le faux site la joue
# (`behavior.mobile`, formes mesurées le 2026-11-01) : l'accueil sur `www.leclercdrive.fr`, les pages du magasin sur `m-courses.leclercdrive.fr` (sans `.aspx`), le SERVEUR du
# magasin `fd8-courses.leclercdrive.fr` (recherche et panier en AJAX : c'est l'hôte que nomme le plan) et le compte `fd8-espace-client.leclercdrive.fr`, tous en HTTPS. Les deux faux
# sites sont dans le conteneur de l'émulateur : le DNS n'envoie nulle part ailleurs, JAMAIS vers le vrai Leclerc ni le vrai Repas (vérifié d'abord et à la fin).
#
# Les scénarios, dans l'ordre (DRV-767, décision du propriétaire du 2026-11-03 : on ne garde dans l'émulateur que ce que rien d'autre ne couvre ; chacun repart d'un faux Leclerc remis à neuf) :
#   5. application tuée en plein passage, puis reprise : le passage repart, se termine, le panier est exact et Repas reçoit le résultat ;
#  22. la session de Repas à rotation (DRV-765) : le faux Repas émet un nouveau cookie persistant à chaque chargement et refuse un cookie qui n'est pas le dernier émis ;
#      l'application arrêtée (`am force-stop`, qui joue l'arrêt du processus mais n'est PAS le vrai installateur d'Android) relit, au lancement suivant, le DERNIER cookie : 22a, rotation du
#      chargement de la page ; 22b, rotation faite par la page cachée PENDANT LA PAUSE (application en arrière-plan), arrêt 1 s après.
#
# Retirés le 2026-11-03 (DRV-767). Ils ne sont PAS rangés dans un « jeu complet » : leur logique se joue plus bas dans la pyramide, plus vite et sans émulateur. Correspondance établie sur les NOMS
# des tests, pas sur une relecture ligne à ligne ; ce qui reste douteux se juge à la recette sur téléphone avec les vrais sites, qui fait foi :
#   1, 1b, 1c, 8, 8b (lecture du magasin, autre magasin choisi) : `drive-agent/e2e/pont.spec.ts`, `carte-guide-magasins.spec.ts`, `entree.spec.ts` ; Kotlin `DrivePassTest`, `SetupAddressTest`, `StoreArrivalTest`, `ResultReportTest`.
#   2, 3, 4 (passage complet, annuler l'envoi, abandon) : `passage.spec.ts`, `choix.spec.ts` ; Kotlin `DrivePassTest`, `PlanDeliveryTest`, `ResultReportTest` ; l'aller-retour complet avec le vrai pont natif : `make android-smoke`.
#   6, 7 (blocage 403, site changé) : `incidents.spec.ts` ; Kotlin `DrivePassTest`.
#   9, 10, 11, 12, 18 (page d'ouverture refusée, lente ou bloquée ; bouton sans adresse ; clic de programme ignoré) : `entree.spec.ts`, `mobile.spec.ts`, `incidents.spec.ts` ; Kotlin `OpeningWatchTest`, `LoadProblemTest`, `StoreBannerTest`, `StoreArrivalTest`.
#   13, 14 (nouveaux articles, quantité à vérifier) : `choix.spec.ts`, `contenance.spec.ts`.
#   15, 16, 16b, 17 (« Finaliser sur Leclerc » et ses replis) : Kotlin `FinalizeOutcomeTest`, `StorePathMemoryTest`, `PlanOpeningPageTest`.
#   19 (seconde enseigne fictive) : Kotlin `RetailerIsolationTest`, `ScreenRetailerTest`, `RetailerSitesTest`.
#   21 (Auchan) : `auchan.spec.ts`, `auchan-recherche.spec.ts`, `carte-guide-auchan.spec.ts` ; Kotlin `AuchanSiteTest`.
#
# Lecture de l'écran : `uiautomator dump` attend que l'arbre d'accessibilité se repose ; la carte du guide de l'agent (agent 0.62.x) le fait clignoter deux fois par seconde (défaut constaté pendant DRV-766, DRV-768) : tant que ce défaut existe, `ui` (lib.sh) lit l'écran JavaScript coupé (`quiet.mjs`, débogage à distance, APK de débogage).
# Les captures d'écran et le rapport texte sont dans android/dist/e2e/.
# Code de sortie : 0 si tous les contrôles passent, 1 sinon, 3 si KVM manque.
set -u
cd "$(dirname "$0")/../.."
source android/emulator/lib.sh # les outils communs avec smoke.sh

init_output android/dist/e2e
PLANS=android/emulator/e2e

# --- Quels scénarios jouer (DRV-767) ----------------------------------------------------------------------------------------------------------------
# SCENARIOS vide : tous ceux du fichier, avec un BUDGET de BUDGET_SECONDS de bout en bout (démarrage de l émulateur compris : `make android-e2e` pose E2E_STARTED_AT avant de construire
# l APK et de démarrer l émulateur) ; plus long, la passe ÉCHOUE. SCENARIOS="22" : seulement celui-là, sans budget. Le scénario 0 (réseau, installation, premier lancement) et le bilan
# sont toujours joués.
ALL_SCENARIOS="5 22"
BUDGET_SECONDS=300
E2E_STARTED_AT=${E2E_STARTED_AT:-$(date +%s)}
BUDGET_APPLIES=0
case "${SCENARIOS:-}" in
  "") SELECTED=$ALL_SCENARIOS BUDGET_APPLIES=1 ;;
  *) SELECTED=${SCENARIOS//,/ } ;;
esac
for id in $SELECTED; do
  case " $ALL_SCENARIOS " in
    *" $id "*) ;;
    *)
      echo "Scénario inconnu : $id (connus : $ALL_SCENARIOS)" >&2
      exit 2
      ;;
  esac
done
CART_FULL='{"1000001":3,"1000006":1,"1000021":2}' # le panier attendu après le passage complet : farine x3, sucre x1, poivre moulu x2
CART_KNOWN='{"1000001":3,"1000006":1}'             # celui de la phase A seule

# --- Le faux Leclerc complet, vu de l'intérieur du conteneur (son pilotage n'est offert qu'aux noms de la boucle locale, jamais à l'émulateur) ---
fake_state() { emu curl -s "$FAKE_CONTROL/state"; }
fake_behavior() { emu curl -s -X POST -H 'Content-Type: application/json' -d "$1" "$FAKE_CONTROL/behavior" > /dev/null; }
# Remise à neuf : le faux Leclerc joue la VERSION MOBILE du vrai site (DRV-754) : la personne est connectée et son magasin est choisi, l'accueil de l'enseigne
# (`www`) a, comme le VRAI site, un bouton « Commencer mes courses » SANS adresse qui ouvre la page du magasin sur `m-courses` (DRV-629). Les scénarios du premier usage
# (1, 1b, 8), du clic ignoré (18) et de la page 404 (12) changent ce comportement.
fake_reset() { emu curl -s -X POST "$FAKE_CONTROL/reset" > /dev/null; fake_behavior '{"mobile":{"member":true,"chosen":true}}'; reset_reports; }
cart_is() { fake_state | grep -qF "\"cart\":$1,\"behavior\""; } # cart_is '{"1000001":3}'
no_violations() { fake_state | grep -q '"violations":\[\]'; }
no_rejected() { ! fake_state | grep -q '"rejected"'; }
paced_count() { fake_state | grep -o '"kind":"\(search\|cart\)"' | wc -l; }
no_cart_write() { ! fake_state | grep -q '"kind":"cart"'; }
nothing_sent() { [ "$(paced_count)" = "0" ]; }
requested() { fake_state | grep -qF "\"path\":\"$1\""; } # le faux Leclerc a reçu une requête sur ce chemin
not_requested() { ! requested "$1"; }
requested_on() { fake_state | grep -qF "\"host\":\"$1\",\"path\":\"$2\""; } # ... sur ce nom d'hôte et ce chemin (requested_on <hôte> <chemin>)
not_requested_on() { ! requested_on "$1" "$2"; }
min_gap() { # le plus petit délai (ms) entre la fin d'une requête de l'agent (recherche, panier) et le début de la suivante
  fake_state | emu python3 -c 'import json,sys
d=json.load(sys.stdin)
p=[r for r in d["requests"] if r["kind"] in ("search","cart")]
g=[round(b["startedAt"]-a["endedAt"]) for a,b in zip(p,p[1:])]
print(min(g) if g else 99999)' 2> /dev/null
}
polite_agent() { # jamais deux requêtes en parallèle, jamais plus vite que 800 ms, aucune requête refusée pour une forme inexacte
  local gap
  gap=$(min_gap)
  if no_violations && no_rejected && [ "${gap:-0}" -ge 795 ]; then
    ok "cadence respectée dans la vraie WebView : $(paced_count) requêtes, au moins ${gap} ms entre deux, aucune en parallèle, aucune refusée pour sa forme"
  else
    ko "cadence ou forme des requêtes non respectées (violations, requêtes refusées ou délai de ${gap:-?} ms) : $(fake_state | cut -c1-300)"
  fi
}

# --- Les ordres que Repas (le faux) envoie à l'application ----------------------------------------------------------------------------------------
start_plan() { # start_plan <runId> <fichier de plan> : Repas envoie drive.start avec ce plan (une seule ligne de JSON)
  local plan
  plan=$(sed "s/__RUN_ID__/$1/" "$PLANS/$2" | tr -d '\n')
  printf '{"do":"drive.start","plan":%s}' "$plan" | emu curl -sk -X POST -H 'Content-Type: application/json' --data-binary @- "https://127.0.0.1/__command" > /dev/null
}
start_setup() { post_command "{\"do\":\"drive.setup\",\"runId\":\"$1\"}"; }
# Le relevé de Repas pour un résultat de ce passage : issue, code d'erreur éventuel et détail des lignes.
result_has() { reports | grep -qF "\"runId\": \"$1\", \"resultType\": \"result\", \"outcome\": \"$2\"$3"; }
result_detail() { reports | grep -qF "\"detail\": \"$1\""; }
agent_screen() { ui_has "$1"; }
mobile_host_never_reported() { ! reports | grep -qF "\"storeHost\": \"$MOBILE_HOST\""; } # aucun relevé de Repas ne porte l'hôte des pages de la version mobile (DRV-741, DRV-754)
# Le bouton du bandeau d'en-tête (ticket E) : exactement ce texte, pas la phrase du bandeau qui le cite.
home_button() { ui_has 'text="Ouvrir l’accueil du drive"'; }
home_button_absent() { ! home_button; }
open_home() { tap 'text="Ouvrir l’accueil du drive"'; }

# Le drive s'ouvre sur l'accueil de l'enseigne (www), qui affiche l'accueil du magasin (constat de la recette réelle). DRV-625 : l'AGENT y suit lui-même
# « Commencer mes courses » (l'application ne clique jamais à sa place : elle envoie le plan à l'agent de l'accueil, et c'est lui qui suit le lien), puis
# le plan repart vers la page du magasin et l'agent affiche son récapitulatif. Aucun toucher de l'utilisateur.
# DRV-648/649 (agent 0.39.0, « une intention = un clic ») : plus d'écran « Prêt à remplir ton panier » ni de « Commencer » : dès que l'agent est dans le magasin,
# le passage démarre tout seul (écran « Ton panier se remplit », ou déjà le choix d'un produit / la quantité à vérifier).
agent_started() { ui_has 'Ton panier se remplit\|Choix de produit\|Vérifie la quantité'; }
enter_store() { wait_until 70 agent_started; }
# Le bouton « Choisir » d'une fiche de produit s'appelle « Choisir : <nom du produit> » (le premier proposé est pris).
CHOOSE='text="Choisir : '
# Un envoi qui se termine sans autre geste : Repas reçoit « completed » tout seul et le panier est celui des produits connus.
finish_known() { # finish_known <runId>
  wait_until 90 result_has "$1" completed '' && cart_is "$CART_KNOWN"
}
# Quand l'agent ne peut pas entrer (lien refusé, absent), il le dit et l'UTILISATEUR touche le bouton du site.
enter_store_by_hand() { wait_until 70 ui_has 'text="Commencer mes courses"' && tap 'text="Commencer mes courses"'; }
# Le passage s'ouvre : le plan arrive à l'agent de l'accueil, qui entre dans le magasin tout seul et affiche son récapitulatif.
open_pass() { # open_pass <runId> <fichier de plan>
  fake_reset
  start_plan "$1" "$2"
  enter_store
}
focused_is_drive() { adb shell dumpsys window 2> /dev/null | grep -m1 mCurrentFocus | grep -q DriveActivity; } # l'écran du drive de l'application a le focus
back_to_repas() { # le résultat est livré à Repas, qui est revenu devant
  wait_until 20 ui_has 'drive.result'
}

# DRV-759 : un envoi s'ouvre DIRECTEMENT sur la page du magasin que l'application a retenue (la dernière page de magasin vue dans le drive) : le parcours ne repart plus de
# l'accueil, champ du code postal vide. Pour jouer le départ par l'ACCUEIL de l'enseigne (l'agent y suit « Commencer mes courses »), on efface ce chemin retenu et le passage gardé,
# comme au scénario 17, puis on relance l'application.
forget_store_path() {
  adb shell am force-stop "$APP"
  adb shell run-as "$APP" rm -f shared_prefs/drive-store.xml shared_prefs/drive-pass.xml > /dev/null 2>&1
  start_app
  wait_until 40 has_report '"page": "repas"' || ko "le faux Repas ne s'est pas chargé"
}

say "Scénarios complets de Repas dans l'émulateur, contre le faux Leclerc ($(date '+%Y-%m-%d %H:%M'))"
say

# --- 0. Où l'on en est ---------------------------------------------------------------------------------------------------------------------
say "0. Émulateur, réseau et faux sites"
check_network fake-leclerc
# L'accueil de l'enseigne (www, la page de départ d'un plan et de la lecture du magasin) est servi par le faux Leclerc complet pendant ces
# scénarios, et redevient la page locale de test du test de fumée en sortant (quelle que soit la sortie).
www_mode fake
trap 'www_mode test' EXIT
fake_reset # la version mobile, session ouverte et magasin choisi : l'accueil porte « Commencer mes courses »
if emu curl -sk -H "Host: $SITE_HOST" "https://127.0.0.1/" | grep -q 'Commencer mes courses'; then
  ok "l'accueil de l'enseigne ($SITE_HOST) est servi par le faux Leclerc complet (version mobile) : le bouton « Commencer mes courses » du magasin choisi"
else
  ko "l'accueil de l'enseigne n'est pas servi par le faux Leclerc complet (make android-emulator-down puis up reconstruit l'émulateur). ARRÊT."
  exit 1
fi
if [ "$(emu curl -sk -o /dev/null -w '%{http_code}' -H "Host: $FAKE_STORE_HOST" "https://127.0.0.1/")" = "404" ]; then
  ok "la racine de l'hôte du serveur du magasin ($FAKE_STORE_HOST) est une page 404, comme sur le vrai site (recette réelle du 2026-10-18)"
else
  ko "la racine de l'hôte du serveur du magasin n'est pas une page 404 : le faux site cacherait le défaut au lieu de l'attraper. ARRÊT."
  exit 1
fi
say
say "   Installation de l'APK de débogage (qui vise https://$REPAS_HOST/)"
install_apk
start_app
if wait_until 40 has_report '"page": "repas"'; then ok "la coquille a chargé le faux Repas"; else ko "le faux Repas ne s'est pas chargé en 40 s"; fi
if wait_until 15 has_report '"drive": true'; then ok "app.info annonce que le drive est utilisable"; else ko "app.info n'annonce pas le drive"; fi
if wait_until 15 has_report '"retailers": \["leclerc", "auchan"\]'; then
  ok "app.info annonce les enseignes servies (retailers) : Leclerc puis Auchan, jamais l'enseigne d'essai de l'APK de débogage"
else
  ko "app.info n'annonce pas retailers [leclerc, auchan]"
fi

scenario_5() {
# --- 5. Application tuée en plein passage, puis reprise ---------------------------------------------------------------------------------
say
say "5. Application tuée en plein passage, puis reprise"
RUN_RESUME=4e5a0000-0000-4000-8000-000000000005
if open_pass "$RUN_RESUME" plan-complet.json; then ok "le passage démarre"; else ko "le passage n'a pas démarré"; fi
if wait_until 60 ui_has 'Il te faut' && cart_is "$CART_KNOWN"; then
  ok "la phase A est faite (panier : farine x3, sucre x1), l'agent attend le choix du poivre"
else
  ko "le passage n'est pas arrivé à l'attente du choix"
fi
adb shell am force-stop "$APP"
reset_reports
adb shell am start -W -n "$APP/.MainActivity" > /dev/null 2>&1
if wait_until 40 ui_has 'Envoi interrompu'; then ok "après la mort du processus, le passage est proposé à la reprise"; else ko "le passage n'a pas survécu à la mort du processus"; fi
sleep 1
screenshot e10-reprise
if tap 'text="Reprendre"'; then ok "« Reprendre » touché"; else ko "le bouton « Reprendre » est introuvable"; fi
# La WebView est neuve et le drive se rouvre sur l'accueil : l'utilisateur rouvre son magasin, la session de l'agent est perdue, il repart du récapitulatif
# (les quantités étant absolues, refaire la phase A est sans risque).
# (DRV-625 : l'agent suit lui-même « Commencer mes courses » sur l'accueil rouvert ; aucun toucher.)
resumed=0
until=$((SECONDS + 70))
while [ "$SECONDS" -lt "$until" ]; do
  if ui_has 'Ton panier se remplit\|Il te faut'; then
    resumed=1
    break
  fi
  sleep 2
done
if [ "$resumed" = "1" ]; then ok "le drive se rouvre et le plan est renvoyé à l'agent (le passage reprend)"; else ko "le plan n'a pas été renvoyé à l'agent"; fi
wait_until 60 ui_has 'Il te faut' || ko "la liste de choix ne s'est pas affichée après la reprise"
tap "$CHOOSE" || ko "aucun bouton « Choisir » à l'écran"
if wait_until 60 result_has "$RUN_RESUME" completed ''; then
  ok "le passage repris se termine et Repas reçoit le résultat « completed » tout seul"
else
  ko "Repas n'a pas reçu le résultat du passage repris"
fi
check "le panier du faux Leclerc est exact, sans doublon (farine x3, sucre x1, poivre x2)" cart_is "$CART_FULL"
polite_agent
check "le résultat détaille chaque ligne" \
  result_detail 'farine:ADDED:1000001:3,sucre:ADDED:1000006:1,sel:HAVE_AT_HOME::,huile:SKIPPED::,poivre:CHOSEN:1000021:2'
back_to_repas || ko "l'écran Repas n'est pas revenu"

}

scenario_22() {
# --- 22. La session de Repas à rotation survit à l'arrêt du processus (DRV-765) ---------------------------------------------------------------
# Le cookie de session de Repas est à ROTATION : chaque usage en invalide l'ancien et en pose un nouveau. Si le dernier n'est pas sur le disque quand le
# processus s'arrête (l'installation d'une mise à jour l'arrête), la WebView relit l'ancien au redémarrage : le serveur le refuse et la personne doit
# retaper son mot de passe. Le faux Repas simule la rotation (POST /api/auth/refresh à chaque chargement de page, voir testsite.py) ; `am force-stop` joue
# l'arrêt du processus, MAIS ce n'est PAS le vrai installateur d'Android. Les numéros de cookie sont fictifs. Écarts connus avec le vrai serveur (ADR 0015) : le faux
# cookie est en `Path=/` et `SameSite=Lax`, et il n'y a aucune fenêtre de grâce (un cookie déjà utilisé est refusé tout de suite). Deux cas :
#   22a. la rotation du chargement de la page, puis l'arrêt environ 3 s après (plus que l'écriture retardée de 2 s, moins que 5 s) ;
#   22b. la rotation arrive PENDANT LA PAUSE : l'application est en arrière-plan (HOME, comme derrière l'installateur), la page cachée continue ses minuteries et fait tourner le
#        cookie, l'arrêt a lieu environ 1 s après la rotation vue côté serveur (seule l'écriture répétée pendant la pause peut l'avoir sauvée).
rotation_on() { emu curl -sk -X POST -H 'Content-Type: application/json' -d "{\"on\":$1}" "https://127.0.0.1/__rotation" > /dev/null; }
rotation_state() { emu curl -sk "https://127.0.0.1/__rotation"; }
rotation_issued() { rotation_state | grep -q "\"issued\": $1[,}]"; } # le faux Repas a émis exactement N cookies
rotation_events() { [ "$(rotation_state | grep -o '"received"' | wc -l)" -ge "$1" ]; } # au moins N cookies présentés au faux Repas
rotation_all_valid() { ! rotation_state | grep -q '"valid": false'; } # chaque cookie présenté était le dernier émis
# Attend vite (un contrôle toutes les 0,3 s) que le faux Repas ait émis N cookies : pour arrêter l'application peu de temps après. Usage : rotation_seen <N> <secondes>
rotation_seen() {
  local tries=$(($2 * 3)) i
  for ((i = 0; i < tries; i++)); do
    rotation_issued "$1" && return 0
    sleep 0.3
  done
  return 1
}
session_scenario() {
  rotation_on true
  # Premier lancement : pas encore de cookie, le site en reçoit un (n° 1).
  start_app
  if rotation_seen 1 40; then ok "premier lancement : le faux Repas émet le cookie de session n° 1"; else ko "le faux Repas n'a pas émis de cookie au premier lancement : $(rotation_state)"; fi
  # Fermeture ordinaire (le téléphone est posé) : l'application passe en arrière-plan, le cookie n° 1 est écrit sur le disque.
  sleep 3
  adb shell input keyevent KEYCODE_HOME
  sleep 3
  # Deuxième lancement : le site présente le n° 1 et reçoit le n° 2 (la rotation).
  start_app
  if rotation_seen 2 40; then ok "deuxième lancement : le cookie n° 1 est accepté, le faux Repas émet le n° 2"; else ko "la rotation du deuxième lancement n'a pas eu lieu : $(rotation_state)"; fi
  # 22a. L'arrêt brutal, environ 3 s après la rotation et sans que l'application ait été mise en arrière-plan.
  sleep 3
  adb shell am force-stop "$APP"
  start_app
  if rotation_seen 3 40; then ok "22a. troisième lancement, après l'arrêt du processus : le site est reconnu (le n° 2 est présenté, le n° 3 émis)"; else ko "22a. après l'arrêt du processus, le site n'est plus reconnu : $(rotation_state)"; fi
  check "22a. chaque cookie présenté était le dernier émis (la session survit à l'arrêt du processus)" rotation_all_valid
  # 22b. La rotation pendant la pause : le n° 3 est sur le disque (arrière-plan ordinaire), puis la page cachée fait tourner le cookie 3 s plus tard.
  sleep 3
  adb shell input keyevent KEYCODE_HOME
  sleep 1
  post_command '{"do":"rotate","afterMs":3000}'
  if rotation_seen 4 30; then ok "22b. la page cachée fait tourner le cookie pendant la pause (le n° 3 est présenté, le n° 4 émis)"; else ko "22b. la rotation de la page cachée n'a pas eu lieu : $(rotation_state)"; fi
  sleep 1
  adb shell am force-stop "$APP"
  start_app
  if wait_until 40 rotation_events 5; then ok "22b. l'application relancée présente un cookie au faux Repas"; else ko "22b. l'application relancée n'a présenté aucun cookie : $(rotation_state)"; fi
  check "22b. le cookie relu est le dernier émis (le n° 4) : la rotation faite pendant la pause a été écrite sur le disque" rotation_all_valid
  say "      relevé du faux Repas : $(rotation_state)"
  rotation_on false
}

say
say "22. Session de Repas à rotation : le dernier cookie survit à l'arrêt du processus, après le chargement (22a) et pendant la pause (22b) (DRV-765)"
session_scenario
# --- fin 22 ----------------------------------------------------------------------------------------------------------------------------------

}

# --- Les scénarios choisis, dans l ordre demandé ---------------------------------------------------------------------------------------------------
say
say "Scénarios joués : $SELECTED ($([ "$BUDGET_APPLIES" = 1 ] && echo "jeu critique, budget de $BUDGET_SECONDS s de bout en bout" || echo "sélection, sans budget"))"
for id in $SELECTED; do "scenario_$id"; done

# --- 20. Bilan ------------------------------------------------------------------------------------------------------------------------------
say
say "20. Bilan"
fake_reset
final_checks
if [ "$BUDGET_APPLIES" = 1 ]; then
  elapsed=$(($(date +%s) - E2E_STARTED_AT))
  say "      durée de bout en bout (construction, émulateur et scénarios) : ${elapsed} s, budget ${BUDGET_SECONDS} s"
  check "BUDGET : le jeu critique tient en ${BUDGET_SECONDS} s au plus de bout en bout (${elapsed} s)" [ "$elapsed" -le "$BUDGET_SECONDS" ]
fi
conclude "les scénarios joués ($SELECTED)"

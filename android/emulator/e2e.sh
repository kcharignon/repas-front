#!/usr/bin/env bash
# Les scénarios complets de l'application Repas dans l'émulateur (DRV-319, partie 2). Lancé par `make android-e2e` (qui construit l'APK de
# débogage visant le faux Repas local et démarre l'émulateur avant), depuis la racine du dépôt.
#
# Là où le test de fumée (`smoke.sh`) prouve la coquille et le pont avec une page de test, ce fichier joue de VRAIS passages : l'agent réel, dans la
# vraie WebView du drive, contre le faux site Leclerc complet (`drive-agent/fake-leclerc`, Node, catalogue de produits inventés, panier, défauts
# simulés, cadence jugée) servi en HTTPS sous `courses-test.leclercdrive.fr`, avec le faux Repas (`repaspage.html`) qui joue le front. Les deux sont
# dans le conteneur de l'émulateur : le DNS n'envoie nulle part ailleurs, JAMAIS vers le vrai Leclerc ni le vrai Repas (vérifié d'abord et à la fin).
#
# Les scénarios, dans l'ordre (chacun repart d'un faux Leclerc remis à neuf) :
#   1. lecture du magasin (`drive.setup`) : accueil du drive, choix du magasin du faux Leclerc, l'agent le lit, Repas reçoit son numéro et son hôte ;
#   2. passage complet : le drive s'ouvre sur l'ACCUEIL DE L'ENSEIGNE (www.leclercdrive.fr, comme la lecture du magasin), qui affiche
#      l'accueil du magasin de l'utilisateur (constat de la recette réelle du 2026-10-18 : la racine de l'hôte du magasin et /magasin-N-N/ y sont des
#      pages 404, le faux site les refuse aussi) ; le test ÉCHOUE si le départ retombe sur la racine de l'hôte du magasin (non-régression) ; DRV-625 :
#      l'AGENT suit lui-même « Commencer mes courses » (aucun toucher), le plan repart vers la page du magasin : récapitulatif, phase A (deux produits
#      connus, quantités du plan), phase B (un nouveau produit choisi dans la liste de l'agent, nombre calculé), « j'en ai toujours » et « ignoré » ;
#      Repas reçoit le résultat TOUT SEUL (aucun « Retourner dans Repas » pour un envoi terminé) ; panier du faux Leclerc, cadence, requêtes ;
#   3. « Annuler » au récapitulatif : rien ne part vers le site, Repas reçoit un résultat « aborted » ;
#   4. abandon par l'utilisateur en plein passage (retour du téléphone, « Abandonner ») : Repas reçoit « aborted / CANCELLED » ;
#   5. application tuée en plein passage, puis reprise : le passage repart, se termine, le panier est exact et Repas reçoit le résultat ;
#   6. blocage simulé (403) : l'agent s'arrête sans insister (une seule nouvelle tentative), le dit, Repas reçoit « partial / BLOCKED » ;
#   7. site changé (contrat modifié) : l'agent s'interrompt, Repas reçoit « error / CONTRACT_CHANGED », rien n'est mis au panier ;
#   8. un AUTRE magasin que celui du plan : l'agent ne suit pas le lien de l'accueil (il mène à un autre magasin) et dit de le toucher ; l'utilisateur le
#      touche, l'agent reçoit le plan sur cette page de magasin et dit « Ce n'est pas le bon magasin » (STORE_MISMATCH) ;
#   9. page d'ouverture refusée par une page d'erreur (404) : un bandeau dit « Cette page n'est pas celle de votre magasin » et propose « Ouvrir
#      l'accueil du drive », l'agent ne reçoit rien, puis le récapitulatif s'affiche tout seul une fois l'accueil rechargé ;
#  10. page d'ouverture trop lente : le bandeau s'affiche au bout de 25 s, l'accueil du drive reste à un geste ;
#  11. 403 (le défi de l'anti-robot est servi ainsi) : la page reste visible, le bandeau dit de faire la vérification ;
#  12. « Commencer mes courses » mène à une page 404 : vers la racine de l'hôte du magasin, l'agent ne suit pas le lien (il dit de le toucher) et le bandeau
#      de l'application s'affiche une fois la page 404 atteinte ; vers /magasin-N-N/ (sans ville), il le suit UNE fois, atterrit sur la page 404, et ne
#      recommence pas quand « Ouvrir l'accueil du drive » recharge l'accueil (il dit de toucher le bouton) : pas de boucle, rien d'écrit ;
#  13. quatre nouveaux articles (DRV-624, DRV-626) : « Choisir » le premier, puis « Passer ces 3 articles » (une confirmation d'une ligne sans la liste
#      de produits, car aucun n'a de produit retenu) : deux touches pour le geste, rien n'est cherché ni retenu pour les trois autres ;
#  14. la quantité à vérifier (DRV-626) : un produit au contenu inconnu ouvre « Vérifiez la quantité », qui dit « Il vous faut : 200 g. », le champ
#      « 1 » est sélectionné : taper 4 donne 4 (pas 14), même après avoir touché le champ.
#  15. deuxième envoi, tout est connu (DRV-625) : au téléphone, une seule touche dans le drive (« Commencer »), le résultat revient à Repas tout seul,
#      puis « Finaliser sur Leclerc » (une touche) ouvre le drive DANS l'application (l'accueil du drive, connecté), pas le navigateur du téléphone.
# Les captures d'écran et le rapport texte sont dans android/dist/e2e/.
# Code de sortie : 0 si tous les contrôles passent, 1 sinon, 3 si KVM manque.
set -u
cd "$(dirname "$0")/../.."
source android/emulator/lib.sh # les outils communs avec smoke.sh

init_output android/dist/e2e
PLANS=android/emulator/e2e
CART_FULL='{"1000001":3,"1000006":1,"1000021":2}' # le panier attendu après le passage complet : farine x3, sucre x1, poivre moulu x2
CART_KNOWN='{"1000001":3,"1000006":1}'             # celui de la phase A seule

# --- Le faux Leclerc complet, vu de l'intérieur du conteneur (son pilotage n'est offert qu'aux noms de la boucle locale, jamais à l'émulateur) ---
fake_state() { emu curl -s "$FAKE_CONTROL/state"; }
fake_reset() { emu curl -s -X POST "$FAKE_CONTROL/reset" > /dev/null; reset_reports; }
fake_behavior() { emu curl -s -X POST -H 'Content-Type: application/json' -d "$1" "$FAKE_CONTROL/behavior" > /dev/null; }
cart_is() { fake_state | grep -qF "\"cart\":$1,\"behavior\""; } # cart_is '{"1000001":3}'
no_violations() { fake_state | grep -q '"violations":\[\]'; }
no_rejected() { ! fake_state | grep -q '"rejected"'; }
paced_count() { fake_state | grep -o '"kind":"\(search\|cart\)"' | wc -l; }
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
# Le bouton du bandeau d'en-tête (ticket E) : exactement ce texte, pas la phrase du bandeau qui le cite.
home_button() { ui_has 'text="Ouvrir l’accueil du drive"'; }
home_button_absent() { ! home_button; }
open_home() { tap 'text="Ouvrir l’accueil du drive"'; }

# Le drive s'ouvre sur l'accueil de l'enseigne (www), qui affiche l'accueil du magasin (constat de la recette réelle). DRV-625 : l'AGENT y suit lui-même
# « Commencer mes courses » (l'application ne clique jamais à sa place : elle envoie le plan à l'agent de l'accueil, et c'est lui qui suit le lien), puis
# le plan repart vers la page du magasin et l'agent affiche son récapitulatif. Aucun toucher de l'utilisateur.
enter_store() { wait_until 70 agent_screen 'Prêt à remplir votre panier'; }
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

say "Scénarios complets de Repas dans l'émulateur, contre le faux Leclerc ($(date '+%Y-%m-%d %H:%M'))"
say

# --- 0. Où l'on en est ---------------------------------------------------------------------------------------------------------------------
say "0. Émulateur, réseau et faux sites"
check_network fake-leclerc
# L'accueil de l'enseigne (www, la page de départ d'un plan et de la lecture du magasin) est servi par le faux Leclerc complet pendant ces
# scénarios, et redevient la page locale de test du test de fumée en sortant (quelle que soit la sortie).
www_mode fake
trap 'www_mode test' EXIT
if emu curl -sk -H "Host: $SITE_HOST" "https://127.0.0.1/" | grep -q 'Commencer mes courses'; then
  ok "l'accueil de l'enseigne ($SITE_HOST) est servi par le faux Leclerc complet : l'accueil du magasin et son bouton « Commencer mes courses »"
else
  ko "l'accueil de l'enseigne n'est pas servi par le faux Leclerc complet (make android-emulator-down puis up reconstruit l'émulateur). ARRÊT."
  exit 1
fi
if [ "$(emu curl -sk -o /dev/null -w '%{http_code}' -H "Host: $FAKE_STORE_HOST" "https://127.0.0.1/")" = "404" ]; then
  ok "la racine de l'hôte du magasin ($FAKE_STORE_HOST) est une page 404, comme sur le vrai site (recette réelle du 2026-10-18)"
else
  ko "la racine de l'hôte du magasin n'est pas une page 404 : le faux site cacherait le défaut au lieu de l'attraper. ARRÊT."
  exit 1
fi
say
say "   Installation de l'APK de débogage (qui vise https://$REPAS_HOST/)"
install_apk
start_app
if wait_until 40 has_report '"page": "repas"'; then ok "la coquille a chargé le faux Repas"; else ko "le faux Repas ne s'est pas chargé en 40 s"; fi
if wait_until 15 has_report '"drive": true'; then ok "app.info annonce que le drive est utilisable"; else ko "app.info n'annonce pas le drive"; fi

# --- 1. Lecture du magasin ------------------------------------------------------------------------------------------------------------------
say
say "1. Lecture du magasin (drive.setup) : le magasin du faux Leclerc, lu par l'agent"
RUN_SETUP=5e7b0000-0000-4000-8000-000000000001
fake_reset
start_setup "$RUN_SETUP"
if wait_until 40 ui_has 'choisissez votre magasin'; then
  ok "drive.setup ouvre le drive sur l'accueil, avec le message en français simple"
else
  ko "le drive ne s'est pas ouvert sur l'accueil"
fi
sleep 2
screenshot e01-lecture-accueil
# L'accueil de l'enseigne est celui du faux Leclerc : l'utilisateur y est chez son magasin, « Commencer mes courses » ouvre les pages du magasin.
if tap 'text="Commencer mes courses"'; then ok "le magasin du faux Leclerc est ouvert (« Commencer mes courses » touché)"; else ko "le bouton « Commencer mes courses » est introuvable"; fi
if wait_until 40 ui_has 'Utiliser ce magasin'; then
  ok "sur la page du faux magasin, l'agent demande confirmation"
else
  ko "l'agent n'a pas demandé confirmation"
fi
check "le faux Leclerc a servi l'accueil du magasin" requested '/magasin-000001-000001-Ville-Test/'
check "aucune recherche ni écriture du panier pendant la lecture du magasin" nothing_sent
sleep 1
screenshot e02-lecture-confirmation
if tap 'text="Utiliser ce magasin"'; then ok "« Utiliser ce magasin » touché"; else ko "le bouton « Utiliser ce magasin » est introuvable"; fi
if wait_until 20 has_report "\"runId\": \"$RUN_SETUP\", \"resultType\": \"setup-result\", \"lines\": -1, \"hasStore\": true, \"storeId\": \"$FAKE_STORE_ID\", \"storeHost\": \"$FAKE_STORE_HOST\", \"storeBase\": \"https://$FAKE_STORE_HOST/magasin-$FAKE_STORE_ID-$FAKE_STORE_ID\""; then
  ok "Repas reçoit le magasin lu : numéro, hôte et adresse du faux magasin, du même runId"
else
  ko "Repas n'a pas reçu le magasin lu"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"
check "l'écran n'est plus maintenu allumé" screen_not_held
screenshot e03-lecture-resultat

# --- 2. Passage complet : phase A, phase B, retour ---------------------------------------------------------------------------------------
say
say "2. Passage complet : récapitulatif, phase A (produits connus), phase B (nouveau produit choisi), retour dans Repas"
RUN_FULL=f01100c0-0000-4000-8000-000000000002
fake_reset
start_plan "$RUN_FULL" plan-complet.json
if wait_until 70 agent_screen 'Prêt à remplir votre panier'; then
  ok "drive.start ouvre le drive sur l'accueil de l'enseigne (www) : l'agent y suit « Commencer mes courses » tout seul (aucun toucher) et affiche « Prêt à remplir votre panier »"
else
  ko "le récapitulatif de l'agent ne s'est pas affiché sans que l'utilisateur touche quoi que ce soit"
fi
check "le faux Leclerc a servi l'accueil de l'enseigne ($SITE_HOST/), la page de départ du plan" requested_on "$SITE_HOST" '/'
check "NON-RÉGRESSION : jamais la racine de l'hôte du magasin ($FAKE_STORE_HOST/), page 404 du vrai site (recette réelle, application 0.1.3)" not_requested_on "$FAKE_STORE_HOST" '/'
check "jamais l'adresse /magasin-000001-000001/ (page 404 du vrai site)" not_requested '/magasin-000001-000001/'
check "aucun bandeau de l'application : l'agent a parlé à sa place (« Ouverture de votre magasin… »), puis le magasin s'est ouvert" ui_lacks 'Connectez-vous si besoin'
check "aucun bandeau « Touchez Commencer mes courses » : l'entrée a réussi" ui_lacks 'Touchez « Commencer mes courses »'
check "le faux Leclerc a servi la page du magasin (avec sa ville), sur l'hôte du magasin" requested_on "$FAKE_STORE_HOST" '/magasin-000001-000001-Ville-Test/'
check "NON-RÉGRESSION : le départ n'est jamais retombé sur la racine de l'hôte du magasin" not_requested_on "$FAKE_STORE_HOST" '/'
check "aucune requête de l'agent pour entrer dans le magasin : il a suivi le lien de la page, sans recherche ni panier" nothing_sent
check "récapitulatif : une phrase, la même que l'écran de l'envoi de Repas" ui_has '5 articles : 2 sont déjà choisis, 1 est à choisir sur Leclerc, 2 ne seront pas mis au panier.'
check "récapitulatif : aucun compteur à zéro, ni « produits connus » ni « nouveaux produits »" ui_lacks 'produits connus\|nouveau produit\|text="0 '
check "l'écran reste allumé pendant le passage" screen_held
check "rien ne part vers le site avant « Commencer »" nothing_sent
sleep 1
screenshot e04-recapitulatif
# Lisibilité : le site s'affiche en mode ordinateur (~980 px CSS sur ~411 dp), l'interface de l'agent s'agrandit pour le compenser.
touch_target 'text="Commencer"' "Commencer"
touch_target 'text="Annuler"' "Annuler"
measures=$(display_measures)
say "      affichage mesuré dans la WebView : ${measures:-aucune mesure}"
factor=$(json_number "$measures" factor)
if [ -n "$factor" ] && at_least "$factor" 1.5; then
  ok "lisibilité : l'interface de l'agent est agrandie d'un facteur ${factor} (fenêtre du site de $(json_number "$measures" innerWidth) px CSS affichée sur un écran de $(json_number "$measures" screenWidth) dp, échelle de la page $(json_number "$measures" scale))"
else
  ko "lisibilité : l'interface de l'agent n'est pas agrandie (facteur ${factor:-inconnu}) alors que la fenêtre du site est celle d'un ordinateur"
fi
if tap 'text="Commencer"'; then ok "« Commencer » touché"; else ko "le bouton « Commencer » est introuvable"; fi
if wait_until 60 cart_is "$CART_KNOWN"; then
  ok "phase A : le panier du faux Leclerc a les quantités du plan (farine x3, sucre x1), écrites en quantités absolues"
else
  ko "phase A : le panier du faux Leclerc n'a pas les quantités du plan : $(fake_state | cut -c1-120)"
fi
if wait_until 60 ui_has 'Il vous faut'; then
  ok "phase B : l'agent affiche lui-même la liste des produits trouvés pour le poivre"
else
  ko "phase B : la liste de choix ne s'est pas affichée"
fi
check "phase B : la quantité demandée est dite en haut de la liste, puis le nombre de produits est calculé (40 g par produit : 2 produits)" ui_has 'Il vous faut : 80 g'
check "phase B : le nombre de produits est calculé (40 g par produit)" ui_has '40 g par produit'
check "l'agent ne choisit jamais seul : le panier n'a pas changé" cart_is "$CART_KNOWN"
sleep 1
screenshot e05-choix
touch_target 'text="Choisir"' "Choisir (liste de produits)"
touch_target 'text="Pas cette fois"' "Pas cette fois"
if tap 'text="Choisir"'; then ok "premier produit proposé choisi (poivre moulu)"; else ko "aucun bouton « Choisir » à l'écran"; fi
# DRV-625 : un envoi terminé n'a rien à faire lire, le résultat repart tout seul (aucun « Retourner dans Repas ») et l'application ferme le drive.
if wait_until 60 result_has "$RUN_FULL" completed ''; then
  ok "l'envoi terminé repart tout seul : Repas reçoit drive.result, « completed », du même runId, sans toucher « Retourner dans Repas »"
else
  ko "Repas n'a pas reçu le résultat du passage"
fi
check "le panier du faux Leclerc : farine x3, sucre x1 et le poivre choisi x2" cart_is "$CART_FULL"
polite_agent
back_to_repas || ko "l'écran Repas n'est pas revenu"
check "aucun écran de fin de l'agent à lire ni à toucher : le drive s'est refermé" ui_lacks 'Retourner dans Repas'
sleep 1
screenshot e06-retour-automatique
check "le résultat détaille chaque ligne (ajoutée, ajoutée, à la maison, ignorée, choisie)" \
  result_detail 'farine:ADDED:1000001:3,sucre:ADDED:1000006:1,sel:HAVE_AT_HOME::,huile:SKIPPED::,poivre:CHOSEN:1000021:2'
check "l'écran n'est plus maintenu allumé une fois le passage fini" screen_not_held
sleep 1
screenshot e07-retour-repas

# --- 3. Annuler au récapitulatif ------------------------------------------------------------------------------------------------------------
say
say "3. « Annuler » au récapitulatif : rien ne part vers le site"
RUN_CANCEL=ca4ce100-0000-4000-8000-000000000003
if open_pass "$RUN_CANCEL" plan-connu.json; then ok "le récapitulatif s'affiche"; else ko "le récapitulatif ne s'est pas affiché"; fi
if tap 'text="Annuler"'; then ok "« Annuler » touché dans l'interface de l'agent"; else ko "le bouton « Annuler » est introuvable"; fi
if wait_until 20 ui_has 'Vous avez arrêté'; then ok "l'agent annonce « Vous avez arrêté l'envoi »"; else ko "l'agent n'a pas annoncé l'arrêt"; fi
screenshot e08-annule
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_CANCEL" aborted ''; then
  ok "Repas reçoit un résultat « aborted »"
else
  ko "Repas n'a pas reçu de résultat « aborted »"
fi
check "aucune recherche ni écriture du panier n'est partie" nothing_sent
check "le panier du faux Leclerc est resté vide" cart_is '{}'
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 4. Abandon par l'utilisateur en plein passage -----------------------------------------------------------------------------------------
say
say "4. Abandon en plein passage (retour du téléphone, « Abandonner »)"
RUN_ABANDON=ab4d0000-0000-4000-8000-000000000004
fake_reset
fake_behavior '{"latencyMs":5000}' # le passage dure assez longtemps pour être interrompu au milieu (DRV-625 : un envoi terminé ne reste plus sur un écran de fin, il repart seul)
start_plan "$RUN_ABANDON" plan-connu.json
enter_store
wait_until 70 agent_screen 'Prêt à remplir votre panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 30 ui_has 'Votre panier se remplit'; then ok "le passage est en cours (écran de progression de l'agent)"; else ko "le passage n'a pas commencé"; fi
adb shell input keyevent KEYCODE_BACK
if wait_until 15 ui_has "Abandonner l.envoi"; then ok "le retour du téléphone demande s'il faut abandonner l'envoi"; else ko "pas de demande d'abandon"; fi
sleep 1
screenshot e09-abandon
if tap 'text="Abandonner"' && wait_until 20 result_has "$RUN_ABANDON" aborted ', "errorCode": "CANCELLED", "lines": 0'; then
  ok "l'abandon donne un résultat « aborted / CANCELLED » à Repas, sans ligne"
else
  ko "l'abandon n'a pas donné le résultat attendu"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"
check "l'écran n'est plus maintenu allumé" screen_not_held
sleep 8 # le temps que la requête en vol de la page abandonnée finisse (latence de 5 s)

# --- 5. Application tuée en plein passage, puis reprise ---------------------------------------------------------------------------------
say
say "5. Application tuée en plein passage, puis reprise"
RUN_RESUME=4e5a0000-0000-4000-8000-000000000005
if open_pass "$RUN_RESUME" plan-complet.json; then ok "le récapitulatif s'affiche"; else ko "le récapitulatif ne s'est pas affiché"; fi
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'Il vous faut' && cart_is "$CART_KNOWN"; then
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
  if ui_has 'Prêt à remplir votre panier'; then
    resumed=1
    break
  fi
  sleep 2
done
if [ "$resumed" = "1" ]; then ok "le drive se rouvre et le plan est renvoyé à l'agent (récapitulatif)"; else ko "le plan n'a pas été renvoyé à l'agent"; fi
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
wait_until 60 ui_has 'Il vous faut' || ko "la liste de choix ne s'est pas affichée après la reprise"
tap 'text="Choisir"' || ko "aucun bouton « Choisir » à l'écran"
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

# --- 6. Blocage simulé ---------------------------------------------------------------------------------------------------------------------
say
say "6. Blocage simulé : le faux Leclerc répond 403 à l'écriture du panier"
RUN_BLOCK=b10c0000-0000-4000-8000-000000000006
fake_reset
fake_behavior '{"fault":{"kind":"forbidden","after":1}}' # la première recherche passe, puis tout est refusé
start_plan "$RUN_BLOCK" plan-connu.json
enter_store
wait_until 70 agent_screen 'Prêt à remplir votre panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
# Rien n'est mis au panier : « Le panier n'est pas rempli », pas « en partie » (DRV-626)
if wait_until 60 ui_has 'Le panier n’est pas rempli'; then ok "l'agent s'arrête et annonce « Le panier n'est pas rempli » (rien n'est au panier)"; else ko "l'agent n'a pas annoncé l'arrêt"; fi
check "le titre ne dit pas « en partie » quand rien n'est au panier" ui_lacks 'rempli en partie'
sleep 1
screenshot e11-blocage
if [ "$(paced_count)" = "3" ]; then
  ok "l'agent n'insiste pas : une recherche, l'écriture refusée, une seule nouvelle tentative refusée, puis plus rien"
else
  ko "l'agent a envoyé $(paced_count) requêtes (3 attendues)"
fi
check "rien n'a été mis au panier" cart_is '{}'
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_BLOCK" partial ', "errorCode": "BLOCKED"'; then
  ok "Repas reçoit « partial / BLOCKED »"
else
  ko "Repas n'a pas reçu « partial / BLOCKED »"
fi
check "les deux lignes sont en échec « BLOCKED »" result_detail 'farine:FAILED:BLOCKED:,sucre:FAILED:BLOCKED:'
back_to_repas || ko "l'écran Repas n'est pas revenu"
screenshot e12-blocage-retour

# --- 7. Site changé ------------------------------------------------------------------------------------------------------------------------
say
say "7. Site changé : la page de recherche n'a plus les champs attendus"
RUN_CHANGED=c4a90000-0000-4000-8000-000000000007
fake_reset
fake_behavior '{"fault":{"kind":"contract-changed","on":"search"}}'
start_plan "$RUN_CHANGED" plan-connu.json
enter_store
wait_until 70 agent_screen 'Prêt à remplir votre panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'automatique est arrêté'; then ok "l'agent s'arrête : « L'envoi s'est arrêté »"; else ko "l'agent n'a pas détecté le changement"; fi
check "l'agent dit que Leclerc a changé son site" ui_has 'Leclerc a changé son site'
check "le conseil est de chercher à la main sur Leclerc" ui_has 'à la main sur Leclerc'
sleep 1
screenshot e13-site-change
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_CHANGED" error ', "errorCode": "CONTRACT_CHANGED"'; then
  ok "Repas reçoit « error / CONTRACT_CHANGED »"
else
  ko "Repas n'a pas reçu « error / CONTRACT_CHANGED »"
fi
check "rien n'a été mis au panier" cart_is '{}'
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 8. Autre magasin que celui du plan ---------------------------------------------------------------------------------------------------------
say
say "8. L'utilisateur ouvre un AUTRE magasin que celui du plan : l'agent reçoit le plan et dit « Ce n'est pas le bon magasin »"
RUN_OTHER=07e50000-0000-4000-8000-000000000008
fake_reset
fake_behavior '{"startPath":"/magasin-000002-000002-Ville-Test/"}' # le bouton « Commencer mes courses » de l'utilisateur mène à SON magasin, pas à celui du plan
start_plan "$RUN_OTHER" plan-connu.json
if wait_until 70 ui_has 'Touchez « Commencer mes courses »'; then
  ok "le lien de l'accueil mène à un autre magasin que celui du plan : l'agent ne le suit pas et dit de toucher « Commencer mes courses »"
else
  ko "l'agent n'a pas laissé l'utilisateur toucher le bouton"
fi
check "l'agent n'a rien suivi : le faux Leclerc n'a pas servi l'autre magasin" not_requested '/magasin-000002-000002-Ville-Test/'
if tap 'text="Commencer mes courses"'; then ok "l'utilisateur ouvre SON magasin (bouton du site touché)"; else ko "le bouton « Commencer mes courses » est introuvable"; fi
if wait_until 70 ui_has 'Ce n’est pas le bon magasin'; then
  ok "dès que la page de ce magasin s'ouvre, l'agent reçoit le plan tout seul et dit « Ce n'est pas le bon magasin » (STORE_MISMATCH)"
else
  ko "l'agent n'a pas signalé le mauvais magasin"
fi
check "rien n'a été cherché ni mis au panier" nothing_sent
sleep 1
screenshot e14-autre-magasin
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_OTHER" error ', "errorCode": "STORE_MISMATCH"'; then
  ok "Repas reçoit « error / STORE_MISMATCH »"
else
  ko "Repas n'a pas reçu « error / STORE_MISMATCH »"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 9. Page d'ouverture refusée par une page d'erreur (404) ---------------------------------------------------------------------------------
say
say "9. Le site répond une page d'erreur (404) à la page d'ouverture (l'accueil de l'enseigne) : un bandeau dit quoi faire, rien n'est envoyé à la page d'erreur, « Ouvrir l'accueil du drive » recommence"
RUN_404=e4040000-0000-4000-8000-000000000009
fake_reset
fake_behavior '{"homeStatus":404}'
start_plan "$RUN_404" plan-connu.json
if wait_until 70 ui_has 'celle de votre magasin'; then
  ok "page d'erreur 404 : le bandeau « Cette page n'est pas celle de votre magasin » s'affiche, au lieu d'un écran muet"
else
  ko "page d'erreur 404 : aucun bandeau, l'utilisateur reste devant un écran muet"
fi
check "le bandeau propose le bouton « Ouvrir l'accueil du drive »" home_button
check "le site a bien été interrogé à l'accueil de l'enseigne (la page de départ du plan)" requested_on "$SITE_HOST" '/'
check "NON-RÉGRESSION : le repli ne mène pas à la racine de l'hôte du magasin" not_requested_on "$FAKE_STORE_HOST" '/'
sleep 6
check "l'agent n'affiche rien et ne reçoit pas le plan sur une page d'erreur" ui_lacks 'Prêt à remplir votre panier'
check "rien n'est parti vers le site" nothing_sent
screenshot e15-page-erreur-404
fake_behavior '{"homeStatus":null}' # le site répond de nouveau
if open_home; then ok "« Ouvrir l'accueil du drive » touché"; else ko "le bouton « Ouvrir l'accueil du drive » est introuvable"; fi
if wait_until 70 agent_screen 'Prêt à remplir votre panier'; then
  ok "le bouton recharge l'accueil de l'enseigne : l'agent suit « Commencer mes courses » tout seul et affiche son récapitulatif"
else
  ko "l'agent n'a pas affiché son récapitulatif sur la page du magasin"
fi
check "plus de bouton « Ouvrir l'accueil du drive » : on y est" home_button_absent
check "le bandeau a disparu" ui_lacks 'celle de votre magasin'
check "aucune requête de l'agent avant « Commencer »" nothing_sent
if tap 'text="Annuler"' && tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_404" aborted ''; then
  ok "« Annuler » : Repas reçoit un résultat « aborted »"
else
  ko "Repas n'a pas reçu de résultat « aborted »"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 10. Page d'ouverture trop lente ---------------------------------------------------------------------------------------------------------
say
say "10. La page d'ouverture ne répond pas dans les temps : le bandeau le dit au bout de 25 s, l'accueil du drive reste à un geste"
RUN_SLOW=510c0000-0000-4000-8000-000000000010
fake_reset
fake_behavior '{"homeDelayMs":60000}' # la page n'arrive qu'après une minute
start_plan "$RUN_SLOW" plan-connu.json
sleep 10
check "avant le délai, le bandeau attend l'ouverture du magasin sans alarme" ui_lacks 'celle de votre magasin'
if wait_until 60 ui_has 'celle de votre magasin'; then
  ok "page trop lente : le bandeau « Cette page n'est pas celle de votre magasin » s'affiche une fois le délai écoulé"
else
  ko "page trop lente : aucun bandeau au bout d'une minute"
fi
check "le bandeau propose le bouton « Ouvrir l'accueil du drive »" home_button
screenshot e17-page-lente
fake_behavior '{"homeDelayMs":0}'
if open_home && wait_until 70 agent_screen 'Prêt à remplir votre panier'; then ok "« Ouvrir l'accueil du drive » recharge l'accueil : l'agent entre tout seul dans le magasin et reprend"; else ko "l'agent n'a pas affiché son récapitulatif"; fi
if tap 'text="Annuler"' && tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_SLOW" aborted ''; then
  ok "« Annuler » : Repas reçoit un résultat « aborted »"
else
  ko "Repas n'a pas reçu de résultat « aborted »"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 11. Vérification demandée par le site (403) --------------------------------------------------------------------------------------------
say
say "11. Le site répond 403 à la page d'ouverture (le défi de l'anti-robot est servi ainsi) : la page reste visible, le bandeau dit de faire la vérification"
RUN_CHECK=c0de0000-0000-4000-8000-000000000011
fake_reset
fake_behavior '{"homeStatus":403}'
start_plan "$RUN_CHECK" plan-connu.json
if wait_until 70 ui_has 'Leclerc demande une vérification'; then
  ok "403 : le bandeau « Leclerc demande une vérification » s'affiche"
else
  ko "403 : aucun bandeau"
fi
check "la page du site reste visible sous le bandeau (c'est là que l'utilisateur passe le défi)" ui_has 'momentanément indisponible'
check "le bandeau garde une issue : « Ouvrir l'accueil du drive »" home_button
check "l'agent ne reçoit pas le plan sur la page refusée" ui_lacks 'Prêt à remplir votre panier'
screenshot e18-verification
fake_behavior '{"homeStatus":null}'
open_home || ko "le bouton « Ouvrir l'accueil du drive » est introuvable"
if wait_until 70 agent_screen 'Prêt à remplir votre panier'; then ok "le défi passé (page de nouveau servie), l'agent reprend tout seul"; else ko "l'agent n'a pas affiché son récapitulatif"; fi
if tap 'text="Annuler"' && tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_CHECK" aborted ''; then
  ok "« Annuler » : Repas reçoit un résultat « aborted »"
else
  ko "Repas n'a pas reçu de résultat « aborted »"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 12. « Commencer mes courses » mène à une page 404 ------------------------------------------------------------------------------------------
say
say "12. Le lien de l'accueil mène à une page 404 : vers la racine de l'hôte du magasin l'agent ne le suit pas ; vers /magasin-N-N/ (sans ville) il le suit UNE fois et ne recommence pas (pas de boucle)"
RUN_DEAD=de4d0000-0000-4000-8000-000000000012
fake_reset
fake_behavior '{"startPath":"/"}' # le bouton « Commencer mes courses » du faux site mène d'abord à la racine de l'hôte du magasin, une page 404
start_plan "$RUN_DEAD" plan-connu.json
dead_page_checks() { # dead_page_checks <chemin 404> : le bandeau de l'application, le plan qui ne part pas, rien d'écrit
  local dead=$1
  if wait_until 40 ui_has 'celle de votre magasin'; then
    ok "page 404 ($dead) : le bandeau « Cette page n'est pas celle de votre magasin » s'affiche, au lieu d'un écran muet"
  else
    ko "page 404 ($dead) : aucun bandeau, l'utilisateur reste devant un écran muet"
  fi
  sleep 2 # le temps que la page 404 remplace l'accueil à l'écran
  check "le bandeau propose le bouton « Ouvrir l'accueil du drive »" home_button
  check "la page 404 n'a pas le bouton « Commencer mes courses »" ui_lacks 'text="Commencer mes courses"'
  check "l'agent ne reçoit pas le plan sur une page 404" ui_lacks 'Prêt à remplir votre panier'
  check "rien n'est parti vers le site" nothing_sent
  check "le faux Leclerc a bien servi cette page 404 ($FAKE_STORE_HOST$dead)" requested_on "$FAKE_STORE_HOST" "$dead"
}
# 12a. Vers la racine de l'hôte du magasin : l'adresse n'a pas la forme d'une page de magasin, l'agent ne suit rien et dit de toucher le bouton.
if wait_until 70 ui_has 'Touchez « Commencer mes courses »'; then
  ok "lien vers la racine de l'hôte du magasin : l'agent ne le suit pas et dit de toucher « Commencer mes courses »"
else
  ko "lien vers la racine de l'hôte du magasin : l'agent n'a pas laissé l'utilisateur toucher le bouton"
fi
check "l'agent n'a pas suivi le lien mort : le faux Leclerc n'a pas servi la racine de l'hôte du magasin" not_requested_on "$FAKE_STORE_HOST" '/'
screenshot e19a-lien-refuse
if tap 'text="Commencer mes courses"'; then ok "l'utilisateur touche le bouton du site (il mène à la page 404)"; else ko "le bouton « Commencer mes courses » est introuvable"; fi
dead_page_checks '/'
screenshot e19-lien-mort-racine
# 12b. Vers /magasin-N-N/ (sans ville) : l'adresse a la forme d'une page du magasin du plan, l'agent la suit UNE fois et atterrit sur la page 404.
fake_behavior '{"startPath":"/magasin-000001-000001/"}'
if open_home; then ok "« Ouvrir l'accueil du drive » touché"; else ko "le bouton « Ouvrir l'accueil du drive » est introuvable"; fi
dead_page_checks '/magasin-000001-000001/'
screenshot e20-lien-mort-sans-ville
# 12c. L'envoi a déjà suivi le lien une fois dans cet onglet : à l'accueil rechargé, l'agent ne recommence pas, il dit de toucher le bouton.
fake_behavior '{"startPath":null}'
if open_home && wait_until 70 ui_has 'Touchez « Commencer mes courses »'; then
  ok "l'accueil rechargé : l'agent ne suit pas le lien une seconde fois (pas de boucle) et dit de toucher « Commencer mes courses »"
else
  ko "l'agent n'a pas laissé l'utilisateur toucher le bouton"
fi
check "rien n'a été écrit ni cherché pendant ces essais" nothing_sent
screenshot e20a-pas-de-boucle
if tap 'text="Commencer mes courses"'; then ok "l'utilisateur touche le bouton du site"; else ko "le bouton « Commencer mes courses » est introuvable"; fi
if wait_until 70 agent_screen 'Prêt à remplir votre panier'; then ok "le chemin retrouvé, l'agent reçoit le plan tout seul"; else ko "l'agent n'a pas affiché son récapitulatif"; fi
if tap 'text="Annuler"' && tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_DEAD" aborted ''; then
  ok "« Annuler » : Repas reçoit un résultat « aborted »"
else
  ko "Repas n'a pas reçu un résultat « aborted »"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 13. Quatre nouveaux articles : choisir le premier, passer les trois suivants ------------------------------------------------------------
say
say "13. Quatre nouveaux articles : « Choisir » le premier, puis « Passer ces 3 articles » (confirmation d'une ligne), rien n'est retenu pour les autres"
RUN_REST=be570000-0000-4000-8000-000000000013
if open_pass "$RUN_REST" plan-nouveaux.json; then ok "le récapitulatif s'affiche (4 nouveaux produits à choisir)"; else ko "le récapitulatif ne s'est pas affiché"; fi
check "récapitulatif : 4 articles, tous à choisir (la phrase de Repas)" ui_has '4 articles : tous sont à choisir sur Leclerc.'
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'Il vous faut : 80 g'; then ok "la liste du poivre s'affiche (1 sur 4)"; else ko "la liste de choix ne s'est pas affichée"; fi
check "l'écran dit « 1 sur 4 »" ui_has '1 sur 4'
check "le bouton compte les 4 articles, celui qui est affiché compris : « Passer ces 4 articles »" ui_has 'text="Passer ces 4 articles"'
check "la fiche d'un produit ne répète pas sa taille : « Poivre noir moulu » n'a pas de ligne « 40 g » seule" ui_lacks 'text="40 g"'
touch_target 'text="Passer ces 4 articles"' "Passer ces 4 articles"
touch_target 'text="J’en ai toujours"' "J’en ai toujours"
screenshot e21-choix-premier-article
if tap 'text="Choisir"'; then ok "touche 1 : premier produit proposé choisi (poivre moulu)"; else ko "aucun bouton « Choisir » à l'écran"; fi
if wait_until 60 ui_has '2 sur 4'; then ok "l'article suivant s'affiche (2 sur 4)"; else ko "le deuxième article ne s'est pas affiché"; fi
check "le bouton compte les articles qui restent à choisir, celui-ci compris : « Passer ces 3 articles »" ui_has 'text="Passer ces 3 articles"'
touch_target 'text="Passer ces 3 articles"' "Passer ces 3 articles"
screenshot e22-passer-les-suivants
if tap 'text="Passer ces 3 articles"'; then ok "touche 2 : « Passer ces 3 articles »"; else ko "le bouton « Passer ces 3 articles » est introuvable"; fi
if wait_until 20 ui_has 'ne seront pas mis au panier'; then
  ok "aucun article n'a de produit retenu : une confirmation d'une ligne s'affiche (« Ces 3 articles ne seront pas mis au panier. »)"
else
  ko "la confirmation d'une ligne ne s'est pas affichée"
fi
sleep 1
check "la confirmation est un écran à deux boutons : la liste de produits et la recherche sont cachées (aucun « Choisir »)" ui_lacks 'text="Choisir"\|text="Chercher"'
check "la confirmation propose « Revenir au choix »" ui_has 'text="Revenir au choix"'
screenshot e23-passer-confirmation
check "avant la confirmation, rien n'est passé : le poivre est au panier, trois requêtes seulement (recherche, panier, recherche du sel)" cart_is '{"1000021":2}'
if [ "$(paced_count)" = "3" ]; then ok "trois requêtes avant la confirmation"; else ko "$(paced_count) requêtes avant la confirmation (3 attendues)"; fi
if tap 'text="Passer ces 3 articles"'; then ok "touche 3 : la confirmation"; else ko "le bouton de confirmation est introuvable"; fi
if wait_until 60 result_has "$RUN_REST" completed ''; then
  ok "l'envoi se termine et Repas reçoit le résultat « completed » tout seul"
else
  ko "Repas n'a pas reçu le résultat du passage"
fi
check "le panier est celui du seul premier choix (poivre x2) et rien n'a été cherché pour les trois autres : 3 requêtes en tout" cart_is '{"1000021":2}'
if [ "$(paced_count)" = "3" ]; then ok "toujours 3 requêtes : les trois articles passés n'ont pas été cherchés"; else ko "$(paced_count) requêtes en tout (3 attendues)"; fi
polite_agent
check "le résultat : le poivre choisi, les trois autres « pas cette fois » (ni « j'en ai toujours », ni refus, ni produit)" \
  result_detail 'poivre:CHOSEN:1000021:2,sel:SKIPPED::,riz:SKIPPED::,huile:SKIPPED::'
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 14. La quantité à vérifier : taper 4 donne 4 ------------------------------------------------------------------------------------------
say
say "14. Quantité à vérifier : le « 1 » prérempli est sélectionné, taper 4 donne 4 (pas 14), même après avoir touché le champ"
RUN_QTY=0a117000-0000-4000-8000-000000000014
if open_pass "$RUN_QTY" plan-quantite.json; then ok "le récapitulatif s'affiche (1 nouveau produit à choisir)"; else ko "le récapitulatif ne s'est pas affiché"; fi
check "récapitulatif : un seul article, à choisir (jamais de compteur à zéro)" ui_has '1 article : il est à choisir sur Leclerc.'
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'Il vous faut : 200 g'; then ok "la liste du cacao s'affiche"; else ko "la liste de choix ne s'est pas affichée"; fi
check "un seul article à choisir : pas de compteur « (1 sur 1) »" ui_lacks '1 sur 1'
if tap 'text="Choisir"'; then ok "le produit au contenu inconnu est choisi (cacao maigre)"; else ko "aucun bouton « Choisir » à l'écran"; fi
if wait_until 60 ui_has 'Vérifiez la quantité'; then ok "l'agent demande la quantité (le contenu du produit est inconnu)"; else ko "l'écran « Vérifiez la quantité » ne s'est pas affiché"; fi
check "l'écran dit ce qu'il vous faut : « Il vous faut : 200 g. »" ui_has 'Il vous faut : 200 g.'
sleep 1
screenshot e24-quantite
# L'utilisateur touche le champ (le toucher pose le curseur) puis tape 4 : le « 1 » est remplacé, pas complété
if tap 'class="android.widget.EditText"'; then ok "le champ de la quantité est touché"; else ko "le champ de la quantité est introuvable"; fi
sleep 1
adb shell input text 4
sleep 1
# (L'arbre d'accessibilité ne donne pas la valeur du champ : la preuve est le panier, plus bas : 4 cacaos, pas 14 ni 41.)
screenshot e25-quantite-saisie
adb shell input keyevent KEYCODE_BACK # referme le clavier, s'il est ouvert
sleep 1
if tap 'text="Valider"'; then ok "« Valider » touché"; else ko "le bouton « Valider » est introuvable"; fi
if wait_until 60 result_has "$RUN_QTY" completed ''; then
  ok "l'envoi se termine et Repas reçoit le résultat « completed » tout seul"
else
  ko "Repas n'a pas reçu le résultat du passage"
fi
check "taper 4 a remplacé le « 1 » prérempli : le panier du faux Leclerc a 4 cacaos, pas 14 ni 41" cart_is '{"1000031":4}'
polite_agent
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 15. Deuxième envoi, tout est connu : une touche dans le drive, retour tout seul, « Finaliser sur Leclerc » dans l'application -------------
say
say "15. Deuxième envoi, tout est connu (DRV-625) : « Commencer » est la seule touche dans le drive ; le résultat revient tout seul ; « Finaliser sur Leclerc » ouvre le drive DANS l'application"
RUN_ALL=a11c0000-0000-4000-8000-000000000015
touches=0
touch() { touches=$((touches + 1)); tap "$1"; } # une touche de l'utilisateur, comptée
fake_reset
# Repas a déjà fait ses touches (« Envoyer au drive », « Confirmer », « Ouvrir le drive ») : le plan part, l'agent entre dans le magasin tout seul.
start_plan "$RUN_ALL" plan-connu.json
if enter_store; then ok "l'agent entre dans le magasin et affiche son récapitulatif sans aucun toucher"; else ko "le récapitulatif ne s'est pas affiché"; fi
if touch 'text="Commencer"'; then ok "touche : « Commencer »"; else ko "le bouton « Commencer » est introuvable"; fi
if wait_until 90 result_has "$RUN_ALL" completed ''; then
  ok "l'envoi terminé repart tout seul : Repas reçoit « completed » sans toucher « Retourner dans Repas »"
else
  ko "Repas n'a pas reçu le résultat du passage"
fi
back_to_repas || ko "l'écran Repas n'est pas revenu"
check "dans le drive, une seule touche pour tout l'envoi (« Commencer »)" [ "$touches" = "1" ]
# « Finaliser sur Leclerc » : un lien du récapitulatif de Repas vers le drive, ouvert dans l'application (jamais le navigateur du téléphone).
if touch 'text="Finaliser sur Leclerc"'; then ok "touche : « Finaliser sur Leclerc »"; else ko "le lien « Finaliser sur Leclerc » est introuvable dans le faux Repas"; fi
if wait_until 40 ui_has 'text="Commencer mes courses"'; then
  ok "« Finaliser sur Leclerc » ouvre le drive DANS l'application : l'accueil du drive (connecté), où le panier est à une touche"
else
  ko "le drive ne s'est pas ouvert dans l'application"
fi
check "c'est l'écran du drive de l'application, pas le navigateur du téléphone" focused_is_drive
check "aucun bandeau d'envoi : ce n'est pas un envoi" ui_lacks 'Touchez « Commencer mes courses »'
check "au total, deux touches pour ce deuxième envoi dans l'application (« Commencer » et « Finaliser »)" [ "$touches" = "2" ]
check "rien n'a été écrit au panier par cette ouverture" cart_is '{"1000001":3,"1000006":1}'
screenshot e26-finaliser-dans-l-application
adb shell input keyevent KEYCODE_BACK
if wait_until 20 ui_has 'Faux Repas de test'; then ok "retour : l'écran Repas revient"; else ko "l'écran Repas n'est pas revenu"; fi

# --- 16. Bilan ------------------------------------------------------------------------------------------------------------------------------
say
say "16. Bilan"
fake_reset
final_checks
conclude "les scénarios complets"

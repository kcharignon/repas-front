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
#   2. passage complet : récapitulatif, phase A (deux produits connus, quantités du plan), phase B (un nouveau produit choisi dans la liste de l'agent,
#      nombre calculé), « j'en ai toujours » et « ignoré » ; retour dans Repas avec le résultat ; panier du faux Leclerc, cadence, requêtes ;
#   3. « Annuler » au récapitulatif : rien ne part vers le site, Repas reçoit un résultat « aborted » ;
#   4. abandon par l'utilisateur en plein passage (retour du téléphone, « Abandonner ») : Repas reçoit « aborted / CANCELLED » ;
#   5. application tuée en plein passage, puis reprise : le passage repart, se termine, le panier est exact et Repas reçoit le résultat ;
#   6. blocage simulé (403) : l'agent s'arrête sans insister (une seule nouvelle tentative), le dit, Repas reçoit « partial / BLOCKED » ;
#   7. site changé (contrat modifié) : l'agent s'interrompt, Repas reçoit « error / CONTRACT_CHANGED », rien n'est mis au panier.
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

# Le passage s'ouvre : le drive est sur le faux magasin, le plan est arrivé à l'agent, qui affiche son récapitulatif.
open_pass() { # open_pass <runId> <fichier de plan>
  fake_reset
  start_plan "$1" "$2"
  wait_until 70 agent_screen 'Prêt à remplir ton panier'
}
back_to_repas() { # le résultat est livré à Repas, qui est revenu devant
  wait_until 20 ui_has 'drive.result'
}

say "Scénarios complets de Repas dans l'émulateur, contre le faux Leclerc ($(date '+%Y-%m-%d %H:%M'))"
say

# --- 0. Où l'on en est ---------------------------------------------------------------------------------------------------------------------
say "0. Émulateur, réseau et faux sites"
check_network fake-leclerc
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
if wait_until 40 ui_has 'choisis ton magasin'; then
  ok "drive.setup ouvre le drive sur l'accueil, avec le message en français simple"
else
  ko "le drive ne s'est pas ouvert sur l'accueil"
fi
sleep 2
screenshot e01-lecture-accueil
if tap 'text="Choisir le magasin du faux Leclerc"'; then ok "le magasin du faux Leclerc est choisi (lien touché)"; else ko "le lien du faux magasin est introuvable"; fi
if wait_until 40 ui_has 'Enregistrer ce magasin'; then
  ok "sur la page du faux magasin (racine de l'hôte redirigée vers son accueil), l'agent demande confirmation"
else
  ko "l'agent n'a pas demandé confirmation"
fi
check "le faux Leclerc a servi l'accueil du magasin" requested '/magasin-000001-000001-Ville-Test/'
check "aucune recherche ni écriture du panier pendant la lecture du magasin" nothing_sent
sleep 1
screenshot e02-lecture-confirmation
if tap 'text="Enregistrer"'; then ok "« Enregistrer » touché"; else ko "le bouton « Enregistrer » est introuvable"; fi
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
if open_pass "$RUN_FULL" plan-complet.json; then
  ok "drive.start ouvre le drive sur le faux magasin et l'agent affiche « Prêt à remplir ton panier »"
else
  ko "le récapitulatif de l'agent ne s'est pas affiché"
fi
check "récapitulatif : 2 produits connus à mettre au panier" ui_has 'produits connus à mettre'
check "récapitulatif : 1 nouveau produit à choisir" ui_has 'nouveau produit à choisir'
check "l'écran reste allumé pendant le passage" screen_held
check "rien ne part vers le site avant « Commencer »" nothing_sent
sleep 1
screenshot e04-recapitulatif
if tap 'text="Commencer"'; then ok "« Commencer » touché"; else ko "le bouton « Commencer » est introuvable"; fi
if wait_until 60 cart_is "$CART_KNOWN"; then
  ok "phase A : le panier du faux Leclerc a les quantités du plan (farine x3, sucre x1), écrites en quantités absolues"
else
  ko "phase A : le panier du faux Leclerc n'a pas les quantités du plan : $(fake_state | cut -c1-120)"
fi
if wait_until 60 ui_has 'Il te faut'; then
  ok "phase B : l'agent affiche lui-même la liste des produits trouvés pour le poivre"
else
  ko "phase B : la liste de choix ne s'est pas affichée"
fi
check "phase B : le nombre de produits est calculé (80 g demandés, 40 g par produit)" ui_has '80 g demandés'
check "l'agent ne choisit jamais seul : le panier n'a pas changé" cart_is "$CART_KNOWN"
sleep 1
screenshot e05-choix
if tap 'text="Choisir"'; then ok "premier produit proposé choisi (poivre moulu)"; else ko "aucun bouton « Choisir » à l'écran"; fi
if wait_until 60 ui_has 'Panier rempli'; then ok "l'agent annonce « Panier rempli »"; else ko "l'agent n'a pas annoncé la fin"; fi
check "le panier du faux Leclerc : farine x3, sucre x1 et le poivre choisi x2" cart_is "$CART_FULL"
polite_agent
sleep 1
screenshot e06-fin-du-passage
if tap 'text="Retourner dans Repas"'; then ok "« Retourner dans Repas » touché"; else ko "le bouton de retour est introuvable"; fi
if wait_until 20 result_has "$RUN_FULL" completed ''; then
  ok "Repas reçoit drive.result : le résultat de l'agent, « completed », du même runId"
else
  ko "Repas n'a pas reçu le résultat du passage"
fi
check "le résultat détaille chaque ligne (ajoutée, ajoutée, à la maison, ignorée, choisie)" \
  result_detail 'farine:ADDED:1000001:3,sucre:ADDED:1000006:1,sel:HAVE_AT_HOME::,huile:SKIPPED::,poivre:CHOSEN:1000021:2'
back_to_repas || ko "l'écran Repas n'est pas revenu"
check "l'écran n'est plus maintenu allumé une fois le passage fini" screen_not_held
sleep 1
screenshot e07-retour-repas

# --- 3. Annuler au récapitulatif ------------------------------------------------------------------------------------------------------------
say
say "3. « Annuler » au récapitulatif : rien ne part vers le site"
RUN_CANCEL=ca4ce100-0000-4000-8000-000000000003
if open_pass "$RUN_CANCEL" plan-connu.json; then ok "le récapitulatif s'affiche"; else ko "le récapitulatif ne s'est pas affiché"; fi
if tap 'text="Annuler"'; then ok "« Annuler » touché dans l'interface de l'agent"; else ko "le bouton « Annuler » est introuvable"; fi
if wait_until 20 ui_has 'Envoi arrêté'; then ok "l'agent annonce « Envoi arrêté »"; else ko "l'agent n'a pas annoncé l'arrêt"; fi
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
fake_behavior '{"latencyMs":1500}' # le passage dure assez longtemps pour être interrompu au milieu
start_plan "$RUN_ABANDON" plan-connu.json
wait_until 70 agent_screen 'Prêt à remplir ton panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 30 ui_has 'Remplissage du panier'; then ok "le passage est en cours (écran de progression de l'agent)"; else ko "le passage n'a pas commencé"; fi
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
sleep 4 # le temps que la requête en vol de la page abandonnée finisse

# --- 5. Application tuée en plein passage, puis reprise ---------------------------------------------------------------------------------
say
say "5. Application tuée en plein passage, puis reprise"
RUN_RESUME=4e5a0000-0000-4000-8000-000000000005
if open_pass "$RUN_RESUME" plan-complet.json; then ok "le récapitulatif s'affiche"; else ko "le récapitulatif ne s'est pas affiché"; fi
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
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
# La WebView est neuve : la session de l'agent est perdue, il repart du récapitulatif (les quantités étant absolues, refaire la phase A est sans risque).
resumed=0
until=$((SECONDS + 70))
while [ "$SECONDS" -lt "$until" ]; do
  if ui_has 'Prêt à remplir ton panier'; then
    resumed=1
    break
  fi
  sleep 2
done
if [ "$resumed" = "1" ]; then ok "le drive se rouvre et le plan est renvoyé à l'agent (récapitulatif)"; else ko "le plan n'a pas été renvoyé à l'agent"; fi
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
wait_until 60 ui_has 'Il te faut' || ko "la liste de choix ne s'est pas affichée après la reprise"
tap 'text="Choisir"' || ko "aucun bouton « Choisir » à l'écran"
if wait_until 60 ui_has 'Panier rempli'; then ok "le passage repris se termine (« Panier rempli »)"; else ko "le passage repris ne s'est pas terminé"; fi
check "le panier du faux Leclerc est exact, sans doublon (farine x3, sucre x1, poivre x2)" cart_is "$CART_FULL"
polite_agent
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_RESUME" completed ''; then
  ok "Repas reçoit le résultat « completed » du passage repris"
else
  ko "Repas n'a pas reçu le résultat du passage repris"
fi
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
wait_until 70 agent_screen 'Prêt à remplir ton panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'Panier rempli en partie'; then ok "l'agent s'arrête et annonce « Panier rempli en partie »"; else ko "l'agent n'a pas annoncé l'arrêt"; fi
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
wait_until 70 agent_screen 'Prêt à remplir ton panier' || ko "le récapitulatif ne s'est pas affiché"
tap 'text="Commencer"' || ko "le bouton « Commencer » est introuvable"
if wait_until 60 ui_has 'Envoi interrompu'; then ok "l'agent s'interrompt : « Envoi interrompu »"; else ko "l'agent n'a pas détecté le changement"; fi
check "l'agent dit que Leclerc a modifié son site" ui_has 'Leclerc a modifié son site'
sleep 1
screenshot e13-site-change
if tap 'text="Retourner dans Repas"' && wait_until 20 result_has "$RUN_CHANGED" error ', "errorCode": "CONTRACT_CHANGED"'; then
  ok "Repas reçoit « error / CONTRACT_CHANGED »"
else
  ko "Repas n'a pas reçu « error / CONTRACT_CHANGED »"
fi
check "rien n'a été mis au panier" cart_is '{}'
back_to_repas || ko "l'écran Repas n'est pas revenu"

# --- 8. Bilan ------------------------------------------------------------------------------------------------------------------------------
say
say "8. Bilan"
fake_reset
final_checks
conclude "les scénarios complets"

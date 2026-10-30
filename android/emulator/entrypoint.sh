#!/usr/bin/env bash
# Lancé DANS le conteneur de l'émulateur (jamais à la main sur la machine) par `make android-emulator-up` (DRV-319).
#
# 1. Premier lancement seulement : télécharge dans le volume /sdk le SDK (platform-tools, émulateur) et l'image système Google APIs, puis crée
#    l'AVD. Les lancements suivants réutilisent tout, sans rien télécharger.
# 2. Démarre le DNS local (tout *.leclercdrive.fr, le faux Repas repas.test et l'enseigne FICTIVE d'essai *.exemple-b.test (DRV-707) pointent vers la machine hôte de l'émulateur, 10.0.2.2 ; aucun autre nom ne se résout), le
#    faux site Leclerc complet (Node, drive-agent/fake-leclerc, HTTP sur 127.0.0.1:8099 dans ce conteneur) et les faux sites HTTPS (testsite.py,
#    port 443 : le faux Repas, la page de test du drive, et le faux Leclerc en relais) : l'émulateur ne peut donc JAMAIS joindre le vrai site Leclerc.
# 3. Lance l'émulateur sans fenêtre, accéléré par KVM.
set -euo pipefail

API="${EMULATOR_API:-34}"
IMAGE="system-images;android-${API};google_apis;x86_64"
AVD=repas
SITE=/sdk/site

log() { echo "[émulateur] $*"; }

# --- 1. SDK, image système, AVD (volume) -------------------------------------------------------------------------------------------------
# avdmanager ne trouve les images système que si les outils en ligne de commande sont dans le SDK lui-même : on les y copie une fois.
if [ ! -x /sdk/cmdline-tools/latest/bin/avdmanager ]; then
  mkdir -p /sdk/cmdline-tools
  cp -r /opt/cmdline-tools/latest /sdk/cmdline-tools/latest
fi
export PATH="/sdk/cmdline-tools/latest/bin:$PATH"
if [ ! -x /sdk/platform-tools/adb ] || [ ! -x /sdk/emulator/emulator ] || [ ! -f "/sdk/system-images/android-${API}/google_apis/x86_64/system.img" ]; then
  log "Premier lancement : téléchargement du SDK et de l'image système Android ${API} (environ 2 Go, une seule fois)."
  (set +o pipefail; yes | sdkmanager --sdk_root=/sdk --licenses > /dev/null)
  sdkmanager --sdk_root=/sdk "platform-tools" "emulator" "$IMAGE"
  log "Téléchargement terminé."
fi

set_config() { # set_config <clé> <valeur> : fixe une ligne de config.ini de l'AVD
  local file="$ANDROID_AVD_HOME/$AVD.avd/config.ini"
  grep -v "^$1=" "$file" > "$file.tmp" || true
  echo "$1=$2" >> "$file.tmp"
  mv "$file.tmp" "$file"
}

if [ ! -d "$ANDROID_AVD_HOME/$AVD.avd" ]; then
  log "Création de l'AVD « $AVD » (Android ${API}, Google APIs, écran de Pixel 9)."
  mkdir -p "$ANDROID_AVD_HOME"
  echo no | avdmanager create avd --name "$AVD" --package "$IMAGE" --device pixel_5 --force > /dev/null
  set_config hw.ramSize 3072
  set_config disk.dataPartition.size 4G
  set_config hw.keyboard yes
fi
# L'écran est celui du téléphone de l'utilisateur, un Pixel 9 : 1080 x 2424 pixels à 420 dpi, soit 411 x 923 dp. Un écran plus petit ou plus
# grand cacherait le défaut de lisibilité du site en mode ordinateur (fenêtre de 980 px CSS affichée sur 411 dp, facteur 2,4). Réécrit à chaque
# démarrage, pour qu'un AVD créé avant ce réglage le reçoive aussi ; EMULATOR_LCD_* le change (compose.yaml).
set_config hw.lcd.width "${EMULATOR_LCD_WIDTH:-1080}"
set_config hw.lcd.height "${EMULATOR_LCD_HEIGHT:-2424}"
set_config hw.lcd.density "${EMULATOR_LCD_DENSITY:-420}"

# --- 2. Faux site et DNS local -----------------------------------------------------------------------------------------------------------
mkdir -p "$SITE"
if [ ! -f "$SITE/cert.pem" ] || ! openssl x509 -in "$SITE/cert.pem" -noout -checkend 604800 > /dev/null \
  || ! openssl x509 -in "$SITE/cert.pem" -noout -ext subjectAltName | grep -q "repas.test" \
  || ! openssl x509 -in "$SITE/cert.pem" -noout -ext subjectAltName | grep -q "exemple-b.test" \
  || ! openssl x509 -in "$SITE/cert.pem" -noout -ext subjectAltName | grep -q "compte.auchan.fr"; then
  log "Création du certificat jetable des faux sites (reste dans le volume, jamais dans le dépôt)."
  openssl req -x509 -newkey rsa:2048 -nodes -days 397 -keyout "$SITE/key.pem" -out "$SITE/cert.pem" \
    -subj "/CN=faux-sites.test" -addext "subjectAltName=DNS:leclercdrive.fr,DNS:*.leclercdrive.fr,DNS:repas.test,DNS:exemple-b.test,DNS:*.exemple-b.test,DNS:www.auchan.fr,DNS:compte.auchan.fr" 2> /dev/null
fi
# L'empreinte de sa clé publique : la WebView de l'émulateur n'ignore les erreurs de certificat que pour cette clé-là (voir smoke.sh).
openssl x509 -in "$SITE/cert.pem" -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64 > "$SITE/spki.b64"

: > "$SITE/dns.log"
: > "$SITE/access.log"
dnsmasq --keep-in-foreground --user=root --no-resolv --no-hosts --bind-interfaces --listen-address=127.0.0.1 \
  --address=/leclercdrive.fr/10.0.2.2 --address=/repas.test/10.0.2.2 --address=/exemple-b.test/10.0.2.2 \
  --address=/www.auchan.fr/10.0.2.2 --address=/compte.auchan.fr/10.0.2.2 --log-queries --log-facility="$SITE/dns.log" &
# Le faux Leclerc complet (catalogue, recherche, panier, défauts simulés) : accès local seulement, il n'écoute que sur 127.0.0.1 (le relais HTTPS de
# testsite.py lui parle ; le pilotage /__fake/* n'est offert qu'aux noms de la boucle locale, donc à `docker compose exec`, jamais à l'émulateur).
# Il accepte aussi le nom de l'accueil de l'enseigne (www), que testsite.py ne lui relaie qu'en mode « fake » (scénarios complets).
FAKE_LECLERC_PORT=8099 FAKE_LECLERC_HOSTS=www.leclercdrive.fr,m-courses.leclercdrive.fr node /opt/fake-leclerc/main.ts > "$SITE/fake-leclerc.log" 2>&1 &
# Le faux site d'Auchan (DRV-717, jamais le vrai ; DRV-731) : HTTP sur 127.0.0.1:8098, pilotage réservé aux noms de la boucle locale. testsite.py lui relaie
# www.auchan.fr seulement ; compte.auchan.fr (la connexion) est une page de test à part. Ce sont les DEUX seuls noms d'Auchan que le DNS résout (vers 10.0.2.2).
FAKE_AUCHAN_PORT=8098 node /opt/fake-auchan/main.ts > "$SITE/fake-auchan.log" 2>&1 &
SITE_DIR="$SITE" python3 /opt/repas-emulator/testsite.py &

# --- 3. L'émulateur ---------------------------------------------------------------------------------------------------------------------
log "Démarrage de l'émulateur (sans fenêtre, accélération KVM)."
exec emulator -avd "$AVD" -no-window -no-audio -no-boot-anim -no-snapshot -no-metrics -accel on \
  -gpu swiftshader_indirect -memory "${EMULATOR_MEMORY:-3072}" -cores "${EMULATOR_CORES:-4}" -dns-server 127.0.0.1

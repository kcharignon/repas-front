#!/usr/bin/env bash
# Lancé DANS le conteneur Docker de construction, par `make android`, `make android-test`, `make android-release` et
# `make android-release-selftest` (jamais à la main sur la machine : ni JDK, ni SDK Android n'y sont requis).
#
#   ./build.sh test              les tests Kotlin (application et dérivation de la version)
#   ./build.sh apk               l'APK de débogage dans dist/repas-drive-debug.apk, avec sa taille et son empreinte SHA-256
#   ./build.sh release           l'APK signé dans dist/repas-drive.apk ; refuse sans clé de signature, étiquette ni compteur
#   ./build.sh release-selftest  prouve le refus sans clé et la réussite avec une clé jetable créée à l'instant
#
# Variables d'environnement (voir README.md) : ANDROID_VERSION_TAG, ANDROID_VERSION_CODE, ANDROID_COMMIT, et pour `release`
# ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD. Aucune valeur secrète n'est affichée
# ni écrite dans le dépôt : la clé décodée vit dans un fichier temporaire du conteneur, effacé en sortie.
set -euo pipefail
cd "$(dirname "$0")"

GRADLE=(gradle --no-daemon --console=plain)
# Le dossier des fichiers produits ; `release-selftest` le détourne pour ne jamais laisser de faux APK signé dans dist/.
DIST="${ANDROID_DIST:-dist}"

fail() {
  echo "ERREUR : $*" >&2
  exit 1
}

# Affiche la taille et l'empreinte d'un fichier produit.
report() {
  local file=$1 size sha256
  size=$(stat -c %s "$file")
  sha256=$(sha256sum "$file" | cut -d' ' -f1)
  echo
  echo "Fichier : android/${file}"
  echo "Taille : ${size} octets"
  echo "Empreinte SHA-256 : ${sha256}"
}

run_tests() {
  "${GRADLE[@]}" :app:testDebugUnitTest
  # La dérivation de la version vit dans buildSrc : Gradle ne joue pas ses tests tout seul.
  "${GRADLE[@]}" -p buildSrc test
}

build_debug() {
  "${GRADLE[@]}" :app:assembleDebug
  mkdir -p "$DIST"
  cp app/build/outputs/apk/debug/app-debug.apk "$DIST/repas-drive-debug.apk"
  report "$DIST/repas-drive-debug.apk"
}

# Refuse tout de suite, avec un message clair, ce que Gradle refuserait de toute façon un peu plus tard.
require_release_inputs() {
  local missing=() name
  for name in ANDROID_KEYSTORE_BASE64 ANDROID_KEYSTORE_PASSWORD ANDROID_KEY_ALIAS ANDROID_KEY_PASSWORD; do
    [ -n "${!name:-}" ] || missing+=("$name")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    fail "pas de clé de signature : ${missing[*]} manque. Une publication se signe avec une clé fournie par variables d'environnement (voir android/README.md), jamais avec une clé du dépôt."
  fi
  [ -n "${ANDROID_VERSION_TAG:-}" ] || fail "une publication demande l'étiquette de version : ANDROID_VERSION_TAG=android-vX.Y.Z (par exemple android-v0.1.0)."
  [ -n "${ANDROID_VERSION_CODE:-}" ] || fail "une publication demande le compteur de version : ANDROID_VERSION_CODE=<entier qui monte à chaque construction>."
}

build_release() {
  require_release_inputs
  local keystore
  keystore=$(mktemp)
  trap "rm -f '$keystore'" EXIT
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$keystore" || fail "ANDROID_KEYSTORE_BASE64 n'est pas du base64 valide."
  # Gradle reçoit le chemin du fichier ; les mots de passe restent dans l'environnement.
  ANDROID_KEYSTORE_FILE="$keystore" "${GRADLE[@]}" :app:assembleRelease
  mkdir -p "$DIST"
  cp app/build/outputs/apk/release/app-release.apk "$DIST/repas-drive.apk"
  report "$DIST/repas-drive.apk"
}

# Preuve que la porte est fermée sans clé et ouverte avec une clé de test. La clé et ses mots de passe sont jetables : créés ici,
# effacés en sortie, jamais affichés.
release_selftest() {
  local work output apk
  work=$(mktemp -d)
  trap "rm -rf '$work' '$PWD/dist/selftest'" EXIT
  local clean_env=(env -u ANDROID_KEYSTORE_BASE64 -u ANDROID_KEYSTORE_PASSWORD -u ANDROID_KEY_ALIAS -u ANDROID_KEY_PASSWORD -u ANDROID_VERSION_TAG -u ANDROID_VERSION_CODE)

  echo "1. Sans clé de signature, la publication doit être refusée."
  if output=$("${clean_env[@]}" ANDROID_DIST=dist/selftest "$0" release 2>&1); then
    fail "la publication a réussi sans clé de signature."
  fi
  grep -q "pas de clé de signature" <<<"$output" || fail "le refus sans clé n'a pas le message attendu : $output"
  [ ! -e dist/selftest/repas-drive.apk ] || fail "un APK a été produit sans clé de signature."
  # Seconde ligne de défense : Gradle, appelé directement sans passer par ce script, refuse lui aussi.
  if output=$("${clean_env[@]}" "${GRADLE[@]}" :app:assembleRelease 2>&1); then
    fail "Gradle a construit une publication sans clé de signature."
  fi
  grep -q "Pas de clé de signature" <<<"$output" || fail "le refus de Gradle sans clé n'a pas le message attendu."
  echo "   refusée par le script et par Gradle, comme attendu."

  echo "2. Avec une clé jetable, la publication doit réussir et l'APK doit porter cette clé."
  local password
  password=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
  keytool -genkeypair -keystore "$work/test.p12" -storetype PKCS12 -alias test -keyalg RSA -keysize 2048 -validity 2 \
    -storepass "$password" -keypass "$password" -dname "CN=Cle de test jetable" > /dev/null 2>&1
  ANDROID_DIST=dist/selftest \
    ANDROID_KEYSTORE_BASE64=$(base64 -w0 "$work/test.p12") \
    ANDROID_KEYSTORE_PASSWORD=$password \
    ANDROID_KEY_ALIAS=test \
    ANDROID_KEY_PASSWORD=$password \
    ANDROID_VERSION_TAG=${ANDROID_VERSION_TAG:-android-v0.0.0} \
    ANDROID_VERSION_CODE=${ANDROID_VERSION_CODE:-1} \
    "$0" release
  apk=dist/selftest/repas-drive.apk
  [ -f "$apk" ] || fail "la publication n'a pas produit $apk."
  "$ANDROID_HOME/build-tools/${ANDROID_BUILD_TOOLS}/apksigner" verify --print-certs "$apk" | grep -q "Cle de test jetable" \
    || fail "l'APK n'est pas signé par la clé jetable."
  echo "   réussie, l'APK porte la clé jetable (effacé en sortie)."
}

# L'agent du drive est un actif de l'application (DRV-313) : construit par Node avant Gradle (`make agent-build`), monté dans ../drive-agent/dist.
require_agent() {
  [ -f ../drive-agent/dist/agent.js ] || fail "l'agent du drive manque (drive-agent/dist/agent.js) : lance d'abord make agent-build."
}

case "${1:-apk}" in
  test) require_agent; run_tests ;;
  apk) require_agent; build_debug ;;
  release) require_agent; build_release ;;
  release-selftest) release_selftest ;;
  *)
    echo "Usage : build.sh test|apk|release|release-selftest" >&2
    exit 2
    ;;
esac

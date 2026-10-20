#!/usr/bin/env bash
# Lancé DANS le conteneur Docker de construction, par `make android`, `make android-test`, `make android-release` et
# `make android-release-selftest` (jamais à la main sur la machine : ni JDK, ni SDK Android n'y sont requis).
#
#   ./build.sh test              les tests Kotlin (le cœur `core/`, l'application `app/` et la dérivation de la version), puis le contrôle des deux
#                                variantes de distribution : `direct` (APK GitHub, se met à jour elle-même) a la permission d'installer et le code
#                                de mise à jour, `play` (Google Play, à venir) n'en a ni l'une ni l'autre (DRV-639)
#   ./build.sh apk              l'APK de débogage dans dist/repas-drive-debug.apk, avec sa taille et son empreinte SHA-256
#   ./build.sh release           l'APK signé dans dist/repas-drive.apk ; refuse sans clé de signature ni étiquette de version
#   ./build.sh verify-release    contrôle l'APK signé (dist/repas-drive.apk, ou le fichier donné en argument) : signature et empreinte du
#                                certificat, version tirée de l'étiquette, deux permissions (Internet et l'installation de la mise à jour), ni
#                                débogage ni plan d'essai, agent intact ;
#                                écrit dist/release-facts.env (version, empreintes) pour les notes de la release (DRV-315)
#   ./build.sh release-selftest  prouve le refus sans clé, la réussite avec une clé jetable créée à l'instant et les refus du contrôle
#
# Variables d'environnement (voir README.md) : ANDROID_VERSION_TAG, ANDROID_COMMIT, et pour `release`
# ANDROID_KEYSTORE_BASE64, ANDROID_KEYSTORE_PASSWORD, ANDROID_KEY_ALIAS, ANDROID_KEY_PASSWORD ; pour `verify-release`
# ANDROID_EXPECTED_CERT_SHA256 (la ou les empreintes SHA-256 attendues du certificat, séparées par des virgules ; publiques). Le code de
# version d'une publication vient de l'étiquette (ANDROID_VERSION_CODE n'est utile qu'aux constructions de débogage). Aucune valeur secrète
# n'est affichée ni écrite dans le dépôt : la clé décodée vit dans un fichier temporaire du conteneur, effacé en sortie.
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
  # Le cœur (Kotlin sans Android, AUTH-015) puis l'application : un seul appel de Gradle. Compiler le cœur sans le SDK Android est déjà
  # un contrôle d'architecture ; `CoreArchitectureTest` le dit en clair.
  "${GRADLE[@]}" :core:test :app:testDirectDebugUnitTest :app:testPlayDebugUnitTest
  # La dérivation de la version vit dans buildSrc : Gradle ne joue pas ses tests tout seul.
  "${GRADLE[@]}" -p buildSrc test
  check_distributions
}

# Les deux variantes de distribution (DRV-639) : la permission d'installer des applications et le code de la mise à jour dans l'application ne
# sont que dans `direct` (l'APK de la release GitHub). La variante `play` (Google Play, à venir : Google interdit à une application distribuée par
# Play de s'installer ailleurs) n'en contient NI l'un NI l'autre, ni l'APK de débogage : on construit leurs manifestes et leurs classes, et on les lit.
check_distributions() {
  # Les manifestes de PUBLICATION (release) sont ceux qui comptent. Gradle refuse de les traiter sans clé : on lui en donne une factice, qui ne
  # signe rien (seul le manifeste est fusionné ; le fichier est effacé en sortie).
  local dummy
  dummy=$(mktemp)
  "${GRADLE[@]}" :app:processDirectDebugManifest :app:processPlayDebugManifest :app:compileDirectDebugKotlin :app:compilePlayDebugKotlin
  env ANDROID_KEYSTORE_FILE="$dummy" ANDROID_KEYSTORE_PASSWORD=factice ANDROID_KEY_ALIAS=factice ANDROID_KEY_PASSWORD=factice ANDROID_VERSION_TAG=android-v0.0.1 \
    "${GRADLE[@]}" :app:processDirectReleaseManifest :app:processPlayReleaseManifest
  rm -f "$dummy"
  local direct_release play_release direct_debug play_debug direct_classes play_classes installer_classes
  manifest_of() { find "app/build/intermediates/merged_manifests/$1" -name AndroidManifest.xml | head -n 1; }
  direct_release=$(manifest_of directRelease)
  play_release=$(manifest_of playRelease)
  direct_debug=$(manifest_of directDebug)
  play_debug=$(manifest_of playDebug)
  direct_classes=app/build/tmp/kotlin-classes/directDebug
  play_classes=app/build/tmp/kotlin-classes/playDebug
  [ -f "$direct_release" ] && [ -f "$play_release" ] && [ -f "$direct_debug" ] && [ -f "$play_debug" ] || fail "les manifestes des variantes direct et play sont introuvables après leur construction."
  # direct (l'APK publié) : Internet, la permission d'installer sa mise à jour et son fournisseur de fichiers privé
  grep -q 'android.permission.INTERNET' "$direct_release" || fail "la variante direct n'a pas la permission Internet."
  grep -q 'android.permission.REQUEST_INSTALL_PACKAGES' "$direct_release" || fail "la variante direct (qui se met à jour elle-même) doit déclarer REQUEST_INSTALL_PACKAGES."
  grep -q 'androidx.core.content.FileProvider' "$direct_release" || fail "la variante direct doit déclarer son fournisseur de fichiers privé."
  # play (Google Play, à venir) : ni la permission d'installer ni le fournisseur de fichiers
  grep -q 'android.permission.INTERNET' "$play_release" || fail "la variante play n'a pas la permission Internet."
  ! grep -q 'REQUEST_INSTALL_PACKAGES' "$play_release" || fail "la variante play (Google Play) contient la permission REQUEST_INSTALL_PACKAGES : elle ne doit pas s'installer elle-même."
  ! grep -q 'FileProvider' "$play_release" || fail "la variante play contient un fournisseur de fichiers de mise à jour."
  # les APK de débogage ne se mettent jamais à jour eux-mêmes : Internet seulement
  for manifest in "$direct_debug" "$play_debug"; do
    ! grep -q 'REQUEST_INSTALL_PACKAGES' "$manifest" || fail "un APK de débogage contient la permission d'installer : il ne se met jamais à jour lui-même ($manifest)."
    ! grep -q 'FileProvider' "$manifest" || fail "un APK de débogage contient le fournisseur de fichiers de mise à jour ($manifest)."
  done
  ! grep -q 'REQUEST_INSTALL_PACKAGES' app/src/main/AndroidManifest.xml || fail "la permission d'installer ne va pas dans le manifeste commun, seulement dans app/src/direct."
  # le code : seul direct contient celui qui télécharge, écrit et ouvre l'installateur
  installer_classes='DirectSelfUpdate|HttpsHop|PrivateUpdateStorage|AndroidUpdatePlatform'
  find "$direct_classes" -name '*.class' | grep -qE "$installer_classes" || fail "la variante direct ne contient pas le code de mise à jour."
  ! find "$play_classes" -name '*.class' | grep -qE "$installer_classes" || fail "la variante play contient du code de mise à jour dans l'application."
  echo "   variantes : direct (permission d'installer, fournisseur de fichiers, code de mise à jour), play et débogage (aucun des trois)."
}

build_debug() {
  "${GRADLE[@]}" :app:assembleDirectDebug
  mkdir -p "$DIST"
  # ANDROID_APK_NAME : un autre nom de fichier (le test de l'émulateur construit un APK qui vise un faux Repas local, sans écraser le vrai).
  local name="${ANDROID_APK_NAME:-repas-drive-debug.apk}"
  cp app/build/outputs/apk/direct/debug/app-direct-debug.apk "$DIST/$name"
  report "$DIST/$name"
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
  [ -n "${ANDROID_VERSION_TAG:-}" ] || fail "une publication demande l'étiquette de version : ANDROID_VERSION_TAG=android-vX.Y.Z (par exemple android-v0.1.0). Le code de version en est tiré."
}

build_release() {
  require_release_inputs
  local keystore
  keystore=$(mktemp)
  trap "rm -f '$keystore'" EXIT
  printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 -d > "$keystore" || fail "ANDROID_KEYSTORE_BASE64 n'est pas du base64 valide."
  # Gradle reçoit le chemin du fichier ; les mots de passe restent dans l'environnement.
  ANDROID_KEYSTORE_FILE="$keystore" "${GRADLE[@]}" :app:assembleDirectRelease
  mkdir -p "$DIST"
  cp app/build/outputs/apk/direct/release/app-direct-release.apk "$DIST/repas-drive.apk"
  report "$DIST/repas-drive.apk"
}

# --- Contrôle d'un APK de publication (DRV-315) ------------------------------------------------------------------------------------------
BUILD_TOOLS="${ANDROID_HOME:-}/build-tools/${ANDROID_BUILD_TOOLS:-}"
APP_ID=eu.kantin.repas.drive

# Une empreinte sous toute forme usuelle (AB:CD:…, majuscules ou minuscules) ramenée à 64 hexadécimaux minuscules.
normalize_fingerprint() { printf '%s' "$1" | tr -d ': \t\r\n' | tr 'A-F' 'a-f'; }

# Contrôle l'APK signé juste après sa construction (le workflow android-release.yml le lance avant de rien publier) : l'APK que les
# proches installent n'est publié que s'il est bien ce qu'on croit. Aucun secret en jeu : seules des empreintes publiques sont lues.
#   - signé d'une seule clé, de signature valide, dont le certificat a l'une des empreintes attendues (ANDROID_EXPECTED_CERT_SHA256) et n'est
#     jamais celui de la clé de débogage publique ;
#   - paquet, nom et code de version conformes à l'étiquette (le code est recalculé ici, indépendamment du Kotlin), minSdk 26, targetSdk 36 ;
#   - deux permissions seulement (Internet, et REQUEST_INSTALL_PACKAGES pour la mise à jour dans l'application, DRV-639), non débogable, `BuildConfig.DEBUG` faux, origine de Repas de production, aucun plan d'essai ;
#   - l'agent embarqué est celui de android/agent.js.sha384.
verify_release() {
  local apk=${1:-$DIST/repas-drive.apk}
  [ -f "$apk" ] || fail "l'APK à contrôler manque : $apk (make android-release le produit)."

  local tag=${ANDROID_VERSION_TAG:-}
  [[ "$tag" =~ ^android-v(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$ ]] \
    || fail "ANDROID_VERSION_TAG doit être de la forme android-vX.Y.Z pour contrôler la version de l'APK (reçu : « $tag »)."
  local major=${BASH_REMATCH[1]} minor=${BASH_REMATCH[2]} patch=${BASH_REMATCH[3]}
  local want_name="$major.$minor.$patch" want_code=$((major * 1000000 + minor * 1000 + patch))
  { [ "$major" -le 2099 ] && [ "$want_code" -ge 1 ]; } || fail "l'étiquette $tag ne donne pas un code de version valide (de android-v0.0.1 à android-v2099.999.999)."

  local expected=() entries entry
  IFS=', ' read -ra entries <<<"${ANDROID_EXPECTED_CERT_SHA256:-}"
  for entry in "${entries[@]}"; do
    [ -n "$entry" ] || continue
    entry=$(normalize_fingerprint "$entry")
    [[ "$entry" =~ ^[0-9a-f]{64}$ ]] || fail "ANDROID_EXPECTED_CERT_SHA256 contient une empreinte qui n'est pas un SHA-256 (64 caractères hexadécimaux)."
    expected+=("$entry")
  done
  [ "${#expected[@]}" -gt 0 ] || fail "ANDROID_EXPECTED_CERT_SHA256 manque : l'empreinte SHA-256 attendue du certificat de signature (voir android/PUBLICATION.md)."

  # 1. La signature.
  local signer actual
  signer=$("$BUILD_TOOLS/apksigner" verify --verbose --print-certs "$apk" 2>&1) || fail "la signature de l'APK n'est pas valide : $signer"
  grep -q '^Number of signers: 1$' <<<"$signer" || fail "l'APK doit avoir un seul signataire."
  grep -Eq '^Verified using v[23] scheme .*: true$' <<<"$signer" || fail "l'APK n'a ni signature v2 ni signature v3."
  actual=$(awk '/^Signer #1 certificate SHA-256 digest:/ {print $NF; exit}' <<<"$signer")
  [[ "$actual" =~ ^[0-9a-f]{64}$ ]] || fail "l'empreinte du certificat de l'APK est illisible."
  local debug_fingerprint
  debug_fingerprint=$(normalize_fingerprint "$(keytool -list -v -keystore debug.keystore -storepass android -alias androiddebugkey 2> /dev/null | awk '/SHA256:/ {print $2; exit}')")
  [ "$actual" != "$debug_fingerprint" ] || fail "l'APK est signé de la clé de débogage publique : une publication ne s'en sert jamais."
  local found=0
  for entry in "${expected[@]}"; do [ "$entry" = "$actual" ] && found=1; done
  [ "$found" = 1 ] || fail "le certificat de signature de l'APK (SHA-256 $actual) n'est pas l'un de ceux attendus. Mauvaise clé dans les secrets GitHub, ou empreinte à mettre à jour (android/PUBLICATION.md) ?"
  echo "   signature valide, certificat attendu (SHA-256 $actual), pas la clé de débogage."

  # 2. L'identité, la version et les permissions.
  local badging
  badging=$("$BUILD_TOOLS/aapt2" dump badging "$apk") || fail "aapt2 n'a pas pu lire l'APK."
  grep -qF "package: name='$APP_ID' versionCode='$want_code' versionName='$want_name'" <<<"$badging" \
    || fail "paquet, code ou nom de version de l'APK différents de ceux de l'étiquette $tag (attendu : $APP_ID, $want_name, code $want_code) : $(grep -m1 '^package:' <<<"$badging")"
  grep -qF "minSdkVersion:'26'" <<<"$badging" || fail "minSdk de l'APK différent de 26."
  grep -qF "targetSdkVersion:'36'" <<<"$badging" || fail "targetSdk de l'APK différent de 36."
  ! grep -q '^application-debuggable' <<<"$badging" || fail "l'APK est débogable."
  local permissions
  permissions=$(sed -n "s/^uses-permission: name='\([^']*\)'.*/\1/p" <<<"$badging" | sort | tr '\n' ' ')
  [ "$permissions" = "android.permission.INTERNET android.permission.REQUEST_INSTALL_PACKAGES " ] \
    || fail "permissions de l'APK inattendues (seules android.permission.INTERNET et android.permission.REQUEST_INSTALL_PACKAGES sont permises) : $permissions"
  echo "   $APP_ID $want_name (code $want_code), minSdk 26, targetSdk 36, non débogable, deux permissions (Internet, installation de la mise à jour)."

  # 3. Le contenu : l'agent intact, ni plan d'essai ni origine de test, BuildConfig.DEBUG faux.
  local listing agent_actual agent_expected
  listing=$(unzip -Z1 "$apk")
  grep -qx 'assets/agent.js' <<<"$listing" || fail "l'APK ne contient pas l'agent du drive (assets/agent.js)."
  grep -qx 'assets/injection.js' <<<"$listing" || fail "l'APK ne contient pas le script d'injection (assets/injection.js)."
  ! grep -qx 'assets/debug-plan.json' <<<"$listing" || fail "l'APK contient le plan d'essai de débogage (assets/debug-plan.json)."
  agent_actual="sha384-$(unzip -p "$apk" assets/agent.js | openssl dgst -sha384 -binary | base64 -w0)"
  agent_expected=$(tr -d ' \t\r\n' < agent.js.sha384)
  [ "$agent_actual" = "$agent_expected" ] || fail "l'agent embarqué n'a pas l'empreinte de android/agent.js.sha384 (embarqué : $agent_actual)."
  ! unzip -p "$apk" 'classes*.dex' | grep -aq 'repas\.test' || fail "l'APK contient l'origine du faux Repas des essais (repas.test)."
  local config=app/build/generated/source/buildConfig/direct/release/eu/kantin/repas/drive/BuildConfig.java
  [ -f "$config" ] || fail "la configuration de construction ($config) manque : contrôler l'APK juste après make android-release."
  grep -q 'boolean DEBUG = false;' "$config" || fail "BuildConfig.DEBUG n'est pas faux : le menu de débogage serait dans l'APK."
  grep -qF 'REPAS_ORIGIN = "https://kantin.eu/";' "$config" || fail "l'origine de Repas de l'APK n'est pas celle de la production."
  echo "   agent intact ($agent_actual), ni plan d'essai ni menu de débogage, origine de production."

  # Les faits publics de cette publication, pour les notes de la release.
  local sha256 fingerprint
  sha256=$(sha256sum "$apk" | cut -d' ' -f1)
  fingerprint=$(tr 'a-f' 'A-F' <<<"$actual" | sed 's/../&:/g; s/:$//')
  mkdir -p "$DIST"
  {
    echo "VERSION_NAME=$want_name"
    echo "VERSION_CODE=$want_code"
    echo "APK_SHA256=$sha256"
    echo "CERT_SHA256=$fingerprint"
    echo "AGENT_SHA384=$agent_actual"
  } > "$DIST/release-facts.env"
  echo "   contrôle réussi : APK SHA-256 $sha256"
}

# Preuve que la porte est fermée sans clé et ouverte avec une clé de test, et que le contrôle de l'APK refuse ce qu'il doit refuser. La clé
# et ses mots de passe sont jetables : créés ici, effacés en sortie, jamais affichés.
release_selftest() {
  local work output apk
  work=$(mktemp -d)
  trap "rm -rf '$work' '$PWD/dist/selftest'" EXIT
  local clean_env=(env -u ANDROID_KEYSTORE_BASE64 -u ANDROID_KEYSTORE_PASSWORD -u ANDROID_KEY_ALIAS -u ANDROID_KEY_PASSWORD -u ANDROID_VERSION_TAG -u ANDROID_VERSION_CODE)

  # Le premier appel de Gradle dans un conteneur neuf télécharge ses plugins : un incident réseau à ce moment ferait échouer l'essai pour une
  # autre raison que celle qu'il juge. On le fait donc d'abord, avec trois essais, avant de juger le refus.
  echo "0. Préparation de Gradle (plugins téléchargés une fois, jusqu'à trois essais)."
  local attempt warmup=""
  for attempt in 1 2 3; do
    if warmup=$("${GRADLE[@]}" --quiet :app:tasks 2>&1); then break; fi
    [ "$attempt" -lt 3 ] || fail "Gradle n'a pas pu se préparer en trois essais. Fin de sa sortie :
$(tail -n 25 <<<"$warmup")"
    sleep 5
  done

  echo "1. Sans clé de signature, la publication doit être refusée."
  if output=$("${clean_env[@]}" ANDROID_DIST=dist/selftest "$0" release 2>&1); then
    fail "la publication a réussi sans clé de signature."
  fi
  grep -q "pas de clé de signature" <<<"$output" || fail "le refus sans clé n'a pas le message attendu : $(tail -n 25 <<<"$output")"
  [ ! -e dist/selftest/repas-drive.apk ] || fail "un APK a été produit sans clé de signature."
  # Seconde ligne de défense : Gradle, appelé directement sans passer par ce script, refuse lui aussi.
  if output=$("${clean_env[@]}" "${GRADLE[@]}" :app:assembleDirectRelease 2>&1); then
    fail "Gradle a construit une publication sans clé de signature."
  fi
  # Gradle doit s'arrêter sur le refus de la clé. S'il s'arrête avant (réseau, dépôt de plugins…), la fin de sa sortie dit pourquoi : rien de secret
  # n'y figure, l'environnement de cet appel est vide de toute clé.
  grep -q "Pas de clé de signature" <<<"$output" || fail "le refus de Gradle sans clé n'a pas le message attendu. Fin de la sortie de Gradle :
$(tail -n 25 <<<"$output")"
  echo "   refusée par le script et par Gradle, comme attendu."

  echo "2. Avec une clé jetable, la publication doit réussir et l'APK doit porter cette clé."
  local password tag=${ANDROID_VERSION_TAG:-android-v0.0.1}
  password=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')
  keytool -genkeypair -keystore "$work/test.p12" -storetype PKCS12 -alias test -keyalg RSA -keysize 2048 -validity 2 \
    -storepass "$password" -keypass "$password" -dname "CN=Cle de test jetable" > /dev/null 2>&1
  # Le code de version vient de l'étiquette : ANDROID_VERSION_CODE est retiré de l'environnement.
  env -u ANDROID_VERSION_CODE \
    ANDROID_DIST=dist/selftest \
    ANDROID_KEYSTORE_BASE64=$(base64 -w0 "$work/test.p12") \
    ANDROID_KEYSTORE_PASSWORD=$password \
    ANDROID_KEY_ALIAS=test \
    ANDROID_KEY_PASSWORD=$password \
    ANDROID_VERSION_TAG=$tag \
    "$0" release
  apk=dist/selftest/repas-drive.apk
  [ -f "$apk" ] || fail "la publication n'a pas produit $apk."
  "$BUILD_TOOLS/apksigner" verify --print-certs "$apk" | grep -q "Cle de test jetable" \
    || fail "l'APK n'est pas signé par la clé jetable."
  echo "   réussie, l'APK porte la clé jetable (effacé en sortie)."

  echo "3. Le contrôle de l'APK accepte le bon certificat et refuse tout le reste."
  local cert wrong=0000000000000000000000000000000000000000000000000000000000000000
  cert=$(normalize_fingerprint "$(keytool -list -v -keystore "$work/test.p12" -storepass "$password" -alias test 2> /dev/null | awk '/SHA256:/ {print $2; exit}')")
  [[ "$cert" =~ ^[0-9a-f]{64}$ ]] || fail "l'empreinte de la clé jetable est illisible."
  env ANDROID_DIST=dist/selftest ANDROID_VERSION_TAG=$tag ANDROID_EXPECTED_CERT_SHA256="$wrong,$(sed 's/../&:/g; s/:$//' <<<"$cert")" "$0" verify-release "$apk" > /dev/null \
    || fail "le contrôle a refusé l'APK alors que son certificat est dans la liste attendue."
  grep -q "^CERT_SHA256=$(tr 'a-f' 'A-F' <<<"$cert" | sed 's/../&:/g; s/:$//')$" dist/selftest/release-facts.env || fail "release-facts.env ne porte pas l'empreinte du certificat."
  refused() { # refused <motif du message attendu> <variables d'environnement…> : le contrôle doit échouer avec ce message
    local pattern=$1 out
    shift
    if out=$(env -u ANDROID_EXPECTED_CERT_SHA256 ANDROID_DIST=dist/selftest "$@" "$0" verify-release "${REFUSED_APK:-$apk}" 2>&1); then
      fail "le contrôle a accepté ce qu'il devait refuser ($pattern)."
    fi
    grep -q "$pattern" <<<"$out" || fail "le refus n'a pas le message attendu ($pattern) : $out"
  }
  refused "n'est pas l'un de ceux attendus" ANDROID_VERSION_TAG=$tag ANDROID_EXPECTED_CERT_SHA256=$wrong
  refused "ANDROID_EXPECTED_CERT_SHA256 manque" ANDROID_VERSION_TAG=$tag
  refused "différents de ceux de l'étiquette" ANDROID_VERSION_TAG=android-v9.9.9 ANDROID_EXPECTED_CERT_SHA256=$cert
  # Une copie re-signée de la clé de débogage publique est refusée même si l'on s'est trompé en l'attendant.
  local debug_fingerprint
  debug_fingerprint=$(keytool -list -v -keystore debug.keystore -storepass android -alias androiddebugkey 2> /dev/null | awk '/SHA256:/ {print $2; exit}')
  cp "$apk" "$work/debug-signed.apk"
  "$BUILD_TOOLS/apksigner" sign --ks debug.keystore --ks-pass pass:android --ks-key-alias androiddebugkey --key-pass pass:android "$work/debug-signed.apk"
  REFUSED_APK="$work/debug-signed.apk" refused "clé de débogage publique" ANDROID_VERSION_TAG=$tag ANDROID_EXPECTED_CERT_SHA256=$debug_fingerprint
  echo "   accepté avec le bon certificat ; refusé avec un autre, sans empreinte attendue, avec une autre version et avec la clé de débogage."
}

# L'agent du drive est un actif de l'application (DRV-313) : construit par Node avant Gradle (`make agent-build`), monté dans ../drive-agent/dist.
require_agent() {
  [ -f ../drive-agent/dist/agent.js ] || fail "l'agent du drive manque (drive-agent/dist/agent.js) : lance d'abord make agent-build."
}

case "${1:-apk}" in
  test) require_agent; run_tests ;;
  apk) require_agent; build_debug ;;
  release) require_agent; build_release ;;
  verify-release) verify_release "${2:-}" ;;
  release-selftest) release_selftest ;;
  *)
    echo "Usage : build.sh test|apk|release|verify-release [apk]|release-selftest" >&2
    exit 2
    ;;
esac

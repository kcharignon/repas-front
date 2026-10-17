#!/usr/bin/env bash
# Outil de test jetable, à supprimer après la décision G1 (DRV-005).
# Lancé DANS le conteneur Docker de construction, par `make android-lab` ou `make android-lab-test` (jamais à la main sur la machine).
#
#   ./build.sh test   les tests unitaires Kotlin seulement
#   ./build.sh apk    les tests, puis l'APK de débogage dans dist/repas-android-lab.apk, avec sa taille et son empreinte SHA-256
set -euo pipefail
cd "$(dirname "$0")"

case "${1:-apk}" in
  test)
    gradle --no-daemon --console=plain :app:testDebugUnitTest
    ;;
  apk)
    gradle --no-daemon --console=plain :app:testDebugUnitTest :app:assembleDebug
    mkdir -p dist
    cp app/build/outputs/apk/debug/app-debug.apk dist/repas-android-lab.apk
    size=$(stat -c %s dist/repas-android-lab.apk)
    sha256=$(sha256sum dist/repas-android-lab.apk | cut -d' ' -f1)
    echo
    echo "APK de test construit : drive-agent/android-lab/dist/repas-android-lab.apk"
    echo "Taille : ${size} octets"
    echo "Empreinte SHA-256 : ${sha256}"
    echo "Suite : drive-agent/android-lab/PROCEDURE.md"
    ;;
  *)
    echo "Usage : build.sh test|apk" >&2
    exit 2
    ;;
esac

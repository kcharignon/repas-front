#!/usr/bin/env bash
# Pilote l'émulateur Android de test (DRV-319) depuis la machine, via Docker. Lancé par le Makefile, depuis la racine du dépôt :
#
#   ./android/emulator/ctl.sh up       démarre l'émulateur et attend la fin de son démarrage (rien à refaire s'il tourne déjà)
#   ./android/emulator/ctl.sh down     l'arrête (le volume du SDK et de l'AVD reste : le prochain démarrage ne télécharge rien)
#   ./android/emulator/ctl.sh status   dit où il en est ; code de sortie 0 seulement s'il est prêt
#
# Variables : DOCKER_COMPOSE (défaut « docker compose »), EMULATOR_BOOT_TIMEOUT (secondes, défaut 1800 : le premier lancement télécharge environ 2 Go).
set -euo pipefail
cd "$(dirname "$0")/../.."

read -ra COMPOSE <<< "${DOCKER_COMPOSE:-docker compose}"
COMPOSE+=(--profile android-emulator)
SERVICE=android-emulator
BOOT_TIMEOUT="${EMULATOR_BOOT_TIMEOUT:-1800}"

in_emulator() { "${COMPOSE[@]}" exec -T "$SERVICE" "$@"; }
container_running() { [ -n "$("${COMPOSE[@]}" ps -q --status running "$SERVICE" 2> /dev/null)" ]; }
booted() { container_running && [ "$(in_emulator adb shell getprop sys.boot_completed 2> /dev/null | tr -d '\r')" = "1" ]; }

kvm_ok() { [ -c /dev/kvm ] && [ -r /dev/kvm ] && [ -w /dev/kvm ]; }

require_kvm() {
  kvm_ok && return 0
  cat >&2 <<'MSG'
ERREUR : /dev/kvm manque ou n'est pas ouvert en lecture et écriture. Sans lui l'émulateur est inutilisable (trop lent).
Étape humaine, dans le terminal WSL, une fois par démarrage de WSL :
    sudo modprobe kvm_intel && sudo chmod 666 /dev/kvm
Pour que ce soit automatique à chaque démarrage de WSL : voir android/README.md (« Activer KVM de façon permanente »).
MSG
  exit 3
}

up() {
  require_kvm
  if booted; then
    echo "L'émulateur tourne déjà et a fini de démarrer."
    return 0
  fi
  mkdir -p android/dist # sinon Docker crée ce dossier, au nom de root, en le montant
  local first=""
  docker volume inspect repas-front_android-emulator-sdk > /dev/null 2>&1 || first=" (premier lancement : téléchargement du SDK, environ 2 Go, quelques minutes)"
  echo "Démarrage de l'émulateur${first}…"
  "${COMPOSE[@]}" build --quiet "$SERVICE" > /dev/null
  "${COMPOSE[@]}" up -d --no-build "$SERVICE" 2> /dev/null
  local started=$SECONDS waited last_log=$SECONDS
  until booted; do
    waited=$((SECONDS - started))
    if ! container_running; then
      echo "ERREUR : le conteneur de l'émulateur s'est arrêté. Dernières lignes :" >&2
      "${COMPOSE[@]}" logs --tail 30 "$SERVICE" >&2 || true
      echo "Pistes : android/README.md, « Dépannage »." >&2
      exit 1
    fi
    if [ "$waited" -ge "$BOOT_TIMEOUT" ]; then
      echo "ERREUR : l'émulateur n'a pas fini de démarrer en ${BOOT_TIMEOUT} s. Voir : docker compose --profile android-emulator logs $SERVICE" >&2
      exit 1
    fi
    if [ $((SECONDS - last_log)) -ge 30 ]; then
      last_log=$SECONDS
      echo "  … ${waited} s : $("${COMPOSE[@]}" logs --tail 1 --no-log-prefix "$SERVICE" 2> /dev/null | tr -d '\r' | cut -c1-110)"
    fi
    sleep 3
  done
  echo "Émulateur prêt en $((SECONDS - started)) s."
}

down() {
  "${COMPOSE[@]}" rm -sf "$SERVICE" > /dev/null
  echo "Émulateur arrêté (le SDK et l'AVD restent dans le volume repas-front_android-emulator-sdk)."
}

status() {
  local ready=1
  if kvm_ok; then echo "KVM        : disponible (/dev/kvm)"; else echo "KVM        : ABSENT (voir android/README.md)"; fi
  if docker volume inspect repas-front_android-emulator-sdk > /dev/null 2>&1; then
    echo "Volume SDK : présent (repas-front_android-emulator-sdk)"
  else
    echo "Volume SDK : absent (le premier 'make android-emulator-up' télécharge le SDK)"
  fi
  if ! container_running; then
    echo "Émulateur  : arrêté"
    return 1
  fi
  if booted; then
    echo "Émulateur  : prêt ($(in_emulator adb shell getprop ro.product.model | tr -d '\r'), Android $(in_emulator adb shell getprop ro.build.version.release | tr -d '\r'), niveau $(in_emulator adb shell getprop ro.build.version.sdk | tr -d '\r'))"
    ready=0
  else
    echo "Émulateur  : en cours de démarrage (ou de téléchargement du SDK) ; suivre : docker compose --profile android-emulator logs -f $SERVICE"
  fi
  return "$ready"
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  *)
    echo "Usage : ctl.sh up|down|status" >&2
    exit 2
    ;;
esac

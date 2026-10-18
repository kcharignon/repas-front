.DEFAULT_GOAL := help
DOCKER_COMPOSE ?= docker compose
# Le back de développement (dépôt `repas`, `docker compose up -d`) : le front rejoint son réseau Docker.
BACK_NETWORK ?= repas_default
BACK_PHP = $(shell docker ps -q --filter "network=$(BACK_NETWORK)" --filter "label=com.docker.compose.service=php" | head -n 1)
FRONT_PORT ?= 5173
PROD_PORT ?= 8081
# Une commande ponctuelle dans le conteneur du front (sans dépendances : il n'a pas besoin du back).
RUN = $(DOCKER_COMPOSE) run --rm --no-deps front
# Compte des tests de bout en bout : l'administrateur de démonstration (`make fixtures`), qui n'a pas de liste de courses à lui.
# Surcharge possible : E2E_EMAIL=… E2E_PASSWORD=… make e2e
export E2E_EMAIL ?= admin@repas.fr
export E2E_PASSWORD ?= M0t 2 p@sse

## —— Project setup 🚀 ———————————————————————————————————————————————————————
.PHONY: install start stop restart logs status

install: ## Build the image and install the dependencies (no Node needed on your machine)
	@echo "🔨 Construction de l'image de développement…"
	@$(DOCKER_COMPOSE) build front
	@$(RUN) npm ci
	@echo "✅ Prêt : lance 'make start'"

start: ## Start the front on http://localhost:5173, plugged into the back dev server
	@$(BACK_CHECK)
	@$(DOCKER_COMPOSE) up -d --build --wait front
	@echo "🌿 Front : http://localhost:$(FRONT_PORT)   (comptes de démo : 'make fixtures')"

stop: ## Stop the front and its side services
	@$(DOCKER_COMPOSE) --profile e2e --profile report --profile prod down --remove-orphans

restart: ## Restart the front
	@$(MAKE) stop
	@$(MAKE) start

logs: ## Follow the front logs
	@$(DOCKER_COMPOSE) logs -f front

status: ## Show the containers and check that the front reaches the back
	@$(DOCKER_COMPOSE) --profile prod ps
	@printf "Back via le front (/api/v1/health) : "
	@curl -s --max-time 5 http://localhost:$(FRONT_PORT)/api/v1/health || echo "injoignable (le back tourne-t-il ? le front est-il démarré ?)"
	@echo

## —— Code quality 📋 ————————————————————————————————————————————————————————
.PHONY: check lint lint-fix format format-check type-check test test-coverage audit outdated quality

check: ## Lint, format, types, API types and unit tests: run it before every commit
	@$(RUN) npm run check

lint: ## Run oxlint and ESLint
	@$(RUN) npm run lint

lint-fix: ## Fix what ESLint and oxlint can fix
	@$(RUN) npm run lint:fix

format: ## Format the code with Prettier
	@$(RUN) npm run format

format-check: ## Check the formatting without changing anything
	@$(RUN) npm run format:check

type-check: ## Run vue-tsc (the front's PHPStan)
	@echo "🔍 Check vue-tsc..."
	@$(RUN) npm run type-check

test: ## Run the unit tests
	@echo "🧪 Exécution des tests avec Vitest..."
	@$(RUN) npm run test

test-coverage: ## Run the unit tests with the coverage threshold
	@$(RUN) npm run test:coverage

audit: ## Check the production dependencies against known security advisories
	@$(RUN) npm run audit:prod

outdated: ## List the dependencies with a newer version, majors included
	@$(RUN) npm outdated || true

quality: check audit api-verify agent-verify ## Run everything the CI runs except the browsers

## —— End to end 🎭 ——————————————————————————————————————————————————————————
.PHONY: e2e e2e-offline e2e-visual e2e-report lighthouse

e2e: ## Run Playwright (Chromium) in Docker against the front and the real back
	@$(BACK_CHECK)
	@$(DOCKER_COMPOSE) --profile e2e run --rm e2e

e2e-offline: ## Run the offline reading scenario (service worker) against the production image and the real back
	@$(BACK_CHECK)
	@$(DOCKER_COMPOSE) --profile prod --profile offline run --rm e2e-offline

lighthouse: ## Measure the main pages of the production image (budgets: performance 90, accessibility/best practices 100, SEO 90)
	@$(BACK_CHECK)
	@$(DOCKER_COMPOSE) --profile prod --profile lighthouse run --rm lighthouse

e2e-visual: ## Same, with a screenshot, video and trace of every test, then the report on http://localhost:9323
	@$(BACK_CHECK)
	@E2E_VISUAL=1 $(DOCKER_COMPOSE) --profile e2e run --rm e2e || true
	@echo "📸 Rapport : http://localhost:9323  (Ctrl-C pour quitter)"
	@$(DOCKER_COMPOSE) --profile report run --rm --service-ports e2e-report

e2e-report: ## Open the last Playwright report on http://localhost:9323
	@$(DOCKER_COMPOSE) --profile report run --rm --service-ports e2e-report

## —— API contract 📄 ————————————————————————————————————————————————————————
.PHONY: api-update api-check api-verify

api-update: ## Pin the contract to the latest back commit (or ref=<sha>) and regenerate the types
	@$(RUN) npm run api:update $(if $(ref),-- $(ref),)

api-check: ## Fail if src/api/schema.d.ts does not match api/openapi.json
	@$(RUN) npm run api:check

api-verify: ## Fail if api/openapi.json is not the file of the pinned back commit (needs the network)
	@$(RUN) npm run api:verify

## —— Back & demo data 🗃️ ————————————————————————————————————————————————————
.PHONY: fixtures

fixtures: ## Create the demo accounts and data in the back dev database: admin@repas.fr and user@repas.fr / "M0t 2 p@sse"
	@$(BACK_CHECK)
	@docker exec $(BACK_PHP) bin/console doctrine:fixtures:load --env=dev --group=demo --append -n
	@echo "✅ Connecte-toi sur http://localhost:$(FRONT_PORT) avec admin@repas.fr (administrateur) ou user@repas.fr, mot de passe : M0t 2 p@sse"

## —— Drive Leclerc 🛒 ————————————————————————————————————————————————————
.PHONY: agent-build agent-verify agent-test agent-e2e e2e-agent agent-fake lab lab-publish lab-loader

agent-build: ## Build the drive agent (drive-agent/): dist/agent.js and dist/manifest.json (version, size, SHA-384)
	@$(RUN) npm run --silent agent:build

agent-verify: ## Build the drive agent twice and fail if the two builds differ (reproducibility)
	@$(RUN) npm run --silent agent:verify

agent-test: ## Run the unit tests of the drive agent only (build chain, code rules, agent)
	@$(RUN) npm run --silent agent:test

agent-e2e: ## Run the drive agent end to end in Chromium (Pixel 7) against the fake Leclerc site: no back, no front, no network (DRV-309)
	@$(RUN) npm run --silent agent:e2e

e2e-agent: agent-e2e ## Same as agent-e2e

agent-fake: ## Start the fake Leclerc site by hand on 127.0.0.1:8099 with the Node of your machine (FAKE_LECLERC_PORT, FAKE_LECLERC_HOSTS); Ctrl-C to stop
	@npm run --silent agent:fake

lab: ## Build the throwaway drive test bookmarklet (drive-agent/lab) into drive-agent/lab/dist/lab-bookmarklet.txt and print its size
	@$(RUN) npm run --silent lab:build

lab-publish: ## Copy the built lab.js into drive-agent/lab/published/ (served by jsDelivr once merged; commit it in a PR)
	@$(RUN) npm run --silent lab:build -- --publish

lab-loader: ## Build the short loader bookmarklet for a merged commit: make lab-loader sha=<40-char commit> (writes dist/lab-loader.txt)
	@$(RUN) npm run --silent lab:loader -- $(sha)

## —— Android 📱 (Repas Drive) ———————————————————————————————————————————————
.PHONY: android android-test android-release android-release-selftest android-agent-hash

# L'application « Repas Drive » (DRV-311, android/) se construit dans une image à part (JDK, Gradle, SDK Android), avec l'identifiant de
# l'utilisateur pour que les fichiers produits ne soient pas à root. Elle ne contacte aucun site Leclerc. Les variables de version et de
# signature (ANDROID_VERSION_TAG, ANDROID_VERSION_CODE, ANDROID_KEYSTORE_BASE64…) passent du shell appelant au conteneur : android/README.md.
ANDROID_APP_RUN = $(DOCKER_COMPOSE) --profile android run --rm --user $(shell id -u):$(shell id -g) android

# L'agent du drive (drive-agent/dist/agent.js) est construit par Node puis embarqué dans l'APK (DRV-313) : sur un poste, chaque commande Android
# le reconstruit d'abord ; la CI le construit avant avec setup-node et passe ANDROID_AGENT= pour ne pas relancer le conteneur Node.
# `mkdir` : sans dossier, Docker créerait drive-agent/dist à la place de l'utilisateur (propriétaire root) en le montant.
ANDROID_AGENT ?= agent-build
ANDROID_PREPARE = @mkdir -p drive-agent/dist

android: $(ANDROID_AGENT) ## Build the debug APK of the Repas Drive app (android/): dist/repas-drive-debug.apk with its size and SHA-256
	$(ANDROID_PREPARE)
	@$(ANDROID_APP_RUN) ./build.sh apk

android-test: $(ANDROID_AGENT) ## Run the Kotlin unit tests of the Repas Drive app (and of its version derivation)
	$(ANDROID_PREPARE)
	@$(ANDROID_APP_RUN) ./build.sh test

android-release: $(ANDROID_AGENT) ## Build the signed APK dist/repas-drive.apk (needs ANDROID_KEYSTORE_BASE64/_PASSWORD, ANDROID_KEY_ALIAS/_PASSWORD, ANDROID_VERSION_TAG, ANDROID_VERSION_CODE; refuses without a key)
	$(ANDROID_PREPARE)
	@$(ANDROID_APP_RUN) ./build.sh release

android-release-selftest: $(ANDROID_AGENT) ## Prove that the release build refuses without a key and succeeds with a throwaway key created on the spot
	$(ANDROID_PREPARE)
	@$(ANDROID_APP_RUN) ./build.sh release-selftest

android-agent-hash: ## Note the SHA-384 of the built drive agent in android/agent.js.sha384 (after a deliberate change of the agent)
	@$(RUN) npm run --silent android:agent-hash -- --write

## —— Android lab 📱 ————————————————————————————————————————————————————————
.PHONY: android-lab android-lab-test android-lab-hash

# L'application Android jetable (DRV-011) se construit dans une image à part (JDK, Gradle, SDK Android), avec l'identifiant de l'utilisateur
# pour que les fichiers produits ne soient pas à root. Elle ne contacte aucun site Leclerc.
ANDROID_RUN = $(DOCKER_COMPOSE) --profile android run --rm --user $(shell id -u):$(shell id -g) android-lab

android-lab: ## Build the throwaway Android test app (drive-agent/android-lab): Kotlin unit tests, then dist/repas-android-lab.apk with its SHA-256
	@$(ANDROID_RUN) ./build.sh apk

android-lab-test: ## Run only the Kotlin unit tests of the throwaway Android test app
	@$(ANDROID_RUN) ./build.sh test

android-lab-hash: ## Note the SHA-384 of drive-agent/lab/published/lab.js in drive-agent/android-lab/lab.js.sha384 (after a deliberate change of the lab)
	@$(RUN) npm run --silent lab:android-hash -- --write

## —— Android emulator 🤖 ————————————————————————————————————————————————————
.PHONY: android-emulator-up android-emulator-down android-emulator-status android-smoke

# L'émulateur Android de test (DRV-319, android/emulator/) : sans fenêtre, accéléré par KVM (/dev/kvm), SDK et AVD dans le volume Docker
# `android-emulator-sdk` (téléchargés une seule fois). Cibles manuelles : la CI n'a pas KVM, `make check` n'y touche pas. Mode d'emploi : android/README.md.
ANDROID_EMULATOR_CTL = DOCKER_COMPOSE="$(DOCKER_COMPOSE)" ./android/emulator/ctl.sh

android-emulator-up: ## Start the Android test emulator (needs /dev/kvm) and wait until it has booted; the first run downloads the SDK (about 2 GB)
	@$(ANDROID_EMULATOR_CTL) up

android-emulator-down: ## Stop the Android test emulator (the SDK and the AVD stay in their Docker volume)
	@$(ANDROID_EMULATOR_CTL) down

android-emulator-status: ## Say whether KVM, the SDK volume and the emulator are ready (exit code 0 only when it has booted)
	@$(ANDROID_EMULATOR_CTL) status

android-smoke: ## Smoke test: build the debug APK aimed at the local fake Repas, start the emulator if needed, play the shell and drive scenario; report and screenshots in android/dist/smoke/
	@ANDROID_REPAS_ORIGIN=https://repas.test/ ANDROID_APK_NAME=repas-drive-smoke.apk $(MAKE) --no-print-directory android
	@$(MAKE) --no-print-directory android-emulator-up
	@DOCKER_COMPOSE="$(DOCKER_COMPOSE)" ./android/emulator/smoke.sh

## —— Production image 📦 ————————————————————————————————————————————————————
.PHONY: prod prod-stop

prod: ## Build and start the production image (Caddy: static files + relay to the back) on http://localhost:8081
	@$(BACK_CHECK)
	@$(DOCKER_COMPOSE) --profile prod up -d --build --wait prod
	@echo "📦 Production-like : http://localhost:$(PROD_PORT)"

prod-stop: ## Stop the production image
	@$(DOCKER_COMPOSE) --profile prod stop prod

## —— Helper 🛠️ ——————————————————————————————————————————————————————————————
.PHONY: sh npm help remove-obsolete-branch

sh: ## Open a shell in the front container
	@$(DOCKER_COMPOSE) run --rm --no-deps front sh

npm: ## Run any npm command: make npm c="run lint"
	@$(RUN) npm $(c)

remove-obsolete-branch: ## Remove local branches that have been deleted from the remote repository
	@echo "🔍 Fetching and pruning remote branches..."
	@git fetch --prune
	@branches=$$(git branch -vv | grep ': gone]' | awk '{print $$1}'); \
	if [ -z "$$branches" ]; then \
		echo "✨ No obsolete branches to remove"; \
	else \
		echo "🗑️  Removing obsolete branches:"; \
		echo "$$branches"; \
		echo "$$branches" | xargs git branch -D; \
		echo "✅ Cleanup completed!"; \
	fi

help: ## Outputs this help screen
	@grep -E '(^[a-zA-Z0-9_-]+:.*?##.*$$)|(^##)' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}{printf "\033[32m%-30s\033[0m %s\n", $$1, $$2}' | sed -e 's/\[32m##/[33m/'

# Le back doit tourner pour ce qui le contacte (start, e2e, fixtures, prod).
define BACK_CHECK
test -n "$(BACK_PHP)" || { echo "❌ Back introuvable (réseau Docker '$(BACK_NETWORK)') : lance 'docker compose up -d' dans le dépôt repas."; exit 1; }
endef

# Alias des anciens noms
.PHONY: up down
up: start
down: stop

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

quality: check audit api-verify ## Run everything the CI runs except the browsers

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
.PHONY: lab

lab: ## Build the throwaway drive test bookmarklet (drive-agent/lab) into drive-agent/lab/dist/lab-bookmarklet.txt and print its size
	@$(RUN) npm run --silent lab:build

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

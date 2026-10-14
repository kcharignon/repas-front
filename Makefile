# Le front tourne dans Docker : aucune installation de Node n'est nécessaire sur le poste.
# Le back de développement (dépôt `repas`, `docker compose up -d`) doit tourner : le front rejoint son réseau.
COMPOSE ?= docker compose
RUN := $(COMPOSE) run --rm --no-deps front

.DEFAULT_GOAL := help
.PHONY: help up down logs shell check test e2e e2e-visual e2e-report prod api-update build

help: ## Liste les commandes
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-12s %s\n", $$1, $$2}'

up: ## Démarre le front (http://localhost:5173) branché sur le back
	$(COMPOSE) up -d --build front
	@echo "Front : http://localhost:$${FRONT_PORT:-5173}  (logs : make logs)"

down: ## Arrête le front et les services annexes
	$(COMPOSE) --profile e2e --profile report --profile prod down

logs: ## Suit les logs du front
	$(COMPOSE) logs -f front

shell: ## Ouvre un shell dans le conteneur
	$(COMPOSE) run --rm --no-deps front sh

check: ## Lint, format, types, tests (avant chaque commit)
	$(RUN) npm run check

test: ## Tests unitaires avec couverture
	$(RUN) npm run test:coverage

e2e: ## Tests de bout en bout (Chromium) contre le front et le vrai back
	$(COMPOSE) --profile e2e run --rm e2e

e2e-visual: ## Comme e2e, avec captures et vidéos de chaque test, puis rapport sur http://localhost:9323
	E2E_VISUAL=1 $(COMPOSE) --profile e2e run --rm e2e || true
	@echo "Rapport : http://localhost:9323  (Ctrl-C pour quitter)"
	$(COMPOSE) --profile report run --rm --service-ports e2e-report

e2e-report: ## Ouvre le dernier rapport Playwright (http://localhost:9323)
	$(COMPOSE) --profile report run --rm --service-ports e2e-report

prod: ## Image de production sur http://localhost:8081 (statique + relais vers le back)
	$(COMPOSE) --profile prod up -d --build prod
	@echo "Production-like : http://localhost:$${PROD_PORT:-8081}"

api-update: ## Fige le contrat de l'API sur le dernier commit du back et régénère les types
	$(RUN) npm run api:update

build: ## Reconstruit l'image de développement
	$(COMPOSE) build front

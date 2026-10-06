.DEFAULT_GOAL := help

COMPOSE = docker compose --env-file .env -f infra/docker-compose.yml

.PHONY: help
help: ## Muestra los comandos disponibles
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-22s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Instala dependencias de desarrollo
	uv sync --group dev

.PHONY: dev
dev: ## Servidor local con auto-reload
	uv run litestar run --app server:app --reload --host 0.0.0.0 --port 8000

.PHONY: typecheck
typecheck: ## Ejecuta ty
	uv run ty check

.PHONY: up
up: ## Levanta el stack local
	$(COMPOSE) up -d

.PHONY: down
down: ## Para los contenedores
	$(COMPOSE) down

.PHONY: build
build: ## Construye la imagen Docker
	$(COMPOSE) build app

.PHONY: logs
logs: ## Streaming de logs
	$(COMPOSE) logs -f

.PHONY: logs-app
logs-app: ## Streaming de logs de la app
	$(COMPOSE) logs -f app

.PHONY: ps
ps: ## Estado de los contenedores
	$(COMPOSE) ps

.PHONY: clean
clean: ## Para contenedores y elimina volumenes
	$(COMPOSE) down -v --remove-orphans

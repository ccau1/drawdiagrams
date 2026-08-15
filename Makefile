# Drawboard — common tasks (dev-first: hot reload via air + vite).
#   make up       start the hot-reload stack (db + air server + vite dev web)
#   make down     stop and remove containers (keeps postgres volume)
#   make down-v   also remove the database volume (data loss!)
#   make logs     follow logs
#   make images   build production images & print their names for publishing

COMPOSE ?= docker compose
FILES = -f docker-compose.yaml -f docker-compose.dev.yaml

.PHONY: up down down-v logs ps images build

up:
	$(COMPOSE) $(FILES) up -d
	@echo "Drawboard (hot reload) at http://localhost:$${WEB_PORT:-8080}"

down:
	$(COMPOSE) $(FILES) down

down-v:
	$(COMPOSE) $(FILES) down -v

logs:
	$(COMPOSE) $(FILES) logs -f

ps:
	$(COMPOSE) $(FILES) ps

# Production images (no hot reload) — only for publishing.
build images:
	$(COMPOSE) build
	@echo "server: $${SERVER_IMAGE:-drawboard/server}:$${SERVER_TAG:-latest}"
	@echo "web:    $${WEB_IMAGE:-drawboard/web}:$${WEB_TAG:-latest}"

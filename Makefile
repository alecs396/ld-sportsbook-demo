# Kickoff Sportsbook, a LaunchDarkly demo. Run `make` to list commands.
.DEFAULT_GOAL := help

# Scripts and simulators run with local Node when it's installed. Without Node
# (or with DOCKER=1) they run inside the app image, so Docker is all you need.
# In Docker the app is reachable at http://app:3000 on the compose network, and
# overrides like SIM_BETTORS=10 are passed through from your shell.
ifeq ($(or $(DOCKER),$(if $(shell command -v node 2>/dev/null),,missing)),)
RUN_NODE = node --env-file-if-exists=.env
else
RUN_NODE = docker compose run --rm --no-deps -v "$(CURDIR)/.env:/app/.env" -e SIM_BASE_URL=http://app:3000 \
	-e LD_PROJECT_KEY -e LD_ENVIRONMENT -e SIM_BETTORS -e SIM_FIRST_BETTOR -e SIM_CHATS app node
endif
.PHONY: help install check-env dev build up down logs fire-trigger simulate simulate-outage simulate-bets simulate-chat doctor demo-reset bootstrap

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install all npm dependencies (client and server)
	npm install

check-env:
	@test -f .env || { echo "Missing .env. Run: cp .env.example .env, then fill in your keys."; exit 1; }

dev: check-env ## Run server and client with hot reload (Ctrl+C stops both)
	@echo "App: http://localhost:5173  (API on :3000)"
	@trap 'kill 0' INT TERM; \
	npm run dev:server & \
	npm run dev:client & \
	wait

build: ## Build the React app into client/dist
	npm run build

up: check-env ## Build and start the app in Docker (http://localhost:3000)
	docker compose up --build -d
	@echo "App: http://localhost:3000  (make logs to follow, make down to stop)"

down: ## Stop and remove the Docker containers
	docker compose down

logs: ## Follow the app container logs
	docker compose logs -f

fire-trigger: check-env ## Turn off live-betting with its LaunchDarkly trigger (remediation)
	@url=$$(grep '^LD_TRIGGER_URL=' .env | cut -d= -f2-); \
	if [ -z "$$url" ] || [ "$$url" = "paste-your-trigger-url-here" ]; then \
		echo "LD_TRIGGER_URL is not set in .env (see .env.example)"; exit 1; \
	fi; \
	code=$$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
		-d '{"eventName":"Manual remediation via make fire-trigger"}' "$$url"); \
	if [ "$$code" -ge 200 ] && [ "$$code" -lt 300 ]; then \
		echo "Trigger fired (HTTP $$code): live-betting targeting is now off."; \
	else \
		echo "Trigger failed (HTTP $$code). Check LD_TRIGGER_URL in .env."; exit 1; \
	fi

simulate: check-env ## Send fake bettor traffic to the running app (Ctrl+C stops)
	$(RUN_NODE) simulator/index.js

simulate-outage: check-env ## Same, with the live odds bug on; auto-fires the trigger
	$(RUN_NODE) simulator/index.js --outage

simulate-bets: check-env ## Experiment traffic: 500 simulated bettors see a slip, some place bets
	$(RUN_NODE) simulator/bets.js

simulate-chat: check-env ## Bet assistant traffic: 20 simulated chats with thumbs up/down (calls Claude, ~$0.03)
	$(RUN_NODE) simulator/chat.js

doctor: check-env ## Pre-flight check: env vars, LaunchDarkly access, resources, demo starting state
	$(RUN_NODE) scripts/doctor.js

demo-reset: check-env ## Restore the demo's starting state in LaunchDarkly (safe to run repeatedly)
	$(RUN_NODE) scripts/demo-reset.js

bootstrap: ## Create all LaunchDarkly resources in LD_PROJECT_KEY (needs only LD_API_TOKEN; safe to rerun)
	@test -f .env || cp .env.example .env
	$(RUN_NODE) scripts/bootstrap.js

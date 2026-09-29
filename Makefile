# Kickoff Sportsbook, a LaunchDarkly demo. Run `make` to list commands.
.DEFAULT_GOAL := help
.PHONY: help install check-env dev build up down logs fire-trigger simulate simulate-outage simulate-bets simulate-chat doctor

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
	node --env-file-if-exists=.env simulator/index.js

simulate-outage: check-env ## Same, with the live odds bug on; auto-fires the trigger
	node --env-file-if-exists=.env simulator/index.js --outage

simulate-bets: check-env ## Experiment traffic: 500 simulated bettors see a slip, some place bets
	node --env-file-if-exists=.env simulator/bets.js

simulate-chat: check-env ## Bet assistant traffic: 20 simulated chats with thumbs up/down (calls Claude, ~$0.03)
	node --env-file-if-exists=.env simulator/chat.js

doctor: check-env ## Pre-flight check: env vars, LaunchDarkly access, resources, demo starting state
	node --env-file-if-exists=.env scripts/doctor.js

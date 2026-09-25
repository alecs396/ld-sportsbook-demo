# Kickoff Sportsbook, a LaunchDarkly demo. Run `make` to list commands.
.DEFAULT_GOAL := help
.PHONY: help install check-env dev build

help: ## List available commands
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

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

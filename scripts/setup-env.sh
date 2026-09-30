#!/bin/sh
# Asks for your keys in the terminal (input hidden) and saves them to .env,
# so you never have to open .env or leave a key in your shell history.
# Run with `make setup`, which then runs `make bootstrap`.
set -e

ENV_FILE=.env
[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"

# Current value of a variable in .env (empty if missing).
current() {
  sed -n "s/^$1=//p" "$ENV_FILE" | head -n 1
}

# Replaces (or adds) NAME=value in .env without printing the value.
save() {
  awk -v name="$1" -v value="$2" '
    BEGIN { done = 0 }
    index($0, name "=") == 1 { print name "=" value; done = 1; next }
    { print }
    END { if (!done) print name "=" value }
  ' "$ENV_FILE" > "$ENV_FILE.tmp" && mv "$ENV_FILE.tmp" "$ENV_FILE"
}

# Reads a line without echoing it (when there's a terminal), restoring the
# terminal even on Ctrl+C.
read_hidden() {
  value=""
  if [ -t 0 ]; then
    trap 'stty echo; exit 1' INT
    stty -echo
  fi
  read -r value || true
  if [ -t 0 ]; then
    stty echo
    trap - INT
  fi
  echo
}

echo "LaunchDarkly API access token (Writer role). Paste it and press Enter; input is hidden."
existing=$(current LD_API_TOKEN)
case "$existing" in
  api-your-api-token-here|"") ;;
  *) echo "(A token is already saved. Press Enter to keep it.)" ;;
esac
printf "LD_API_TOKEN: "
read_hidden
if [ -n "$value" ]; then
  case "$value" in
    api-*) save LD_API_TOKEN "$value"; echo "Saved LD_API_TOKEN to .env." ;;
    *) echo "That doesn't look like an API access token (they start with api-). Nothing saved."; exit 1 ;;
  esac
elif [ -z "$existing" ] || [ "$existing" = "api-your-api-token-here" ]; then
  echo "An API token is required. Create one in LaunchDarkly (see README, step 2)."
  exit 1
fi

echo
echo "Optional: Anthropic API key for the bet assistant. Press Enter to skip."
printf "ANTHROPIC_API_KEY: "
read_hidden
if [ -n "$value" ]; then
  save ANTHROPIC_API_KEY "$value"
  echo "Saved ANTHROPIC_API_KEY to .env."
fi

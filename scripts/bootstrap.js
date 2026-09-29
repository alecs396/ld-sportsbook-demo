// Creates everything the demo needs in LaunchDarkly, for a reviewer starting
// from an empty account: project, flags, metric, AgentControl config, trigger,
// then the demo's starting targeting (same code as make demo-reset).
// Only needs LD_API_TOKEN. Skips anything that already exists, so it's safe to rerun.
// Run with `make bootstrap`.
import fs from "node:fs";
import { api, ENVIRONMENT, PROJECT, RESOURCES } from "./lib/ld.js";
import { resetDemo } from "./demo-reset.js";

const COMMENT = "make bootstrap: create demo resources";
const ENV_FILE = ".env";
let errors = 0;

// Creates a resource unless it already exists (409 conflict = already there).
async function create(label, path, body) {
  const res = await api(path, { method: "POST", body });
  if (res.ok) {
    console.log(`  ✓ Created ${label}`);
  } else if (res.status === 409) {
    console.log(`  - ${label} already exists`);
  } else {
    errors += 1;
    console.log(`  ✗ Could not create ${label} (HTTP ${res.status}): ${res.body?.message ?? ""}`);
  }
  return res;
}

async function ensureProject() {
  console.log("\nProject");
  const existing = await api(`/projects/${PROJECT}`);
  if (existing.ok) return console.log(`  - Project "${PROJECT}" already exists`);
  await create(`project "${PROJECT}" (with Production and Test environments)`, "/projects", {
    key: PROJECT,
    name: PROJECT,
  });
}

const booleanFlag = (key, name, description, onName, offName) => ({
  key,
  name,
  description,
  temporary: true,
  variations: [
    { value: true, name: onName },
    { value: false, name: offName },
  ],
  defaults: { onVariation: 1, offVariation: 1 }, // both serve false: ship dark
  clientSideAvailability: { usingEnvironmentId: true, usingMobileKey: false },
});

async function ensureFlags() {
  console.log("\nFlags");
  await create('flag "live-betting"', `/flags/${PROJECT}`,
    booleanFlag("live-betting", "Live betting", "Live in-game betting panel. Release flag for the Super Bowl launch.", "Available", "Unavailable"));
  await create('flag "new-bet-slip"', `/flags/${PROJECT}`,
    booleanFlag("new-bet-slip", "New bet slip", "Redesigned bet slip with quick stakes and a payout preview. Targeted by state for Part 2 and measured against bet-placed in an experiment.", "New slip", "Classic slip"));
}

async function ensureMetric() {
  console.log("\nMetric");
  await create(`metric "${RESOURCES.metric}"`, `/metrics/${PROJECT}`, {
    key: RESOURCES.metric,
    name: "Bet placed",
    description: "Share of bettors who place at least one bet.",
    kind: "custom",
    eventKey: RESOURCES.metric,
    isNumeric: false,
    successCriteria: "HigherThanBaseline",
    randomizationUnits: ["user"],
  });
}

const GUARDRAIL =
  "Never say whether betting is legal in a specific state or place. Say that availability depends on state law and point the bettor to their state's gaming regulator.";
const MODEL = "Anthropic.claude-haiku-4-5-20251001";

const variation = (key, name, prompt) => ({
  key,
  name,
  modelConfigKey: MODEL,
  model: { modelName: MODEL, parameters: { max_tokens: 300 } },
  messages: [{ role: "system", content: `${prompt}\n\n${GUARDRAIL}` }],
});

async function ensureAiConfig() {
  console.log("\nAgentControl config");
  const key = RESOURCES.aiConfig;
  // Check first: creating an existing config returns a 400, not a 409.
  const existing = await api(`/projects/${PROJECT}/ai-configs/${key}`);
  if (existing.ok) {
    console.log(`  - config "${key}" already exists`);
  } else {
    await create(`config "${key}"`, `/projects/${PROJECT}/ai-configs`, {
      key,
      name: "Bet assistant",
      mode: "completion",
    });
  }
  await create('variation "Concise explainer"', `/projects/${PROJECT}/ai-configs/${key}/variations`,
    variation("concise-explainer", "Concise explainer",
      "You are the Kickoff Sportsbook bet assistant. Answer questions about odds, bet types, and payouts in 2 to 3 short sentences, in plain language. Use a concrete American-odds example when it helps. The bettor is in {{ ldctx.state }}. Never give picks or guarantee outcomes. If someone seems to be chasing losses, suggest setting a deposit limit."));
  await create('variation "Friendly coach"', `/projects/${PROJECT}/ai-configs/${key}/variations`,
    variation("friendly-coach", "Friendly coach",
      "You are Kickoff Sportsbook's friendly betting coach. Explain odds, bet types, and payouts warmly, as if talking to someone new to sports betting. Keep it under 120 words and end with one practical tip. The bettor is in {{ ldctx.state }}. Never give picks or guarantee outcomes, and remind people to bet responsibly."));
}

// The trigger URL is shown only once, at creation. Save it to .env instead of
// printing it, and never overwrite an existing LD_TRIGGER_URL.
function saveTriggerUrl(url) {
  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const existing = /^LD_TRIGGER_URL=(.+)$/m.exec(current)?.[1]?.trim();
  if (existing && existing !== "paste-your-trigger-url-here") {
    console.log("  ! LD_TRIGGER_URL is already set in .env, so the new URL was not saved.");
    console.log("    To use this trigger, reset its URL in the LaunchDarkly UI and paste it into .env.");
    return;
  }
  const updated = /^LD_TRIGGER_URL=.*$/m.test(current)
    ? current.replace(/^LD_TRIGGER_URL=.*$/m, `LD_TRIGGER_URL=${url}`)
    : `${current.trimEnd()}\nLD_TRIGGER_URL=${url}\n`;
  fs.writeFileSync(ENV_FILE, updated);
  console.log("  ✓ Saved the trigger URL to LD_TRIGGER_URL in .env (not printed: it's a secret)");
}

async function ensureTrigger() {
  console.log("\nTrigger");
  const path = `/flags/${PROJECT}/${RESOURCES.triggerFlag}/triggers/${ENVIRONMENT}`;
  const existing = await api(path);
  const hasOffTrigger = existing.body?.items?.some((t) => t.instructions?.some((i) => i.kind === "turnFlagOff"));
  if (hasOffTrigger) return console.log(`  - A turn-off trigger on "${RESOURCES.triggerFlag}" already exists`);

  const res = await create(`turn-off trigger on "${RESOURCES.triggerFlag}"`, path, {
    integrationKey: "generic-trigger",
    comment: COMMENT,
    instructions: [{ kind: "turnFlagOff" }],
  });
  if (res.ok && res.body?.triggerURL) saveTriggerUrl(res.body.triggerURL);
}

function nextSteps() {
  console.log(`
Next steps (manual):
  1. Copy the SDK key and client-side ID for "${ENVIRONMENT}" into .env:
     LaunchDarkly > gear icon > Organization settings > SDK keys > "${PROJECT}" / "${ENVIRONMENT}".
  2. Optional: ANTHROPIC_API_KEY in .env for the bet assistant.
  3. If the "bet-assistant" config's targeting is off, turn it on in the UI.
  4. Optional: create the "New bet slip vs classic" experiment on the
     "Legal live-betting states" rule of new-bet-slip (see README).
  5. Run make doctor.`);
}

async function main() {
  if (!process.env.LD_API_TOKEN) {
    console.error("LD_API_TOKEN is not set (see .env.example). It's the only key bootstrap needs.");
    process.exit(1);
  }
  console.log(`Bootstrapping "${PROJECT}" / "${ENVIRONMENT}"`);
  await ensureProject();
  await ensureFlags();
  await ensureMetric();
  await ensureAiConfig();
  await ensureTrigger();

  console.log("\nStarting targeting");
  errors += await resetDemo();

  nextSteps();
  if (errors) {
    console.log(`\n${errors} error(s) above.`);
    process.exit(1);
  }
}

main();

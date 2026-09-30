// Creates everything the demo needs in LaunchDarkly, for a reviewer starting
// from an empty account: project, flags, metric, AgentControl config, trigger,
// then the demo's starting targeting (same code as make demo-reset) and the
// new-bet-slip experiment design (not started). It also
// fills in LD_SDK_KEY, LD_CLIENT_SIDE_ID, and LD_TRIGGER_URL in .env.
// Only needs LD_API_TOKEN. Skips anything that already exists, so it's safe to rerun.
// Run with `make bootstrap`.
import fs from "node:fs";
import { api, ENVIRONMENT, PROJECT, RESOURCES, variationId } from "./lib/ld.js";
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

// Placeholder values from .env.example count as "not set".
const PLACEHOLDERS = {
  LD_SDK_KEY: "sdk-your-sdk-key-here",
  LD_CLIENT_SIDE_ID: "your-client-side-id-here",
  LD_TRIGGER_URL: "paste-your-trigger-url-here",
};

// Writes NAME=value into .env if NAME is missing or still a placeholder.
// Never overwrites a real value and never prints one (these are secrets).
// Returns "saved", "same", or "kept" (a different value was already set).
function saveEnvValue(name, value) {
  const current = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8") : "";
  const pattern = new RegExp(`^${name}=(.*)$`, "m");
  const existing = pattern.exec(current)?.[1]?.trim();
  if (existing && existing !== PLACEHOLDERS[name]) return existing === value ? "same" : "kept";

  const updated = pattern.test(current)
    ? current.replace(pattern, `${name}=${value}`)
    : `${current.trimEnd()}\n${name}=${value}\n`;
  fs.writeFileSync(ENV_FILE, updated);
  return "saved";
}

// The SDK key and client-side ID come from the environment, so the reviewer
// only has to paste LD_API_TOKEN.
async function ensureSdkKeys() {
  console.log("\nSDK keys");
  const env = await api(`/projects/${PROJECT}/environments/${ENVIRONMENT}`);
  if (!env.ok) {
    errors += 1;
    return console.log(`  ✗ Could not read environment "${ENVIRONMENT}" (HTTP ${env.status})`);
  }
  const keys = [
    ["LD_SDK_KEY", env.body.apiKey, "SDK key"],
    ["LD_CLIENT_SIDE_ID", env.body._id, "client-side ID"],
  ];
  for (const [name, value, label] of keys) {
    const result = saveEnvValue(name, value);
    if (result === "saved") console.log(`  ✓ Saved the ${label} to ${name} in .env (not printed)`);
    if (result === "same") console.log(`  - ${name} in .env already matches "${ENVIRONMENT}"`);
    if (result === "kept") console.log(`  ! ${name} in .env is set to a different value and was left alone (run make doctor)`);
  }
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
  // The trigger URL is only returned at creation, so save it now.
  if (res.ok && res.body?.triggerURL) {
    if (saveEnvValue("LD_TRIGGER_URL", res.body.triggerURL) === "saved") {
      console.log("  ✓ Saved the trigger URL to LD_TRIGGER_URL in .env (not printed: it's a secret)");
    } else {
      console.log("  ! LD_TRIGGER_URL was already set in .env, so the new URL was not saved.");
      console.log("    To use this trigger, reset its URL in the LaunchDarkly UI and paste it into .env.");
    }
  }
}

// The experiment on new-bet-slip's state rule, created but not started, so
// starting it stays a demo moment. Runs after targeting so the rule exists.
async function ensureExperiment() {
  console.log("\nExperiment");
  const path = `/projects/${PROJECT}/environments/${ENVIRONMENT}/experiments`;
  const existing = await api(`${path}/${RESOURCES.experiment}`);
  if (existing.ok) return console.log(`  - experiment "${RESOURCES.experiment}" already exists`);

  const flagRes = await api(`/flags/${PROJECT}/new-bet-slip?env=${ENVIRONMENT}`);
  const env = flagRes.body?.environments?.[ENVIRONMENT];
  const rule = env?.rules?.find((r) => r.description === RESOURCES.legalStatesRule);
  if (!rule) {
    errors += 1;
    return console.log(`  ✗ Could not find the "${RESOURCES.legalStatesRule}" rule on new-bet-slip`);
  }
  const flag = flagRes.body;
  const hypothesis = "Quick stakes and a payout preview will increase the share of bettors who place a bet.";
  await create(`experiment "${RESOURCES.experiment}" (not started)`, path, {
    key: RESOURCES.experiment,
    name: "New bet slip vs classic",
    description: hypothesis,
    iteration: {
      hypothesis,
      randomizationUnit: "user",
      primarySingleMetricKey: RESOURCES.metric,
      metrics: [{ key: RESOURCES.metric }],
      treatments: [
        { name: "Classic slip", baseline: true, allocationPercent: "50", parameters: [{ flagKey: "new-bet-slip", variationId: variationId(flag, false) }] },
        { name: "New slip", baseline: false, allocationPercent: "50", parameters: [{ flagKey: "new-bet-slip", variationId: variationId(flag, true) }] },
      ],
      flags: { "new-bet-slip": { ruleId: rule._id, flagConfigVersion: env.version ?? flag._version } },
    },
  });
}

function nextSteps() {
  console.log(`
Next steps:
  1. Optional: ANTHROPIC_API_KEY in .env for the bet assistant.
  2. If the "bet-assistant" config's targeting is off, turn it on in the UI.
  3. Run make doctor, then make up.
  4. For the experiment: start "New bet slip vs classic" in LaunchDarkly,
     then run make simulate-bets (see README).`);
}

async function main() {
  if (!process.env.LD_API_TOKEN) {
    console.error("LD_API_TOKEN is not set (see .env.example). It's the only key bootstrap needs.");
    process.exit(1);
  }
  console.log(`Bootstrapping "${PROJECT}" / "${ENVIRONMENT}"`);
  await ensureProject();
  await ensureSdkKeys();
  await ensureFlags();
  await ensureMetric();
  await ensureAiConfig();
  await ensureTrigger();

  console.log("\nStarting targeting");
  errors += await resetDemo();
  await ensureExperiment();

  nextSteps();
  if (errors) {
    console.log(`\n${errors} error(s) above.`);
    process.exit(1);
  }
}

main();

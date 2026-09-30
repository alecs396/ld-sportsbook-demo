// Pre-flight check before a rehearsal or the demo: env vars, LaunchDarkly
// access, SDK init, every resource the demo needs, and the demo's starting
// state. Read-only. Run with `make doctor`. Exits 1 if anything fails.
import { init } from "@launchdarkly/node-server-sdk";
import { api, ENVIRONMENT, PROJECT, RESOURCES, variationValue } from "./lib/ld.js";

let failures = 0;
let warnings = 0;

const pass = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => {
  warnings += 1;
  console.log(`  ! ${msg}`);
};
const fail = (msg) => {
  failures += 1;
  console.log(`  ✗ ${msg}`);
};
const section = (title) => console.log(`\n${title}`);

function checkEnv() {
  section("Environment variables");
  for (const name of ["LD_SDK_KEY", "LD_CLIENT_SIDE_ID", "LD_API_TOKEN"]) {
    process.env[name] ? pass(`${name} is set`) : fail(`${name} is missing (see .env.example)`);
  }
  process.env.LD_TRIGGER_URL
    ? pass("LD_TRIGGER_URL is set")
    : warn("LD_TRIGGER_URL is missing: make fire-trigger and automatic remediation won't work");
  process.env.ANTHROPIC_API_KEY
    ? pass("ANTHROPIC_API_KEY is set")
    : warn("ANTHROPIC_API_KEY is missing: the bet assistant will say it isn't set up");
  pass(`Project "${PROJECT}", environment "${ENVIRONMENT}"`);
}

async function checkAccess() {
  section("LaunchDarkly access");
  const project = await api(`/projects/${PROJECT}`);
  if (project.status === 401) return fail("LD_API_TOKEN was rejected (401). Check or recreate the token.");
  if (project.status === 404) return fail(`Project "${PROJECT}" not found. Set LD_PROJECT_KEY or run bootstrap.`);
  if (!project.ok) return fail(`Could not reach the LaunchDarkly API (HTTP ${project.status})`);
  pass("API token works and the project exists");

  const env = await api(`/projects/${PROJECT}/environments/${ENVIRONMENT}`);
  if (!env.ok) return fail(`Environment "${ENVIRONMENT}" not found (HTTP ${env.status})`);
  env.body.apiKey === process.env.LD_SDK_KEY
    ? pass(`LD_SDK_KEY belongs to "${ENVIRONMENT}"`)
    : fail(`LD_SDK_KEY is not the SDK key for "${ENVIRONMENT}" (wrong environment or project?)`);
  env.body._id === process.env.LD_CLIENT_SIDE_ID
    ? pass(`LD_CLIENT_SIDE_ID belongs to "${ENVIRONMENT}"`)
    : fail(`LD_CLIENT_SIDE_ID is not the client-side ID for "${ENVIRONMENT}"`);
}

async function checkSdk() {
  section("Server SDK");
  if (!process.env.LD_SDK_KEY) return fail("Skipped: no LD_SDK_KEY");
  const quiet = { debug() {}, info() {}, warn() {}, error() {} };
  const client = init(process.env.LD_SDK_KEY, { logger: quiet, sendEvents: false });
  try {
    await client.waitForInitialization({ timeout: 10 });
    pass("SDK initialized and received flag rules");
  } catch (err) {
    fail(`SDK did not initialize: ${err.message}`);
  } finally {
    client.close();
  }
}

async function checkResources() {
  section("Resources");
  const flags = {};
  for (const key of RESOURCES.flags) {
    const flag = await api(`/flags/${PROJECT}/${key}?env=${ENVIRONMENT}`);
    if (!flag.ok) {
      fail(`Flag "${key}" not found (run bootstrap, or create it per the README)`);
      continue;
    }
    flags[key] = flag.body;
    flag.body.clientSideAvailability?.usingEnvironmentId
      ? pass(`Flag "${key}" exists and is available to client-side SDKs`)
      : fail(`Flag "${key}" exists but is NOT available to client-side SDKs (the React app gets the fallback)`);
  }

  const metric = await api(`/metrics/${PROJECT}/${RESOURCES.metric}`);
  metric.ok ? pass(`Metric "${RESOURCES.metric}" exists`) : fail(`Metric "${RESOURCES.metric}" not found`);

  const aiConfig = await api(`/projects/${PROJECT}/ai-configs/${RESOURCES.aiConfig}`);
  aiConfig.ok
    ? pass(`AgentControl config "${RESOURCES.aiConfig}" exists`)
    : warn(`AgentControl config "${RESOURCES.aiConfig}" not found: the bet assistant will be unavailable`);

  const experiment = await api(`/projects/${PROJECT}/environments/${ENVIRONMENT}/experiments/${RESOURCES.experiment}`);
  if (!experiment.ok) {
    warn(`Experiment "${RESOURCES.experiment}" not found (run make bootstrap to create it)`);
  } else if (experiment.body?.currentIteration?.status === "running") {
    warn(`Experiment "${RESOURCES.experiment}" is running: NJ and NV are split 50/50 until you stop it, which changes the Part 2 demo`);
  } else {
    pass(`Experiment "${RESOURCES.experiment}" exists and isn't running`);
  }

  const triggers = await api(`/flags/${PROJECT}/${RESOURCES.triggerFlag}/triggers/${ENVIRONMENT}`);
  const offTrigger = triggers.body?.items?.find(
    (t) => t.enabled && t.instructions?.some((i) => i.kind === "turnFlagOff"),
  );
  offTrigger
    ? pass(`An enabled "turn off" trigger exists on "${RESOURCES.triggerFlag}"`)
    : warn(`No enabled "turn off" trigger on "${RESOURCES.triggerFlag}" (needed for remediation)`);

  return flags;
}

function checkDemoState(flags) {
  section(`Demo starting state (run make demo-reset to fix)`);
  const live = flags["live-betting"]?.environments?.[ENVIRONMENT];
  if (live) {
    const flag = flags["live-betting"];
    live.on ? warn('"live-betting" targeting is ON (should start off)') : pass('"live-betting" targeting is off');
    variationValue(flag, live.fallthrough?.variation) === false
      ? pass('"live-betting" default rule serves false')
      : warn('"live-betting" default rule does not serve false');
    const qaTrue = live.targets?.some(
      (t) => variationValue(flag, t.variation) === true && t.values.includes(RESOURCES.qaTester),
    );
    qaTrue ? pass(`"${RESOURCES.qaTester}" is targeted to true on "live-betting"`) : warn(`"${RESOURCES.qaTester}" is not targeted to true on "live-betting"`);
  }

  const slip = flags["new-bet-slip"]?.environments?.[ENVIRONMENT];
  if (slip) {
    const flag = flags["new-bet-slip"];
    slip.on ? pass('"new-bet-slip" targeting is on') : warn('"new-bet-slip" targeting is off (Part 2 needs it on)');
    const stateRule = slip.rules?.some(
      (r) =>
        variationValue(flag, r.variation) === true &&
        r.clauses?.some((c) => c.attribute === "state" && RESOURCES.legalStates.every((s) => c.values.includes(s))),
    );
    stateRule
      ? pass(`"new-bet-slip" has the state rule (${RESOURCES.legalStates.join(", ")} get the new slip)`)
      : warn(`"new-bet-slip" is missing the state rule for ${RESOURCES.legalStates.join(", ")}`);
  }
}

async function checkApp() {
  section("App");
  const url = process.env.SIM_BASE_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${url}/healthz`);
    const health = await res.json();
    health.launchdarkly?.initialized
      ? pass(`App is running at ${url} and its SDK is initialized`)
      : warn(`App is running at ${url} but its SDK is not initialized`);
  } catch {
    warn(`App is not running at ${url} (start it with make up or make dev)`);
  }
}

async function main() {
  console.log("LaunchDarkly demo doctor");
  checkEnv();
  if (process.env.LD_API_TOKEN) {
    await checkAccess();
    const flags = await checkResources();
    checkDemoState(flags);
  }
  await checkSdk();
  await checkApp();

  console.log(`\n${failures} failed, ${warnings} warnings.`);
  if (failures > 0) process.exit(1);
}

main();

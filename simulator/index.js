// Traffic simulator: fake bettors call the live betting API, and the script
// plays the monitoring tool that fires the LaunchDarkly trigger when the
// error rate spikes. Run with `make simulate` or `make simulate-outage`.
import { personas } from "../server/personas.js";

const BASE_URL = process.env.SIM_BASE_URL || "http://localhost:3000";
const TRIGGER_URL = process.env.LD_TRIGGER_URL;
const OUTAGE = process.argv.includes("--outage");

const REQUESTS_PER_SECOND = 5;
const WINDOW_SIZE = 50; // error rate is measured over the last 50 live responses
const MIN_SAMPLES = 20; // don't judge the error rate on too few requests
const ERROR_THRESHOLD = 0.2; // 20%

const personaKeys = Object.keys(personas);
const counts = { 200: 0, 403: 0, 500: 0, unreachable: 0 };
const recent = []; // true = error, for responses from the live betting code path
let triggerFired = false;
const startedAt = Date.now();

// Only 200s and 500s come from the live betting code path. A 403 means live
// betting isn't released to that bettor, which is expected, not an error.
function liveErrorRate() {
  if (recent.length === 0) return 0;
  return recent.filter(Boolean).length / recent.length;
}

// Remediation, like a monitoring alert with a webhook: once there are enough
// samples and the error rate crosses the threshold, fire the LaunchDarkly
// trigger once. Claiming it before the request stops a double fire.
async function maybeFireTrigger(errorRate, sampleCount) {
  if (triggerFired) return;
  if (sampleCount < MIN_SAMPLES) return;
  if (errorRate < ERROR_THRESHOLD) return;

  triggerFired = true;

  if (!TRIGGER_URL) {
    console.warn("\nError rate is high but LD_TRIGGER_URL is not set, so nothing was fired.");
    return;
  }

  const percent = Math.round(errorRate * 100);
  try {
    const res = await fetch(TRIGGER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventName: `Error rate ${percent}% on /api/live/odds (simulator)` }),
    });
    if (res.ok) {
      console.log(`\nError rate ${percent}%: fired the LaunchDarkly trigger (HTTP ${res.status}).`);
    } else {
      console.error(`\nError rate ${percent}%: trigger request failed (HTTP ${res.status}). Check LD_TRIGGER_URL.`);
    }
  } catch (err) {
    console.error(`\nCould not reach the LaunchDarkly trigger: ${err.message}`);
  }
}

async function sendBet() {
  const userKey = personaKeys[Math.floor(Math.random() * personaKeys.length)];
  try {
    const res = await fetch(`${BASE_URL}/api/live/odds`, { headers: { "x-user-key": userKey } });
    counts[res.status] = (counts[res.status] ?? 0) + 1;

    if (res.status === 200 || res.status >= 500) {
      recent.push(res.status >= 500);
      if (recent.length > WINDOW_SIZE) recent.shift();
      await maybeFireTrigger(liveErrorRate(), recent.length);
    }
  } catch {
    counts.unreachable += 1;
  }
}

function printStatus() {
  const seconds = Math.round((Date.now() - startedAt) / 1000);
  const rate = Math.round(liveErrorRate() * 100);
  const trigger = triggerFired ? " | trigger FIRED" : "";
  process.stdout.write(
    `\r[${seconds}s] ok: ${counts[200]}  not released: ${counts[403]}  errors: ${counts[500]}` +
    `  unreachable: ${counts.unreachable}  | live error rate (last ${recent.length}): ${rate}%${trigger}   `,
  );
}

async function setOutage(enabled) {
  try {
    await fetch(`${BASE_URL}/api/demo/outage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
  } catch {
    console.error(`\nCould not reach ${BASE_URL} to set outage mode. Is the app running?`);
  }
}

async function main() {
  console.log(`Simulating bettors against ${BASE_URL}${OUTAGE ? " with outage mode ON" : ""}. Ctrl+C to stop.`);
  if (!TRIGGER_URL) console.warn("LD_TRIGGER_URL is not set, so automatic remediation is disabled.");
  if (OUTAGE) await setOutage(true);

  const traffic = setInterval(sendBet, 1000 / REQUESTS_PER_SECOND);
  const status = setInterval(printStatus, 500);

  // Stop cleanly, and never leave the server stuck in outage mode.
  process.on("SIGINT", async () => {
    clearInterval(traffic);
    clearInterval(status);
    printStatus();
    if (OUTAGE) await setOutage(false);
    console.log(OUTAGE ? "\nOutage mode OFF. Simulator stopped." : "\nSimulator stopped.");
    process.exit(0);
  });
}

main();

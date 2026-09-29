// Experiment traffic for new-bet-slip: simulated bettors see a bet slip
// (exposure) and some of them place a bet (the bet-placed conversion).
// The conversion rates below are SIMULATED so the experiment has a clear
// result to find. They are not real customer behavior.
// Run with `make simulate-bets` while the app is running.
import { contextFor } from "../server/personas.js";

const BASE_URL = process.env.SIM_BASE_URL || "http://localhost:3000";
const BETTORS = Number(process.env.SIM_BETTORS) || 500;
const FIRST_BETTOR = Number(process.env.SIM_FIRST_BETTOR) || 1;
const CONCURRENCY = 5;

// Simulated chance that a bettor places a bet, by the slip they saw.
const CONVERSION_RATE = { classic: 0.25, new: 0.4 };

// The experiment runs on the "Legal live-betting states" rule, so only these
// bettors are in its audience. Others are counted separately.
const AUDIENCE_STATES = ["NJ", "NV"];

const tally = { classic: { seen: 0, bet: 0 }, new: { seen: 0, bet: 0 } };
let outsideAudience = 0;
let failures = 0;
let done = 0;

async function visit(n) {
  const key = `bettor-${n}`;
  const headers = { "x-user-key": key, "Content-Type": "application/json" };

  const slipRes = await fetch(`${BASE_URL}/api/bet-slip`, { headers });
  if (!slipRes.ok) throw new Error(`bet-slip returned HTTP ${slipRes.status}`);
  const { newBetSlip } = await slipRes.json();
  const variant = newBetSlip ? "new" : "classic";

  const placesBet = Math.random() < CONVERSION_RATE[variant];
  if (placesBet) {
    const picks = 1 + Math.floor(Math.random() * 3);
    const betRes = await fetch(`${BASE_URL}/api/bets`, {
      method: "POST",
      headers,
      body: JSON.stringify({ picks }),
    });
    if (!betRes.ok) throw new Error(`bets returned HTTP ${betRes.status}`);
  }

  if (AUDIENCE_STATES.includes(contextFor(key).state)) {
    tally[variant].seen += 1;
    if (placesBet) tally[variant].bet += 1;
  } else {
    outsideAudience += 1;
  }
}

// A few bettors at a time, each taking the next number from the queue.
async function worker(queue) {
  while (queue.length > 0) {
    const n = queue.shift();
    try {
      await visit(n);
    } catch (err) {
      failures += 1;
      if (failures === 1) console.error(`\nFirst failure (bettor-${n}): ${err.message}. Is the app running?`);
    }
    done += 1;
    process.stdout.write(`\rVisited ${done}/${BETTORS} bettors`);
  }
}

function rate({ seen, bet }) {
  return seen === 0 ? "n/a" : `${((bet / seen) * 100).toFixed(1)}%`;
}

async function main() {
  const last = FIRST_BETTOR + BETTORS - 1;
  console.log(`Simulating bettor-${FIRST_BETTOR} to bettor-${last} against ${BASE_URL}`);
  console.log(`Simulated conversion rates: classic ${CONVERSION_RATE.classic * 100}%, new ${CONVERSION_RATE.new * 100}%`);

  const queue = Array.from({ length: BETTORS }, (_, i) => FIRST_BETTOR + i);
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

  console.log("\n\nExperiment audience (NJ and NV), SIMULATED data:");
  console.log(`  Classic slip: ${tally.classic.bet}/${tally.classic.seen} placed a bet (${rate(tally.classic)})`);
  console.log(`  New slip:     ${tally.new.bet}/${tally.new.seen} placed a bet (${rate(tally.new)})`);
  console.log(`Outside the audience (other states): ${outsideAudience}. Failures: ${failures}.`);
  console.log("Results in LaunchDarkly lag by a few minutes while events are processed.");
}

main();

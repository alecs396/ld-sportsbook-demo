// Bet assistant traffic: simulated bettors ask one question each and give a
// thumbs up or down, so the bet-assistant config's Monitoring tab has data for
// both variations. Each chat calls Claude, so traffic is capped.
// The thumbs-up rates below are SIMULATED, not real user preference.
// Run with `make simulate-chat` while the app is running.

const BASE_URL = process.env.SIM_BASE_URL || "http://localhost:3000";
const HARD_CAP = 50; // about $0.07 at most with Claude Haiku 4.5
const CHATS = Math.min(Number(process.env.SIM_CHATS) || 20, HARD_CAP);
const FIRST_BETTOR = Number(process.env.SIM_FIRST_BETTOR) || 2001;
const DELAY_MS = 1000;

// Simulated chance of a thumbs up, by variation key.
const THUMBS_UP_RATE = { "concise-explainer": 0.75, "friendly-coach": 0.6 };

const QUESTIONS = [
  "What does +140 mean?",
  "What is a parlay?",
  "How do I read -165 odds?",
  "What's the difference between a moneyline and a spread?",
  "How is a payout calculated on a $25 bet at +175?",
  "What does it mean when a line moves?",
  "What is a live bet?",
  "Should I bet more to win back what I lost?",
];

const tally = {};
let failures = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function chat(n) {
  const userKey = `bettor-${n}`;
  const question = QUESTIONS[n % QUESTIONS.length];

  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-user-key": userKey },
    body: JSON.stringify({ message: question }),
  });
  const data = await res.json();
  if (!res.ok || !data.responseId) throw new Error(data.error ?? data.reply ?? `HTTP ${res.status}`);

  const variation = data.variation ?? "unknown";
  const positive = Math.random() < (THUMBS_UP_RATE[variation] ?? 0.5);
  await fetch(`${BASE_URL}/api/chat/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responseId: data.responseId, positive }),
  });

  tally[variation] ??= { chats: 0, up: 0 };
  tally[variation].chats += 1;
  if (positive) tally[variation].up += 1;
}

async function main() {
  console.log(`Simulating ${CHATS} bet assistant chats against ${BASE_URL} (cap ${HARD_CAP}).`);
  console.log(`Simulated thumbs-up rates: ${JSON.stringify(THUMBS_UP_RATE)}`);

  for (let i = 0; i < CHATS; i += 1) {
    try {
      await chat(FIRST_BETTOR + i);
    } catch (err) {
      failures += 1;
      console.error(`\nChat ${i + 1} failed: ${err.message}`);
      if (failures >= 3) {
        console.error("Stopping after 3 failures. Is the app running with ANTHROPIC_API_KEY set?");
        break;
      }
    }
    process.stdout.write(`\rChats: ${i + 1}/${CHATS}`);
    await sleep(DELAY_MS);
  }

  console.log("\n\nBy variation, SIMULATED feedback:");
  for (const [variation, { chats, up }] of Object.entries(tally)) {
    console.log(`  ${variation}: ${chats} chats, ${up} thumbs up (${Math.round((up / chats) * 100)}%)`);
  }
  if (Object.keys(tally).length === 1) {
    console.log("Only one variation served. Split the config's default rule 50/50 to compare.");
  }
  console.log(`Failures: ${failures}. See the config's Monitoring tab in LaunchDarkly (data lags a few minutes).`);
}

main();

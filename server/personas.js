// Demo customers, defined once and reused by the server, the simulator, and
// (later) the presenter panel. Each one is a LaunchDarkly context with a
// stable key. `name` is private, so it isn't stored in LaunchDarkly.
const privateName = { privateAttributes: ["name"] };

export const personas = {
  "new-jersey-user": {
    kind: "user",
    key: "new-jersey-user",
    name: "Cody",
    state: "NJ",
    tier: "standard",
    accountAgeDays: 63,
    isInternal: false,
    _meta: privateName,
  },
  "nevada-vip": {
    kind: "user",
    key: "nevada-vip",
    name: "Maya",
    state: "NV",
    tier: "vip",
    accountAgeDays: 912,
    isInternal: false,
    _meta: privateName,
  },
  "california-user": {
    kind: "user",
    key: "california-user",
    name: "Sam",
    state: "CA",
    tier: "standard",
    accountAgeDays: 20,
    isInternal: false,
    _meta: privateName,
  },
  "qa-tester": {
    kind: "user",
    key: "qa-tester",
    name: "Peter",
    state: "NV",
    tier: "vip",
    accountAgeDays: 365,
    isInternal: true,
    _meta: privateName,
  },
};

// Simulated bettors for the experiment ("bettor-1", "bettor-2", ...). Each
// one always gets the same attributes from its number, so its context is
// stable across visits. Four in five are in NJ or NV (the experiment's rule).
const BETTOR_STATES = ["NJ", "NV", "NJ", "NV", "CA"];

function simulatedBettor(key) {
  const match = /^bettor-(\d+)$/.exec(key);
  if (!match) return null;
  const n = Number(match[1]);
  return {
    kind: "user",
    key,
    state: BETTOR_STATES[n % BETTOR_STATES.length],
    tier: n % 10 === 0 ? "vip" : "standard",
    accountAgeDays: 1 + ((n * 37) % 900),
    isInternal: false,
  };
}

// The LaunchDarkly context for a persona or simulated bettor key, or null.
export function contextFor(key) {
  if (!key) return null;
  return personas[key] ?? simulatedBettor(key);
}

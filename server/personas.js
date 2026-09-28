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

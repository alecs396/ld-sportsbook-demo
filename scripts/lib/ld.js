// Shared helpers for the LaunchDarkly REST API scripts (doctor, demo-reset,
// bootstrap). The REST API manages resources with LD_API_TOKEN; the SDKs in
// the app only read and evaluate them.

export const PROJECT = process.env.LD_PROJECT_KEY || "ld-sportsbook-demo";
export const ENVIRONMENT = process.env.LD_ENVIRONMENT || "production";
const API = "https://app.launchdarkly.com/api/v2";

// Everything the demo expects to exist in LaunchDarkly (see README).
export const RESOURCES = {
  flags: ["live-betting", "new-bet-slip"],
  metric: "bet-placed",
  experiment: "new-bet-slip-vs-classic",
  legalStatesRule: "Legal live-betting states",
  aiConfig: "bet-assistant",
  triggerFlag: "live-betting",
  qaTester: "qa-tester",
  legalStates: ["NJ", "NV"],
};

// Calls the REST API. Returns { status, body } and never throws on HTTP errors,
// so callers can report a clear message. Never logs the token.
export async function api(path, { method = "GET", body, semanticPatch = false } = {}) {
  const headers = { Authorization: process.env.LD_API_TOKEN ?? "" };
  if (body) {
    headers["Content-Type"] = semanticPatch
      ? "application/json; domain-model=launchdarkly.semanticpatch"
      : "application/json";
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, body: parsed };
}

// The value served by a variation index, e.g. true or false for a boolean flag.
export function variationValue(flag, index) {
  return flag.variations?.[index]?.value;
}

// The ID of the variation with this value (semantic patch instructions use IDs).
export function variationId(flag, value) {
  return flag.variations?.find((v) => v.value === value)?._id;
}

// Restores the demo's starting state in LaunchDarkly (and turns off the app's
// outage mode). Only patches what differs, so running it twice is a no-op.
// Run with `make demo-reset`. See docs/demo-runbook.md for the starting state.
import { api, ENVIRONMENT, PROJECT, RESOURCES, variationId, variationValue } from "./lib/ld.js";

const COMMENT = "make demo-reset: restore demo starting state";
const { qaTester, legalStates } = RESOURCES;
let errors = 0;

async function patchFlag(key, instructions) {
  const res = await api(`/flags/${PROJECT}/${key}`, {
    method: "PATCH",
    semanticPatch: true,
    body: { environmentKey: ENVIRONMENT, comment: COMMENT, instructions },
  });
  if (!res.ok) {
    errors += 1;
    console.log(`  ✗ Could not update "${key}" (HTTP ${res.status}): ${res.body?.message ?? ""}`);
  }
  return res.ok;
}

// The flag's current state in this environment, with helpers for its variations.
async function getFlag(key) {
  const res = await api(`/flags/${PROJECT}/${key}?env=${ENVIRONMENT}`);
  if (!res.ok) {
    errors += 1;
    console.log(`  ✗ Flag "${key}" not found (run bootstrap first)`);
    return null;
  }
  return { flag: res.body, env: res.body.environments[ENVIRONMENT] };
}

const qaTargetedTo = (flag, env, value) =>
  env.targets?.length === 1 &&
  variationValue(flag, env.targets[0].variation) === value &&
  env.targets[0].values.length === 1 &&
  env.targets[0].values[0] === qaTester;

async function resetLiveBetting() {
  console.log('\n"live-betting"');
  const found = await getFlag("live-betting");
  if (!found) return;
  const { flag, env } = found;
  const [on, off] = [variationId(flag, true), variationId(flag, false)];

  const inStartingState =
    !env.on &&
    variationValue(flag, env.offVariation) === false &&
    variationValue(flag, env.fallthrough?.variation) === false &&
    (env.rules ?? []).length === 0 &&
    qaTargetedTo(flag, env, true);

  if (inStartingState) {
    console.log("  ✓ Already in starting state");
  } else if (
    await patchFlag("live-betting", [
      { kind: "turnFlagOff" },
      { kind: "updateOffVariation", variationId: off },
      { kind: "updateFallthroughVariationOrRollout", variationId: off },
      { kind: "replaceRules", rules: [] },
      { kind: "replaceTargets", targets: [{ contextKind: "user", variationId: on, values: [qaTester] }] },
    ])
  ) {
    console.log(`  ✓ Reset: targeting off, default false, "${qaTester}" gets true`);
  }

  const triggers = await api(`/flags/${PROJECT}/${RESOURCES.triggerFlag}/triggers/${ENVIRONMENT}`);
  const offTriggers = (triggers.body?.items ?? []).filter((t) =>
    t.instructions?.some((i) => i.kind === "turnFlagOff"),
  );
  if (offTriggers.length === 0) {
    console.log('  ! No "turn off" trigger found: create one in the UI (see README)');
  }
  for (const trigger of offTriggers.filter((t) => !t.enabled)) {
    const res = await api(`/flags/${PROJECT}/${RESOURCES.triggerFlag}/triggers/${ENVIRONMENT}/${trigger._id}`, {
      method: "PATCH",
      semanticPatch: true,
      body: { comment: COMMENT, instructions: [{ kind: "enableTrigger" }] },
    });
    res.ok ? console.log("  ✓ Re-enabled the turn-off trigger") : console.log(`  ✗ Could not enable trigger (HTTP ${res.status})`);
  }
  if (offTriggers.length > 0 && offTriggers.every((t) => t.enabled)) {
    console.log("  ✓ Turn-off trigger is enabled");
  }
}

async function resetNewBetSlip() {
  console.log('\n"new-bet-slip"');
  const found = await getFlag("new-bet-slip");
  if (!found) return;
  const { flag, env } = found;
  const [newSlip, classic] = [variationId(flag, true), variationId(flag, false)];

  const rules = env.rules ?? [];
  const inStartingState =
    env.on &&
    variationValue(flag, env.offVariation) === false &&
    variationValue(flag, env.fallthrough?.variation) === false &&
    qaTargetedTo(flag, env, true) &&
    rules.length === 1 &&
    variationValue(flag, rules[0].variation) === true &&
    rules[0].clauses?.length === 1 &&
    rules[0].clauses[0].attribute === "state" &&
    legalStates.every((s) => rules[0].clauses[0].values.includes(s));

  if (inStartingState) {
    console.log("  ✓ Already in starting state");
    return;
  }
  const ok = await patchFlag("new-bet-slip", [
    { kind: "turnFlagOn" },
    { kind: "updateOffVariation", variationId: classic },
    { kind: "updateFallthroughVariationOrRollout", variationId: classic },
    { kind: "replaceTargets", targets: [{ contextKind: "user", variationId: newSlip, values: [qaTester] }] },
    {
      kind: "replaceRules",
      rules: [
        {
          description: "Legal live-betting states",
          variationId: newSlip,
          clauses: [{ contextKind: "user", attribute: "state", op: "in", values: legalStates, negate: false }],
        },
      ],
    },
  ]);
  if (ok) console.log(`  ✓ Reset: on, "${qaTester}" and ${legalStates.join("/")} get the new slip, default classic`);
}

async function resetBetAssistant() {
  console.log(`\n"${RESOURCES.aiConfig}"`);
  const path = `/projects/${PROJECT}/ai-configs/${RESOURCES.aiConfig}/targeting`;
  const res = await api(`${path}?env=${ENVIRONMENT}`);
  if (!res.ok) {
    console.log(`  ! Config not found (HTTP ${res.status}); the bet assistant will be unavailable`);
    return;
  }
  const { variations } = res.body;
  const environment = res.body.environments?.[ENVIRONMENT];
  const idOf = (name) => variations.find((v) => v.name === name)?._id;
  const [concise, friendly] = [idOf("Concise explainer"), idOf("Friendly coach")];
  if (!concise || !friendly) {
    console.log('  ! Expected variations "Concise explainer" and "Friendly coach" (see README)');
    return;
  }

  // The REST API reports rollout weights in thousandths of a percent (50000 = 50%).
  const split = environment?.fallthrough?.rollout?.variations ?? [];
  const weightFor = (name) => split.find((v) => variations[v.variation]?.name === name)?.weight;
  if (weightFor("Concise explainer") === 50000 && weightFor("Friendly coach") === 50000) {
    console.log("  ✓ Default rule already splits 50/50");
  } else {
    const patch = await api(path, {
      method: "PATCH",
      semanticPatch: true,
      body: {
        environmentKey: ENVIRONMENT,
        comment: COMMENT,
        instructions: [
          {
            kind: "updateFallthroughVariationOrRollout",
            rolloutContextKind: "user",
            rolloutWeights: { [concise]: 50000, [friendly]: 50000 },
          },
        ],
      },
    });
    if (patch.ok) {
      console.log("  ✓ Reset: default rule splits 50/50 Concise explainer / Friendly coach");
    } else {
      errors += 1;
      console.log(`  ✗ Could not update the config's targeting (HTTP ${patch.status}): ${patch.body?.message ?? ""}`);
    }
  }
  if (!environment?.enabled) console.log("  ! Config targeting is off: turn it on in the UI");
}

async function resetApp() {
  console.log("\nApp");
  const url = process.env.SIM_BASE_URL || "http://localhost:3000";
  try {
    await fetch(`${url}/api/demo/outage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    console.log("  ✓ Outage mode off");
  } catch {
    console.log("  - App not running, nothing to reset");
  }
}

async function main() {
  if (!process.env.LD_API_TOKEN) {
    console.error("LD_API_TOKEN is not set (see .env.example)");
    process.exit(1);
  }
  console.log(`Resetting demo state in "${PROJECT}" / "${ENVIRONMENT}"`);
  await resetLiveBetting();
  await resetNewBetSlip();
  await resetBetAssistant();
  await resetApp();
  console.log(errors ? `\n${errors} error(s). Run make doctor for details.` : "\nDone. Run make doctor to confirm.");
  if (errors) process.exit(1);
}

main();

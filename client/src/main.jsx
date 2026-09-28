import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// LaunchDarkly React SDK
import { createLDReactProvider } from "@launchdarkly/react-sdk";
import App from "./App.jsx";
import "./App.css";

// Default customer context. The key stays the same across visits so
// targeting and experiment bucketing are consistent. `name` is private, so
// it can be used for targeting but isn't stored in LaunchDarkly.
const customerContext = {
  kind: "user",
  key: "new-jersey-user",
  name: "Cody",
  state: "NJ",
  tier: "standard",
  accountAgeDays: 63,
  isInternal: false,
  _meta: {
    privateAttributes: ["name"],
  },
};

// Internal QA tester. This key is individually targeted on "live-betting",
// so QA can test in production before customers see it.
const qaContext = {
  kind: "user",
  key: "qa-tester",
  name: "Peter",
  state: "NV",
  tier: "VIP",
  accountAgeDays: 365,
  isInternal: true,
  _meta: {
    privateAttributes: ["name"],
  },
};

// Open the app with ?as=qa to be the QA tester (testing in production).
// The Phase 6 persona switcher replaces this.
const asQa = new URLSearchParams(window.location.search).get("as") === "qa";
const context = asQa ? qaContext : customerContext;

// Get the client-side ID from the server at runtime (see /api/config)
async function loadConfig() {
  try {
    const res = await fetch("/api/config");
    return await res.json();
  } catch (err) {
    console.error("Could not load /api/config", err);
    return { clientSideId: null };
  }
}

async function main() {
  const config = await loadConfig();
  const root = createRoot(document.getElementById("root"));

  // The browser SDK can't start without an ID, so show a setup message
  // instead of a blank page.
  if (!config.clientSideId) {
    root.render(
      <p className="setup-message">
        LaunchDarkly client-side ID is missing. Set LD_CLIENT_SIDE_ID in .env
        (see .env.example) and restart the app.
      </p>,
    );
    return;
  }

  // Start LaunchDarkly before the first render. Streaming pushes flag
  // changes to the page without a reload.
  const LDProvider = createLDReactProvider(config.clientSideId, context, {
    ldOptions: { streaming: true },
  });

  root.render(
    <StrictMode>
      <LDProvider>
        <App config={config} userKey={context.key} />
      </LDProvider>
    </StrictMode>,
  );
}

main();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// LaunchDarkly React SDK. `createLDReactProvider` starts the client-side SDK
// and returns a provider component that makes flags available to every
// component inside it.
import { createLDReactProvider } from "@launchdarkly/react-sdk";
import App from "./App.jsx";
import "./App.css";

// The LaunchDarkly context: who flags are evaluated for. The browser sends it
// to LaunchDarkly, which evaluates every client-side flag for this context and
// returns only the results (the targeting rules never reach the browser).
// - `key` is stable, so the same user always gets the same bucket in
//   percentage rollouts and experiments, and can be individually targeted.
// - Custom attributes (state, tier, accountAgeDays, isInternal) are what
//   targeting rules match on.
// - `name` is private: usable for targeting, but LaunchDarkly never stores it.
const context = {
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

// Runtime config: ask the server for the LaunchDarkly client-side ID at
// startup (see /api/config in server/src/index.js) instead of baking it into
// the bundle at build time. One image works in every environment.
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

  // The browser SDK has no offline mode and throws without a client-side ID,
  // so show a setup message instead of a blank page. (If the ID is set but
  // LaunchDarkly is unreachable, the SDK serves fallback values instead.)
  if (!config.clientSideId) {
    root.render(
      <p className="setup-message">
        LaunchDarkly client-side ID is missing. Set LD_CLIENT_SIDE_ID in .env
        (see .env.example) and restart the app.
      </p>,
    );
    return;
  }

  // Start the LaunchDarkly client before the first render, using the
  // client-side ID from runtime config. Streaming is on explicitly: it keeps a
  // connection open so flag changes reach the page with no reload.
  const LDProvider = createLDReactProvider(config.clientSideId, context, {
    ldOptions: { streaming: true },
  });

  root.render(
    <StrictMode>
      <LDProvider>
        <App config={config} />
      </LDProvider>
    </StrictMode>,
  );
}

main();

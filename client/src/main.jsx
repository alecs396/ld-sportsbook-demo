import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
// LaunchDarkly React SDK
import { createLDReactProvider } from "@launchdarkly/react-sdk";
import App from "./App.jsx";
import Presenter from "./Presenter.jsx";
import "./App.css";

const DEFAULT_PERSONA = "new-jersey-user";
const STORAGE_KEY = "sportsbook-persona";

async function getJson(url, fallback) {
  try {
    const res = await fetch(url);
    return await res.json();
  } catch (err) {
    console.error(`Could not load ${url}`, err);
    return fallback;
  }
}

// Which persona to start as: ?as=<key> in the URL (handy for side-by-side
// windows), then the last one picked in this browser, then the NJ customer.
function initialPersonaKey(personas) {
  const keys = personas.map((p) => p.key);
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked; fall through to the default.
  }
  const fromUrl = new URLSearchParams(window.location.search).get("as");
  return [fromUrl, saved, DEFAULT_PERSONA].find((key) => keys.includes(key)) ?? keys[0];
}

async function main() {
  // Runtime config and personas come from the server (see /api/config and
  // /api/personas), so the same build works in every environment.
  const [config, personas] = await Promise.all([
    getJson("/api/config", { clientSideId: null }),
    getJson("/api/personas", []),
  ]);
  const root = createRoot(document.getElementById("root"));

  // The browser SDK can't start without an ID, so show a setup message
  // instead of a blank page.
  if (!config.clientSideId || personas.length === 0) {
    root.render(
      <p className="setup-message">
        {config.clientSideId
          ? "Could not load demo personas from the server. Is it running?"
          : "LaunchDarkly client-side ID is missing. Set LD_CLIENT_SIDE_ID in .env (see .env.example) and restart the app."}
      </p>,
    );
    return;
  }

  // Each persona is a LaunchDarkly context (see server/personas.js). Keys are
  // stable so targeting and experiment bucketing are consistent.
  const startKey = initialPersonaKey(personas);
  const context = personas.find((p) => p.key === startKey);

  // Start LaunchDarkly before the first render. Streaming pushes flag
  // changes to the page without a reload.
  // The presenter panel also asks for evaluation reasons (why each value).
  const isPresenter = window.location.pathname === "/presenter";
  const LDProvider = createLDReactProvider(config.clientSideId, context, {
    ldOptions: { streaming: true, withReasons: isPresenter },
  });

  root.render(
    <StrictMode>
      <LDProvider>
        {isPresenter ? (
          <Presenter personas={personas} initialPersonaKey={startKey} />
        ) : (
          <App config={config} personas={personas} initialPersonaKey={startKey} storageKey={STORAGE_KEY} />
        )}
      </LDProvider>
    </StrictMode>,
  );
}

main();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./App.css";

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

  // Phase 2: initialize the LaunchDarkly React SDK here with
  // config.clientSideId, before the first render, so flag values are ready
  // when the page first paints.

  createRoot(document.getElementById("root")).render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  );
}

main();

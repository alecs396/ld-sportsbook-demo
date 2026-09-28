import fs from "node:fs";
import path from "node:path";
import express from "express";
// LaunchDarkly server-side SDK. `init` creates the client that connects to
// LaunchDarkly and evaluates flags locally in this process.
import { init } from "@launchdarkly/node-server-sdk";

// Environment variables come from the repo-root .env file in local dev
// (loaded by `node --env-file-if-exists`, see server/package.json) or are
// injected by docker-compose / Cloud Run. See .env.example for the full list.
const PORT = Number(process.env.PORT) || 3000;

// The client-side ID is public: it is safe to send to the browser.
// Never expose LD_SDK_KEY (server only) or LD_API_TOKEN through any endpoint.
const LD_CLIENT_SIDE_ID = process.env.LD_CLIENT_SIDE_ID;

if (!LD_CLIENT_SIDE_ID) {
  console.warn("LD_CLIENT_SIDE_ID is not set. Copy .env.example to .env and fill it in.");
}

// SDK KEY: set LD_SDK_KEY in .env to your own environment's SDK key (see
// .env.example). It is a secret: never hardcode it or send it to the browser.
const LD_SDK_KEY = process.env.LD_SDK_KEY;

if (!LD_SDK_KEY) {
  console.warn("LD_SDK_KEY is not set. Flags will use their fallback values.");
}

// One LaunchDarkly client for the whole process, shared by every route.
// On startup it opens a streaming connection, downloads this environment's
// flag rules, and then evaluates flags in memory. Flag changes made in
// LaunchDarkly are pushed down the stream within milliseconds.
// Without a key, offline mode keeps the app running: every flag evaluation
// returns its fallback value and nothing connects to LaunchDarkly.
const ldClient = init(LD_SDK_KEY ?? "", { offline: !LD_SDK_KEY });

const app = express();
app.use(express.json());

// Health check for docker-compose, Cloud Run, and `make doctor`.
// Stays "ok" even if LaunchDarkly is down: the app still serves fallback values.
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    launchdarkly: {
      // true once the SDK has received flag rules from LaunchDarkly. Offline
      // mode also reports initialized, so it only counts when a key is set.
      initialized: Boolean(LD_SDK_KEY) && ldClient.initialized(),
      // true when no SDK key is set: every flag serves its fallback value.
      offline: !LD_SDK_KEY,
    },
  });
});

// Runtime config for the React app. The browser fetches this at startup
// instead of Vite baking the ID into the bundle at build time, so the same
// image works in every environment.
app.get("/api/config", (req, res) => {
  res.json({ clientSideId: LD_CLIENT_SIDE_ID ?? null });
});

// Unknown API routes get a JSON 404 instead of falling through to index.html.
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Production: serve the built React app so the whole app is one container.
// In dev (`make dev`) client/dist usually doesn't exist and Vite serves the UI.
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Any other path (e.g. /presenter) returns index.html and React renders it.
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Wait for the SDK to receive flag rules before accepting requests, so the
// first requests get real flag values instead of fallbacks. The timeout keeps
// a LaunchDarkly outage from blocking startup: the app starts anyway and every
// evaluation returns its fallback value until the SDK connects.
try {
  await ldClient.waitForInitialization({ timeout: 10 });
  if (LD_SDK_KEY) console.log("LaunchDarkly SDK initialized");
} catch (err) {
  console.error(`LaunchDarkly SDK not initialized (${err.message}). Serving fallback values.`);
}

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Graceful shutdown on SIGTERM (docker stop, Cloud Run scale-down) and SIGINT
// (Ctrl+C). The Node SDK does not send pending analytics events on exit by
// itself, so flush them first (best effort), then close the LaunchDarkly
// streaming connection and the HTTP server.
async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  try {
    await ldClient.flush();
  } catch (err) {
    console.error(`Could not flush LaunchDarkly events: ${err.message}`);
  }
  ldClient.close();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

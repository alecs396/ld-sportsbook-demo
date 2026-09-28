import fs from "node:fs";
import path from "node:path";
import express from "express";
// LaunchDarkly server-side SDK
import { init } from "@launchdarkly/node-server-sdk";
import { personas } from "../personas.js";

// Env vars come from .env locally, or from docker-compose / Cloud Run.
// See .env.example for the full list.
const PORT = Number(process.env.PORT) || 3000;

// The client-side ID is public, so it's fine to send to the browser.
// Never expose LD_SDK_KEY or LD_API_TOKEN from an endpoint.
const LD_CLIENT_SIDE_ID = process.env.LD_CLIENT_SIDE_ID;

if (!LD_CLIENT_SIDE_ID) {
  console.warn("LD_CLIENT_SIDE_ID is not set. Copy .env.example to .env and fill it in.");
}

// SDK KEY: put your own SDK key in LD_SDK_KEY in .env (see .env.example).
// It's a secret, so it stays on the server.
const LD_SDK_KEY = process.env.LD_SDK_KEY;

if (!LD_SDK_KEY) {
  console.warn("LD_SDK_KEY is not set. Flags will use their fallback values.");
}

// One shared client for the whole server. It streams the flag rules in and
// evaluates flags locally. With no key it runs offline on fallback values.
const ldClient = init(LD_SDK_KEY ?? "", { offline: !LD_SDK_KEY });

const app = express();
app.use(express.json());

// Health check for Docker, Cloud Run, and `make doctor`. Stays "ok" if
// LaunchDarkly is down since the app still works on fallback values.
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    launchdarkly: {
      // Offline mode also reports initialized, so require a key too
      initialized: Boolean(LD_SDK_KEY) && ldClient.initialized(),
      offline: !LD_SDK_KEY,
    },
  });
});

// The React app fetches the client-side ID at startup instead of baking it
// in at build time, so one image works in every environment.
app.get("/api/config", (req, res) => {
  res.json({ clientSideId: LD_CLIENT_SIDE_ID || null });
});

// Live betting API. The caller says who they are with the x-user-key header
// (a persona key from personas.js), standing in for a real login.
app.get("/api/live/odds", async (req, res) => {
  const context = personas[req.get("x-user-key")];
  if (!context) {
    return res.status(400).json({ error: "Unknown or missing x-user-key" });
  }

  // FLAG: same "live-betting" flag the React app uses (see README).
  // The server checks it too, for this caller's context, since hiding the
  // panel in the browser doesn't stop someone calling the API directly.
  // Defaults to false so the API stays closed if LaunchDarkly is down.
  const liveBettingEnabled = await ldClient.variation("live-betting", context, false);
  if (!liveBettingEnabled) {
    return res.status(403).json({ error: "Live betting is not available" });
  }

  res.json({
    game: "Kansas City @ Philadelphia",
    clock: "Q3 08:42",
    odds: { "Kansas City": 140, Philadelphia: -165 },
  });
});

// Unknown API routes return a JSON 404 instead of index.html
app.use("/api", (req, res) => {
  res.status(404).json({ error: "Not found" });
});

// In production, Express serves the built React app (one container).
// In dev, Vite serves the UI instead.
const clientDist = path.resolve(import.meta.dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  // Let React handle any other path (e.g. /presenter)
  app.get("/{*splat}", (req, res) => {
    res.sendFile(path.join(clientDist, "index.html"));
  });
}

// Wait for the flag rules before taking traffic. The timeout means a
// LaunchDarkly outage can't block startup: we start on fallback values.
try {
  await ldClient.waitForInitialization({ timeout: 10 });
  if (LD_SDK_KEY) console.log("LaunchDarkly SDK initialized");
} catch (err) {
  console.error(`LaunchDarkly SDK not initialized (${err.message}). Serving fallback values.`);
}

const server = app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

// Clean shutdown for docker stop / Cloud Run (SIGTERM) and Ctrl+C (SIGINT).
// The Node SDK doesn't flush analytics events on exit, so do it here first.
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

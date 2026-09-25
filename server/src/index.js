import express from "express";

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

const app = express();
app.use(express.json());

// Health check for docker-compose, Cloud Run, and `make doctor`.
// Phase 2: replace the hardcoded `false` with the real SDK initialization state.
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    launchdarkly: { initialized: false },
  });
});

// Runtime config for the React app. The browser fetches this at startup
// instead of Vite baking the ID into the bundle at build time, so the same
// image works in every environment.
app.get("/api/config", (req, res) => {
  res.json({ clientSideId: LD_CLIENT_SIDE_ID ?? null });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

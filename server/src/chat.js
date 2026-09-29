import Anthropic from "@anthropic-ai/sdk";
import { initAi, LDFeedbackKind } from "@launchdarkly/server-sdk-ai";
import { contextFor } from "../personas.js";

// AI CONFIG: create a completion-mode AgentControl config "bet-assistant" in
// your LaunchDarkly project, with an Anthropic model and a system message (see README).
const CONFIG_KEY = "bet-assistant";
const MAX_MESSAGE_LENGTH = 500;

// Anthropic key stays on the server. Without it the assistant says it isn't set up.
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

// Remembers each reply's tracker token and bettor, so thumbs up/down is
// credited to the variation that wrote it. In memory only; fine for a demo.
export const recentReplies = new Map();
const MAX_REMEMBERED = 500;

function remember(responseId, entry) {
  recentReplies.set(responseId, entry);
  if (recentReplies.size > MAX_REMEMBERED) {
    recentReplies.delete(recentReplies.keys().next().value);
  }
}

// Calls Claude with the model, parameters, and messages from the config.
// Anthropic takes the system prompt separately from the conversation.
async function callClaude(aiConfig, userMessage) {
  const system = (aiConfig.messages ?? [])
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const response = await anthropic.messages.create({
    model: aiConfig.model.name,
    max_tokens: aiConfig.model.parameters?.max_tokens ?? 300,
    system,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  return { text, usage: response.usage };
}

export function addChatRoutes(app, ldClient) {
  // AI client on top of the existing LaunchDarkly client (same connection).
  const aiClient = initAi(ldClient);

  app.post("/api/chat", async (req, res) => {
    const context = contextFor(req.get("x-user-key"));
    if (!context) {
      return res.status(400).json({ error: "Unknown or missing x-user-key" });
    }
    const message = String(req.body?.message ?? "").trim().slice(0, MAX_MESSAGE_LENGTH);
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    // Model, parameters, and prompt for this bettor. The context also fills in
    // {{ ldctx.state }}. Falls back to disabled if LaunchDarkly is unreachable.
    const aiConfig = await aiClient.completionConfig(CONFIG_KEY, context, { enabled: false });

    if (!aiConfig.enabled) {
      return res.json({ reply: "The bet assistant is unavailable right now.", variation: null });
    }
    if (!anthropic) {
      return res.json({ reply: "The bet assistant isn't set up yet (no ANTHROPIC_API_KEY).", variation: null });
    }
    if (aiConfig.provider?.name !== "Anthropic") {
      return res.json({ reply: `This demo only supports Anthropic models, not ${aiConfig.provider?.name}.`, variation: null });
    }

    // Per-request tracker: duration, tokens, and success/error are recorded
    // against this bettor's variation, so variations can be compared in LaunchDarkly.
    const tracker = aiConfig.createTracker();
    const started = Date.now();
    try {
      const { text, usage } = await callClaude(aiConfig, message);
      tracker.trackDuration(Date.now() - started);
      tracker.trackTokens({
        input: usage.input_tokens,
        output: usage.output_tokens,
        total: usage.input_tokens + usage.output_tokens,
      });
      tracker.trackSuccess();
      const trackData = tracker.getTrackData();

      const responseId = crypto.randomUUID();
      remember(responseId, { context, resumptionToken: tracker.resumptionToken });
      res.json({ reply: text, variation: trackData.variationKey ?? null, responseId });
    } catch (err) {
      tracker.trackError();
      console.error(`Bet assistant call failed: ${err.message}`);
      res.status(502).json({ error: "The bet assistant had a problem. Try again." });
    }
  });

  // Thumbs up/down on a reply. The browser only sends the responseId, so
  // feedback always goes to the bettor and variation that produced the reply.
  app.post("/api/chat/feedback", (req, res) => {
    const entry = recentReplies.get(req.body?.responseId);
    if (!entry) {
      return res.status(404).json({ error: "Unknown or already rated reply" });
    }
    const positive = req.body?.positive === true;

    // Credit the thumbs up/down to the variation that wrote this reply, as part
    // of the same run as its duration and token metrics.
    const tracker = aiClient.createTracker(entry.resumptionToken, entry.context);
    tracker.trackFeedback({ kind: positive ? LDFeedbackKind.Positive : LDFeedbackKind.Negative });

    recentReplies.delete(req.body.responseId);
    res.json({ recorded: true, positive });
  });
}

import { useEffect, useState } from "react";

// Bet assistant chat. The prompt and model come from the "bet-assistant"
// config in LaunchDarkly (server side, see server/src/chat.js).
export default function ChatWidget({ userKey }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // A different bettor starts a fresh conversation.
  useEffect(() => {
    setMessages([]);
  }, [userKey]);

  async function send(event) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setMessages((prev) => [...prev, { from: "user", text }]);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-user-key": userKey },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      const reply = data.reply ?? data.error ?? "Something went wrong.";
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: reply, variation: data.variation, responseId: data.responseId },
      ]);
    } catch {
      setMessages((prev) => [...prev, { from: "bot", text: "Could not reach the bet assistant." }]);
    } finally {
      setSending(false);
    }
  }

  async function rate(responseId, positive) {
    setMessages((prev) => prev.map((m) => (m.responseId === responseId ? { ...m, rated: positive ? "up" : "down" } : m)));
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, positive }),
      });
    } catch {
      // Feedback is best effort.
    }
  }

  if (!open) {
    return (
      <button className="chat-launcher" onClick={() => setOpen(true)}>
        Ask the bet assistant
      </button>
    );
  }

  return (
    <section className="chat">
      <header className="chat-header">
        <strong>Bet assistant</strong>
        <button className="remove" onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </header>
      <div className="chat-messages">
        {messages.length === 0 && <p className="muted">Ask about odds, bet types, or payouts.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.from}`}>
            <p>{m.text}</p>
            {m.from === "bot" && m.responseId && (
              <div className="chat-meta muted">
                <span>{m.variation}</span>
                {m.rated ? (
                  <span>{m.rated === "up" ? "Thanks!" : "Thanks for the feedback"}</span>
                ) : (
                  <span>
                    <button onClick={() => rate(m.responseId, true)} aria-label="Helpful">
                      👍
                    </button>
                    <button onClick={() => rate(m.responseId, false)} aria-label="Not helpful">
                      👎
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
        {sending && <p className="muted">Thinking…</p>}
      </div>
      <form className="chat-input" onSubmit={send}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          placeholder="What does +140 mean?"
        />
        <button className="place" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}

import { useCallback, useEffect, useState } from "react";
import { useBoolVariation, useInitializationStatus, useLDClient } from "@launchdarkly/react-sdk";
import { games, formatOdds } from "./mockData.js";
import { ClassicBetSlip, NewBetSlip } from "./BetSlip.jsx";
import { LiveBettingPanel, LiveBettingTeaser } from "./LiveBetting.jsx";
import Toast from "./Toast.jsx";
import { DEMO_CHANNEL } from "./Presenter.jsx";

export default function App({ config, personas, initialPersonaKey, storageKey }) {
  const [slip, setSlip] = useState([]);
  const [notice, setNotice] = useState(null);
  const [personaKey, setPersonaKey] = useState(initialPersonaKey);
  const closeNotice = useCallback(() => setNotice(null), []);

  // FLAG: create a boolean flag "live-betting",
  // available to client-side SDKs (see README).
  // The hook re-renders when the flag changes, so no page reload is needed.
  // Defaults to false so live betting stays hidden if LaunchDarkly is down.
  const liveBettingEnabled = useBoolVariation("live-betting", false);

  // FLAG: create a boolean flag "new-bet-slip", available to client-side
  // SDKs (see README). Targeted by state for Part 2 and used in the
  // bet-placed experiment. Defaults to false, the classic slip, which is also
  // the experiment's control.
  const newBetSlipEnabled = useBoolVariation("new-bet-slip", false);

  const { status, error } = useInitializationStatus();

  // The presenter panel (/presenter) can switch this tab's persona.
  useEffect(() => {
    const channel = new BroadcastChannel(DEMO_CHANNEL);
    channel.onmessage = (event) => {
      if (event.data?.type === "persona") switchPersona(event.data.key);
    };
    return () => channel.close();
  }, []);

  // Explicit listener for live-betting changes (Part 1). Streaming pushes the
  // change and this shows a toast. The hook above already swaps the panel.
  // The SDK also fires "change" at startup and when the stream reconnects,
  // with the same value, so only notify when the value really changes.
  const ldClient = useLDClient();

  useEffect(() => {
    if (status === "initializing") return;
    let previous = ldClient.variation("live-betting", false);

    const handleChange = () => {
      const enabled = ldClient.variation("live-betting", false);
      if (enabled === previous) return;
      previous = enabled;
      console.log(`[listener] live-betting changed to ${enabled}`);
      setNotice(enabled ? "Live betting is now open." : "Live betting is paused.");
    };

    ldClient.on("change:live-betting", handleChange);

    return () => {
      ldClient.off("change:live-betting", handleChange);
    };
  }, [ldClient, status]);

  // If LaunchDarkly fails to start, the page still works on fallback values
  useEffect(() => {
    if (status === "failed" || status === "timeout") {
      console.warn(`LaunchDarkly did not initialize (${status}). Using fallback values.`, error);
    }
  }, [status, error]);

  // Wait for real flag values so the page doesn't flicker
  if (status === "initializing") {
    return <p className="loading muted">Loading…</p>;
  }

  // Adds a pick ({ id, matchup, team, odds }) to the slip, ignoring duplicates.
  function addPick(pick) {
    if (slip.some((item) => item.id === pick.id)) return;
    setSlip([...slip, pick]);
  }

  function addToSlip(game, side) {
    addPick({
      id: `${game.id}-${side}`,
      matchup: `${game.away.team} @ ${game.home.team}`,
      team: game[side].team,
      odds: game[side].odds,
    });
  }

  function removeFromSlip(id) {
    setSlip(slip.filter((item) => item.id !== id));
  }

  // Persona switcher: become a different demo customer without a reload.
  async function switchPersona(key) {
    const persona = personas.find((p) => p.key === key);
    if (!persona) return;

    // Switch the LaunchDarkly context so every flag is re-evaluated for this
    // persona. Hooks re-render with the new values, no page reload.
    try {
      await ldClient.identify(persona);
    } catch (err) {
      console.error(`Could not switch LaunchDarkly context to ${key}`, err);
    }

    setPersonaKey(key);
    setSlip([]);
    try {
      localStorage.setItem(storageKey, key);
    } catch {
      // Remembering the persona is a convenience; ignore blocked storage.
    }
  }

  // Both slips place bets the same way, so the experiment compares only the
  // design. Phase 7: track("bet-placed") goes here.
  function placeBet() {
    setSlip([]);
    setNotice("Bet placed. Good luck!");
  }

  return (
    <div className="app">
      <header className="header">
        <span className="logo">Kickoff Sportsbook</span>
        <label className="persona muted">
          Signed in as{" "}
          <select value={personaKey} onChange={(e) => switchPersona(e.target.value)}>
            {personas.map((p) => (
              <option key={p.key} value={p.key}>
                {p.name} ({p.state}, {p.tier}{p.isInternal ? ", QA" : ""})
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="layout">
        <section className="games">
          {/* New live betting panel when the flag is on, old teaser when off. */}
          {liveBettingEnabled ? <LiveBettingPanel onPick={addPick} /> : <LiveBettingTeaser />}

          <h2>Featured games</h2>
          {games.map((game) => (
            <div className="game" key={game.id}>
              <div className="game-meta">
                <span>{game.league}</span>
                <span>{game.kickoff}</span>
              </div>
              {["away", "home"].map((side) => (
                <div className="game-row" key={side}>
                  <span className="team">{game[side].team}</span>
                  <button className="odds" onClick={() => addToSlip(game, side)}>
                    {formatOdds(game[side].odds)}
                  </button>
                </div>
              ))}
            </div>
          ))}
        </section>

        {newBetSlipEnabled ? (
          <NewBetSlip slip={slip} onRemove={removeFromSlip} onPlaceBet={placeBet} />
        ) : (
          <ClassicBetSlip slip={slip} onRemove={removeFromSlip} onPlaceBet={placeBet} />
        )}
      </main>

      <Toast message={notice} onClose={closeNotice} />

      <footer className="footer muted">
        LaunchDarkly client-side ID: {config.clientSideId ? "loaded" : "missing (check .env)"}
      </footer>
    </div>
  );
}

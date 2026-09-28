import { useCallback, useEffect, useState } from "react";
import { useBoolVariation, useInitializationStatus, useLDClient } from "@launchdarkly/react-sdk";
import { games, formatOdds } from "./mockData.js";
import { LiveBettingPanel, LiveBettingTeaser } from "./LiveBetting.jsx";
import Toast from "./Toast.jsx";

export default function App({ config, userKey }) {
  const [slip, setSlip] = useState([]);
  const [notice, setNotice] = useState(null);
  const closeNotice = useCallback(() => setNotice(null), []);

  // FLAG: create a boolean flag "live-betting",
  // available to client-side SDKs (see README).
  // The hook re-renders when the flag changes, so no page reload is needed.
  // Defaults to false so live betting stays hidden if LaunchDarkly is down.
  const liveBettingEnabled = useBoolVariation("live-betting", false);

  const { status, error } = useInitializationStatus();

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

  return (
    <div className="app">
      <header className="header">
        <span className="logo">Kickoff Sportsbook</span>
        <span className="muted">Signed in as {userKey}</span>
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

        <aside className="slip">
          <h2>Bet slip</h2>
          {slip.length === 0 ? (
            <p className="muted">Tap the odds to add a pick.</p>
          ) : (
            <ul>
              {slip.map((item) => (
                <li key={item.id}>
                  <div>
                    <strong>{item.team}</strong> {formatOdds(item.odds)}
                    <div className="muted">{item.matchup}</div>
                  </div>
                  <button className="remove" onClick={() => removeFromSlip(item.id)} aria-label="Remove">
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* Phase 7: placing a bet sends track("bet-placed") for the experiment. */}
          <button className="place" disabled={slip.length === 0}>
            Place bet
          </button>
        </aside>
      </main>

      <Toast message={notice} onClose={closeNotice} />

      <footer className="footer muted">
        LaunchDarkly client-side ID: {config.clientSideId ? "loaded" : "missing (check .env)"}
      </footer>
    </div>
  );
}

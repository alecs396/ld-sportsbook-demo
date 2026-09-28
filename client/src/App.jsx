import { useEffect, useState } from "react";
import { useInitializationStatus } from "@launchdarkly/react-sdk";
import { games, formatOdds } from "./mockData.js";
import { LiveBettingPanel, LiveBettingTeaser } from "./LiveBetting.jsx";

export default function App({ config }) {
  const [slip, setSlip] = useState([]);

  // TODO(Alec) 5: Evaluate the "live-betting" flag for the current context.
  // Hints:
  //   - One typed hook from the React SDK for a boolean flag, imported like
  //     useInitializationStatus above. Arguments: the flag key and a fallback.
  //   - Pick the fallback deliberately: what should customers see if
  //     LaunchDarkly is unreachable or the flag doesn't exist?
  //   - Add the reviewer comment the take-home asks for, e.g.
  //     // FLAG: "live-betting" must exist in your LaunchDarkly project (see README)
  //   - It's a hook, so keep it up here, before the early return below.
  // Docs: https://launchdarkly.com/docs/sdk/client-side/react/react-web#single-flag-hooks
  const liveBettingEnabled = false;

  // LaunchDarkly initialization status: "initializing" until the first flag
  // values arrive, then "complete", "failed", or "timeout".
  const { status, error } = useInitializationStatus();

  // If LaunchDarkly could not initialize, the page still works: every flag
  // uses its fallback value. Logged once per status change, not every render.
  useEffect(() => {
    if (status === "failed" || status === "timeout") {
      console.warn(`LaunchDarkly did not initialize (${status}). Using fallback values.`, error);
    }
  }, [status, error]);

  // Wait for real flag values before rendering the page, so it paints once
  // with the right features instead of flickering from fallback values.
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

      <footer className="footer muted">
        LaunchDarkly client-side ID: {config.clientSideId ? "loaded" : "missing (check .env)"}
      </footer>
    </div>
  );
}

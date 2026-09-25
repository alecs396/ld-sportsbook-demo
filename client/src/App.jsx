import { useState } from "react";
import { games, formatOdds } from "./mockData.js";

export default function App({ config }) {
  const [slip, setSlip] = useState([]);

  function addToSlip(game, side) {
    const pick = game[side];
    const id = `${game.id}-${side}`;
    if (slip.some((item) => item.id === id)) return;
    setSlip([
      ...slip,
      { id, matchup: `${game.away.team} @ ${game.home.team}`, team: pick.team, odds: pick.odds },
    ]);
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
          {/* Phase 2: the live betting panel (flag "live-betting") renders here. */}

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

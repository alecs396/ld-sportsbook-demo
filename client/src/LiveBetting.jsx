import { liveGame, formatOdds } from "./mockData.js";

// New feature, shown when the "live-betting" flag is on.
export function LiveBettingPanel({ onPick }) {
  const { away, home } = liveGame;
  const matchup = `${away.team} @ ${home.team}`;

  return (
    <section className="live-panel">
      <div className="live-header">
        <span className="live-badge">LIVE</span>
        <span className="muted">
          {liveGame.league} · {liveGame.clock}
        </span>
      </div>

      <h3 className="live-title">In-game moneyline</h3>
      {[away, home].map((side) => (
        <div className="game-row" key={side.team}>
          <span className="team">
            {side.team} <span className="score">{side.score}</span>
          </span>
          <button
            className="odds"
            onClick={() =>
              onPick({ id: `${liveGame.id}-${side.team}`, matchup, team: `${side.team} (live)`, odds: side.odds })
            }
          >
            {formatOdds(side.odds)}
          </button>
        </div>
      ))}

      <h3 className="live-title">Next to score</h3>
      <div className="market-grid">
        {liveGame.nextScore.map((option) => (
          <button
            className="odds market"
            key={option.id}
            onClick={() => onPick({ id: `${liveGame.id}-${option.id}`, matchup, team: option.label, odds: option.odds })}
          >
            <span>{option.label}</span>
            <strong>{formatOdds(option.odds)}</strong>
          </button>
        ))}
      </div>
    </section>
  );
}

// Old experience, shown when the "live-betting" flag is off.
export function LiveBettingTeaser() {
  return (
    <section className="live-teaser">
      <strong>Live betting is coming soon.</strong>
      <span className="muted"> Bet on every drive, in real time, right here.</span>
    </section>
  );
}

import { useState } from "react";
import { formatOdds } from "./mockData.js";

// Total returned on a winning bet (stake + profit) for American odds.
function payout(stake, odds) {
  const profit = odds > 0 ? (stake * odds) / 100 : (stake * 100) / Math.abs(odds);
  return stake + profit;
}

function money(amount) {
  return `$${amount.toFixed(2)}`;
}

function SlipItems({ slip, onRemove, stake }) {
  return (
    <ul>
      {slip.map((item) => (
        <li key={item.id}>
          <div>
            <strong>{item.team}</strong> {formatOdds(item.odds)}
            <div className="muted">{item.matchup}</div>
            {stake && <div className="payout">Pays {money(payout(stake, item.odds))}</div>}
          </div>
          <button className="remove" onClick={() => onRemove(item.id)} aria-label="Remove">
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

// Old experience: the original bet slip.
export function ClassicBetSlip({ slip, onRemove, onPlaceBet }) {
  return (
    <aside className="slip">
      <h2>Bet slip</h2>
      {slip.length === 0 ? (
        <p className="muted">Tap the odds to add a pick.</p>
      ) : (
        <SlipItems slip={slip} onRemove={onRemove} />
      )}
      <button className="place" disabled={slip.length === 0} onClick={onPlaceBet}>
        Place bet
      </button>
    </aside>
  );
}

const QUICK_STAKES = [10, 25, 50];

// New experience: quick stakes and a payout preview.
export function NewBetSlip({ slip, onRemove, onPlaceBet }) {
  const [stake, setStake] = useState(25);
  const totalStake = stake * slip.length;
  const totalPayout = slip.reduce((sum, item) => sum + payout(stake, item.odds), 0);

  return (
    <aside className="slip slip-new">
      <h2>
        Bet slip <span className="badge">New</span>
      </h2>
      {slip.length === 0 ? (
        <p className="muted">Tap the odds to add a pick.</p>
      ) : (
        <>
          <SlipItems slip={slip} onRemove={onRemove} stake={stake} />
          <div className="stakes">
            <span className="muted">Stake per pick</span>
            <div className="stake-buttons">
              {QUICK_STAKES.map((amount) => (
                <button
                  key={amount}
                  className={amount === stake ? "stake active" : "stake"}
                  onClick={() => setStake(amount)}
                >
                  ${amount}
                </button>
              ))}
            </div>
          </div>
          <div className="totals">
            <span>Total stake</span>
            <strong>{money(totalStake)}</strong>
          </div>
          <div className="totals">
            <span>Potential payout</span>
            <strong className="win">{money(totalPayout)}</strong>
          </div>
        </>
      )}
      <button className="place" disabled={slip.length === 0} onClick={onPlaceBet}>
        {slip.length === 0 ? "Place bet" : `Place ${money(totalStake)} bet`}
      </button>
    </aside>
  );
}

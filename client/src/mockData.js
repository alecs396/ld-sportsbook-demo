// Mock pregame lines. Odds are American moneyline (+150 means a $100 bet wins $150).
export const games = [
  {
    id: "sb-final",
    league: "Championship",
    kickoff: "Sun 6:30 PM",
    away: { team: "Kansas City", odds: 115 },
    home: { team: "Philadelphia", odds: -135 },
  },
  {
    id: "nba-1",
    league: "Basketball",
    kickoff: "Sat 7:00 PM",
    away: { team: "Boston", odds: -160 },
    home: { team: "Denver", odds: 140 },
  },
  {
    id: "nhl-1",
    league: "Hockey",
    kickoff: "Sat 4:00 PM",
    away: { team: "Las Vegas", odds: 105 },
    home: { team: "New Jersey", odds: -125 },
  },
];

export function formatOdds(odds) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

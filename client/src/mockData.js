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

// Mock in-game data for the live betting panel (flag "live-betting").
export const liveGame = {
  id: "sb-live",
  league: "Championship",
  clock: "Q3 08:42",
  away: { team: "Kansas City", score: 17, odds: 140 },
  home: { team: "Philadelphia", score: 20, odds: -165 },
  nextScore: [
    { id: "kc-td", label: "Kansas City touchdown", odds: 175 },
    { id: "kc-fg", label: "Kansas City field goal", odds: 320 },
    { id: "phi-td", label: "Philadelphia touchdown", odds: 190 },
    { id: "phi-fg", label: "Philadelphia field goal", odds: 300 },
  ],
};

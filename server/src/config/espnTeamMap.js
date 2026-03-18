// ESPN team ID → Odds API team name mapping
// Used by injury sync to correlate ESPN depth chart data with our games table

export const ESPN_TEAMS = {
  basketball_nba: {
    '1':  'Atlanta Hawks',
    '2':  'Boston Celtics',
    '17': 'Brooklyn Nets',
    '30': 'Charlotte Hornets',
    '4':  'Chicago Bulls',
    '5':  'Cleveland Cavaliers',
    '6':  'Dallas Mavericks',
    '7':  'Denver Nuggets',
    '8':  'Detroit Pistons',
    '9':  'Golden State Warriors',
    '10': 'Houston Rockets',
    '11': 'Indiana Pacers',
    '12': 'Los Angeles Clippers',
    '13': 'Los Angeles Lakers',
    '29': 'Memphis Grizzlies',
    '14': 'Miami Heat',
    '15': 'Milwaukee Bucks',
    '16': 'Minnesota Timberwolves',
    '3':  'New Orleans Pelicans',
    '18': 'New York Knicks',
    '25': 'Oklahoma City Thunder',
    '19': 'Orlando Magic',
    '20': 'Philadelphia 76ers',
    '21': 'Phoenix Suns',
    '22': 'Portland Trail Blazers',
    '23': 'Sacramento Kings',
    '24': 'San Antonio Spurs',
    '26': 'Toronto Raptors',
    '27': 'Utah Jazz',
    '28': 'Washington Wizards',
  },
  basketball_wnba: {
    '20':     'Atlanta Dream',
    '19':     'Chicago Sky',
    '18':     'Connecticut Sun',
    '3':      'Dallas Wings',
    '129689': 'Golden State Valkyries',
    '5':      'Indiana Fever',
    '17':     'Las Vegas Aces',
    '6':      'Los Angeles Sparks',
    '8':      'Minnesota Lynx',
    '9':      'New York Liberty',
    '11':     'Phoenix Mercury',
    '14':     'Seattle Storm',
    '16':     'Washington Mystics',
  },
  americanfootball_nfl: {
    '22': 'Arizona Cardinals',
    '1':  'Atlanta Falcons',
    '33': 'Baltimore Ravens',
    '2':  'Buffalo Bills',
    '29': 'Carolina Panthers',
    '3':  'Chicago Bears',
    '4':  'Cincinnati Bengals',
    '5':  'Cleveland Browns',
    '6':  'Dallas Cowboys',
    '7':  'Denver Broncos',
    '8':  'Detroit Lions',
    '9':  'Green Bay Packers',
    '34': 'Houston Texans',
    '11': 'Indianapolis Colts',
    '30': 'Jacksonville Jaguars',
    '12': 'Kansas City Chiefs',
    '13': 'Las Vegas Raiders',
    '24': 'Los Angeles Chargers',
    '14': 'Los Angeles Rams',
    '15': 'Miami Dolphins',
    '16': 'Minnesota Vikings',
    '17': 'New England Patriots',
    '18': 'New Orleans Saints',
    '19': 'New York Giants',
    '20': 'New York Jets',
    '21': 'Philadelphia Eagles',
    '23': 'Pittsburgh Steelers',
    '25': 'San Francisco 49ers',
    '26': 'Seattle Seahawks',
    '27': 'Tampa Bay Buccaneers',
    '10': 'Tennessee Titans',
    '28': 'Washington Commanders',
  },
}

// Reverse lookup: ODDS_TO_ESPN[sportKey][teamName] → espnId
export const ODDS_TO_ESPN = {}
for (const [sportKey, teams] of Object.entries(ESPN_TEAMS)) {
  ODDS_TO_ESPN[sportKey] = {}
  for (const [espnId, teamName] of Object.entries(teams)) {
    ODDS_TO_ESPN[sportKey][teamName] = espnId
  }
}

// Maps sport_key → ESPN API path segment
export const INJURY_SPORTS = {
  basketball_nba: 'basketball/nba',
  basketball_wnba: 'basketball/wnba',
  americanfootball_nfl: 'football/nfl',
}

// Sports that show starting lineups (basketball = starting 5)
export const BASKETBALL_SPORTS = new Set(['basketball_nba', 'basketball_wnba'])

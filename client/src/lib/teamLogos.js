// ESPN CDN team logo URLs
// Format: https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png

import { getCountryFlagUrl } from './countryFlag'

const NHL_ABBRS = {
  'Anaheim Ducks': 'ana', 'Arizona Coyotes': 'ari', 'Boston Bruins': 'bos',
  'Buffalo Sabres': 'buf', 'Calgary Flames': 'cgy', 'Carolina Hurricanes': 'car',
  'Chicago Blackhawks': 'chi', 'Colorado Avalanche': 'col', 'Columbus Blue Jackets': 'cbj',
  'Dallas Stars': 'dal', 'Detroit Red Wings': 'det', 'Edmonton Oilers': 'edm',
  'Florida Panthers': 'fla', 'Los Angeles Kings': 'la', 'Minnesota Wild': 'min',
  'Montreal Canadiens': 'mon', 'Montréal Canadiens': 'mon',
  'Nashville Predators': 'nsh', 'New Jersey Devils': 'njd',
  'New York Islanders': 'nyi', 'New York Rangers': 'nyr', 'Ottawa Senators': 'ott',
  'Philadelphia Flyers': 'phi', 'Pittsburgh Penguins': 'pit', 'San Jose Sharks': 'sj',
  'Seattle Kraken': 'sea', 'St. Louis Blues': 'stl', 'St Louis Blues': 'stl',
  'Tampa Bay Lightning': 'tb', 'Toronto Maple Leafs': 'tor',
  'Utah Hockey Club': 'uta', 'Utah Mammoth': 'uta',
  'Vancouver Canucks': 'van', 'Vegas Golden Knights': 'vgk', 'Washington Capitals': 'wsh',
  'Winnipeg Jets': 'wpg',
}

const NBA_ABBRS = {
  'Atlanta Hawks': 'atl', 'Boston Celtics': 'bos', 'Brooklyn Nets': 'bkn',
  'Charlotte Hornets': 'cha', 'Chicago Bulls': 'chi', 'Cleveland Cavaliers': 'cle',
  'Dallas Mavericks': 'dal', 'Denver Nuggets': 'den', 'Detroit Pistons': 'det',
  'Golden State Warriors': 'gs', 'Houston Rockets': 'hou', 'Indiana Pacers': 'ind',
  'LA Clippers': 'lac', 'Los Angeles Clippers': 'lac', 'Los Angeles Lakers': 'lal',
  'LA Lakers': 'lal', 'Memphis Grizzlies': 'mem', 'Miami Heat': 'mia',
  'Milwaukee Bucks': 'mil', 'Minnesota Timberwolves': 'min', 'New Orleans Pelicans': 'no',
  'New York Knicks': 'ny', 'Oklahoma City Thunder': 'okc', 'Orlando Magic': 'orl',
  'Philadelphia 76ers': 'phi', 'Phoenix Suns': 'phx', 'Portland Trail Blazers': 'por',
  'Sacramento Kings': 'sac', 'San Antonio Spurs': 'sa', 'Toronto Raptors': 'tor',
  'Utah Jazz': 'utah', 'Washington Wizards': 'wsh',
}

const MLB_ABBRS = {
  'Arizona Diamondbacks': 'ari', 'Atlanta Braves': 'atl', 'Baltimore Orioles': 'bal',
  'Boston Red Sox': 'bos', 'Chicago Cubs': 'chc', 'Chicago White Sox': 'chw',
  'Cincinnati Reds': 'cin', 'Cleveland Guardians': 'cle', 'Colorado Rockies': 'col',
  'Detroit Tigers': 'det', 'Houston Astros': 'hou', 'Kansas City Royals': 'kc',
  'Los Angeles Angels': 'laa', 'Los Angeles Dodgers': 'lad', 'Miami Marlins': 'mia',
  'Milwaukee Brewers': 'mil', 'Minnesota Twins': 'min', 'New York Mets': 'nym',
  'New York Yankees': 'nyy', 'Oakland Athletics': 'oak', 'Athletics': 'oak', 'Philadelphia Phillies': 'phi',
  'Pittsburgh Pirates': 'pit', 'San Diego Padres': 'sd', 'San Francisco Giants': 'sf',
  'Seattle Mariners': 'sea', 'St. Louis Cardinals': 'stl', 'St Louis Cardinals': 'stl',
  'Tampa Bay Rays': 'tb', 'Texas Rangers': 'tex', 'Toronto Blue Jays': 'tor',
  'Washington Nationals': 'wsh',
}

const NFL_ABBRS = {
  'Arizona Cardinals': 'ari', 'Atlanta Falcons': 'atl', 'Baltimore Ravens': 'bal',
  'Buffalo Bills': 'buf', 'Carolina Panthers': 'car', 'Chicago Bears': 'chi',
  'Cincinnati Bengals': 'cin', 'Cleveland Browns': 'cle', 'Dallas Cowboys': 'dal',
  'Denver Broncos': 'den', 'Detroit Lions': 'det', 'Green Bay Packers': 'gb',
  'Houston Texans': 'hou', 'Indianapolis Colts': 'ind', 'Jacksonville Jaguars': 'jax',
  'Kansas City Chiefs': 'kc', 'Las Vegas Raiders': 'lv', 'Los Angeles Chargers': 'lac',
  'Los Angeles Rams': 'lar', 'Miami Dolphins': 'mia', 'Minnesota Vikings': 'min',
  'New England Patriots': 'ne', 'New Orleans Saints': 'no', 'New York Giants': 'nyg',
  'New York Jets': 'nyj', 'Philadelphia Eagles': 'phi', 'Pittsburgh Steelers': 'pit',
  'San Francisco 49ers': 'sf', 'Seattle Seahawks': 'sea', 'Tampa Bay Buccaneers': 'tb',
  'Tennessee Titans': 'ten', 'Washington Commanders': 'wsh',
}

const WNBA_ABBRS = {
  'Atlanta Dream': 'atl', 'Chicago Sky': 'chi', 'Connecticut Sun': 'conn',
  'Dallas Wings': 'dal', 'Golden State Valkyries': 'gs', 'Indiana Fever': 'ind',
  'Las Vegas Aces': 'lv', 'Los Angeles Sparks': 'la', 'Minnesota Lynx': 'min',
  'New York Liberty': 'ny', 'Phoenix Mercury': 'phx', 'Portland Fire': 'por',
  'Seattle Storm': 'sea', 'Toronto Tempo': 'tor', 'Washington Mystics': 'wsh',
}

// NCAA uses numeric ESPN team IDs instead of abbreviations
const NCAAF_IDS = {
  'Auburn Tigers': 2, 'Baylor Bears': 239, 'California Golden Bears': 25,
  'Clemson Tigers': 228, 'LSU Tigers': 99, 'Louisville Cardinals': 97,
  'Michigan Wolverines': 130, 'NC State Wolfpack': 152,
  'North Carolina Tar Heels': 153, 'Notre Dame Fighting Irish': 87,
  'Ohio State Buckeyes': 194, 'Oklahoma Sooners': 201, 'Ole Miss Rebels': 145,
  'TCU Horned Frogs': 2628, 'Texas Longhorns': 251, 'UCLA Bruins': 26,
  'Virginia Cavaliers': 258, 'Wisconsin Badgers': 275,
  // Additional FBS teams (will appear as games are added)
  'Alabama Crimson Tide': 333, 'Arizona State Sun Devils': 9, 'Arizona Wildcats': 12,
  'Arkansas Razorbacks': 8, 'BYU Cougars': 252, 'Cincinnati Bearcats': 2132,
  'Colorado Buffaloes': 38, 'Duke Blue Devils': 150, 'Florida Gators': 57,
  'Florida State Seminoles': 52, 'Georgia Bulldogs': 61, 'Georgia Tech Yellow Jackets': 59,
  'Houston Cougars': 248, 'Illinois Fighting Illini': 356, 'Indiana Hoosiers': 84,
  'Iowa Hawkeyes': 2294, 'Iowa State Cyclones': 66, 'Kansas Jayhawks': 2305,
  'Kansas State Wildcats': 2306, 'Kentucky Wildcats': 96, 'Maryland Terrapins': 120,
  'Miami Hurricanes': 2390, 'Michigan State Spartans': 127, 'Minnesota Golden Gophers': 135,
  'Mississippi State Bulldogs': 344, 'Missouri Tigers': 142, 'Nebraska Cornhuskers': 158,
  'Northwestern Wildcats': 77, 'Oklahoma State Cowboys': 197, 'Oregon Ducks': 2483,
  'Oregon State Beavers': 204, 'Penn State Nittany Lions': 213, 'Pittsburgh Panthers': 221,
  'Purdue Boilermakers': 2509, 'Rutgers Scarlet Knights': 164, 'SMU Mustangs': 2567,
  'South Carolina Gamecocks': 2579, 'Stanford Cardinal': 24, 'Syracuse Orange': 183,
  'Tennessee Volunteers': 2633, 'Texas A&M Aggies': 245, 'Texas Tech Red Raiders': 2641,
  'UCF Knights': 2116, 'USC Trojans': 30, 'Utah Utes': 254,
  'Vanderbilt Commodores': 238, 'Virginia Tech Hokies': 259, 'Wake Forest Demon Deacons': 154,
  'Washington Huskies': 264, 'Washington State Cougars': 265, 'West Virginia Mountaineers': 277,
}

const UFL_ABBRS = {
  'Birmingham Stallions': 'bham', 'Columbus Aviators': 'clb',
  'DC Defenders': 'dc', 'DC DEFENDERS': 'dc',
  'Dallas Renegades': 'dal', 'Houston Gamblers': 'hou',
  'Louisville Kings': 'lou', 'Orlando Storm': 'orl',
  'St. Louis Battlehawks': 'stl', 'St Louis Battlehawks': 'stl',
}

const SPORT_MAP = {
  icehockey_nhl: { abbrs: NHL_ABBRS, sport: 'nhl' },
  basketball_nba: { abbrs: NBA_ABBRS, sport: 'nba' },
  baseball_mlb: { abbrs: MLB_ABBRS, sport: 'mlb' },
  americanfootball_nfl: { abbrs: NFL_ABBRS, sport: 'nfl' },
  basketball_wnba: { abbrs: WNBA_ABBRS, sport: 'wnba' },
  americanfootball_ufl: { abbrs: UFL_ABBRS, sport: 'ufl' },
  americanfootball_ncaaf: { ids: NCAAF_IDS, sport: 'ncaa' },
  basketball_ncaab: { ids: NCAAF_IDS, sport: 'ncaa' },
  basketball_wncaab: { ids: NCAAF_IDS, sport: 'ncaa' },
}

// Canonical 3-letter team abbreviations for display (e.g. prop card
// headers). Distinct from the logo-URL slugs above because ESPN's logo
// CDN uses shorter codes (gs, ny, no, sa, la, sj, tb) than the standard
// sports-broadcast abbreviations (GSW, NYK, NOP, SAS, LAK, SJS, TBL).
// Names are unique strings across sports so no sport key is needed.
const CANONICAL_ABBRS = {
  // NBA
  'Atlanta Hawks': 'ATL', 'Boston Celtics': 'BOS', 'Brooklyn Nets': 'BKN',
  'Charlotte Hornets': 'CHA', 'Chicago Bulls': 'CHI', 'Cleveland Cavaliers': 'CLE',
  'Dallas Mavericks': 'DAL', 'Denver Nuggets': 'DEN', 'Detroit Pistons': 'DET',
  'Golden State Warriors': 'GSW', 'Houston Rockets': 'HOU', 'Indiana Pacers': 'IND',
  'LA Clippers': 'LAC', 'Los Angeles Clippers': 'LAC', 'Los Angeles Lakers': 'LAL',
  'LA Lakers': 'LAL', 'Memphis Grizzlies': 'MEM', 'Miami Heat': 'MIA',
  'Milwaukee Bucks': 'MIL', 'Minnesota Timberwolves': 'MIN', 'New Orleans Pelicans': 'NOP',
  'New York Knicks': 'NYK', 'Oklahoma City Thunder': 'OKC', 'Orlando Magic': 'ORL',
  'Philadelphia 76ers': 'PHI', 'Phoenix Suns': 'PHX', 'Portland Trail Blazers': 'POR',
  'Sacramento Kings': 'SAC', 'San Antonio Spurs': 'SAS', 'Toronto Raptors': 'TOR',
  'Utah Jazz': 'UTA', 'Washington Wizards': 'WAS',
  // NHL
  'Anaheim Ducks': 'ANA', 'Arizona Coyotes': 'ARI', 'Boston Bruins': 'BOS',
  'Buffalo Sabres': 'BUF', 'Calgary Flames': 'CGY', 'Carolina Hurricanes': 'CAR',
  'Chicago Blackhawks': 'CHI', 'Colorado Avalanche': 'COL', 'Columbus Blue Jackets': 'CBJ',
  'Dallas Stars': 'DAL', 'Detroit Red Wings': 'DET', 'Edmonton Oilers': 'EDM',
  'Florida Panthers': 'FLA', 'Los Angeles Kings': 'LAK', 'Minnesota Wild': 'MIN',
  'Montreal Canadiens': 'MTL', 'Montréal Canadiens': 'MTL',
  'Nashville Predators': 'NSH', 'New Jersey Devils': 'NJD',
  'New York Islanders': 'NYI', 'New York Rangers': 'NYR', 'Ottawa Senators': 'OTT',
  'Philadelphia Flyers': 'PHI', 'Pittsburgh Penguins': 'PIT', 'San Jose Sharks': 'SJS',
  'Seattle Kraken': 'SEA', 'St. Louis Blues': 'STL', 'St Louis Blues': 'STL',
  'Tampa Bay Lightning': 'TBL', 'Toronto Maple Leafs': 'TOR',
  'Utah Hockey Club': 'UTA', 'Utah Mammoth': 'UTA',
  'Vancouver Canucks': 'VAN', 'Vegas Golden Knights': 'VGK', 'Washington Capitals': 'WSH',
  'Winnipeg Jets': 'WPG',
  // MLB
  'Arizona Diamondbacks': 'ARI', 'Atlanta Braves': 'ATL', 'Baltimore Orioles': 'BAL',
  'Boston Red Sox': 'BOS', 'Chicago Cubs': 'CHC', 'Chicago White Sox': 'CHW',
  'Cincinnati Reds': 'CIN', 'Cleveland Guardians': 'CLE', 'Colorado Rockies': 'COL',
  'Detroit Tigers': 'DET', 'Houston Astros': 'HOU', 'Kansas City Royals': 'KC',
  'Los Angeles Angels': 'LAA', 'Los Angeles Dodgers': 'LAD', 'Miami Marlins': 'MIA',
  'Milwaukee Brewers': 'MIL', 'Minnesota Twins': 'MIN', 'New York Mets': 'NYM',
  'New York Yankees': 'NYY', 'Oakland Athletics': 'ATH', 'Athletics': 'ATH',
  'Philadelphia Phillies': 'PHI', 'Pittsburgh Pirates': 'PIT', 'San Diego Padres': 'SD',
  'San Francisco Giants': 'SF', 'Seattle Mariners': 'SEA',
  'St. Louis Cardinals': 'STL', 'St Louis Cardinals': 'STL',
  'Tampa Bay Rays': 'TB', 'Texas Rangers': 'TEX', 'Toronto Blue Jays': 'TOR',
  'Washington Nationals': 'WSH',
  // NFL
  'Arizona Cardinals': 'ARI', 'Atlanta Falcons': 'ATL', 'Baltimore Ravens': 'BAL',
  'Buffalo Bills': 'BUF', 'Carolina Panthers': 'CAR', 'Chicago Bears': 'CHI',
  'Cincinnati Bengals': 'CIN', 'Cleveland Browns': 'CLE', 'Dallas Cowboys': 'DAL',
  'Denver Broncos': 'DEN', 'Detroit Lions': 'DET', 'Green Bay Packers': 'GB',
  'Houston Texans': 'HOU', 'Indianapolis Colts': 'IND', 'Jacksonville Jaguars': 'JAX',
  'Kansas City Chiefs': 'KC', 'Las Vegas Raiders': 'LV', 'Los Angeles Chargers': 'LAC',
  'Los Angeles Rams': 'LAR', 'Miami Dolphins': 'MIA', 'Minnesota Vikings': 'MIN',
  'New England Patriots': 'NE', 'New Orleans Saints': 'NO', 'New York Giants': 'NYG',
  'New York Jets': 'NYJ', 'Philadelphia Eagles': 'PHI', 'Pittsburgh Steelers': 'PIT',
  'San Francisco 49ers': 'SF', 'Seattle Seahawks': 'SEA', 'Tampa Bay Buccaneers': 'TB',
  'Tennessee Titans': 'TEN', 'Washington Commanders': 'WSH',
  // WNBA
  'Atlanta Dream': 'ATL', 'Chicago Sky': 'CHI', 'Connecticut Sun': 'CONN',
  'Dallas Wings': 'DAL', 'Golden State Valkyries': 'GSV', 'Indiana Fever': 'IND',
  'Las Vegas Aces': 'LV', 'Los Angeles Sparks': 'LA', 'Minnesota Lynx': 'MIN',
  'New York Liberty': 'NY', 'Phoenix Mercury': 'PHX', 'Portland Fire': 'POR',
  'Seattle Storm': 'SEA', 'Toronto Tempo': 'TOR', 'Washington Mystics': 'WAS',
  // UFL
  'Birmingham Stallions': 'BHM', 'Columbus Aviators': 'CLB',
  'DC Defenders': 'DC', 'DC DEFENDERS': 'DC',
  'Dallas Renegades': 'DAL', 'Houston Gamblers': 'HOU',
  'Louisville Kings': 'LOU', 'Orlando Storm': 'ORL',
  'St. Louis Battlehawks': 'STL', 'St Louis Battlehawks': 'STL',
}

export function getTeamAbbr(teamName) {
  if (!teamName) return ''
  return CANONICAL_ABBRS[teamName] || null
}

export function getTeamLogoUrl(teamName, sportKey) {
  // World Cup teams are countries — ESPN serves flags from a separate path
  // (i/teamlogos/countries/...) and there's no "dark" variant. Delegate to the
  // country-flag resolver so we don't end up looking for esp.png under nba/.
  if (sportKey === 'soccer_world_cup') {
    return getCountryFlagUrl(teamName)
  }
  const config = SPORT_MAP[sportKey]
  if (!config) return null
  // NCAA uses numeric IDs: /i/teamlogos/ncaa/500/{id}.png
  if (config.ids) {
    const id = config.ids[teamName]
    if (!id) return null
    return `https://a.espncdn.com/i/teamlogos/${config.sport}/500-dark/${id}.png`
  }
  const abbr = config.abbrs[teamName]
  if (!abbr) return null
  return `https://a.espncdn.com/i/teamlogos/${config.sport}/500-dark/${abbr}.png`
}

// Standard (non-dark) URL as fallback
export function getTeamLogoFallbackUrl(teamName, sportKey) {
  if (sportKey === 'soccer_world_cup') {
    // Countries already use the standard (non-dark) URL — no fallback variant.
    return null
  }
  const config = SPORT_MAP[sportKey]
  if (!config) return null
  if (config.ids) {
    const id = config.ids[teamName]
    if (!id) return null
    return `https://a.espncdn.com/i/teamlogos/${config.sport}/500/${id}.png`
  }
  const abbr = config.abbrs[teamName]
  if (!abbr) return null
  return `https://a.espncdn.com/i/teamlogos/${config.sport}/500/${abbr}.png`
}

// ESPN CDN team logo URLs
// Format: https://a.espncdn.com/i/teamlogos/{sport}/500/{abbr}.png

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
  'New York Liberty': 'ny', 'Phoenix Mercury': 'phx', 'Seattle Storm': 'sea',
  'Washington Mystics': 'wsh',
}

const SPORT_MAP = {
  icehockey_nhl: { abbrs: NHL_ABBRS, sport: 'nhl' },
  basketball_nba: { abbrs: NBA_ABBRS, sport: 'nba' },
  baseball_mlb: { abbrs: MLB_ABBRS, sport: 'mlb' },
  americanfootball_nfl: { abbrs: NFL_ABBRS, sport: 'nfl' },
  basketball_wnba: { abbrs: WNBA_ABBRS, sport: 'wnba' },
}

export function getTeamLogoUrl(teamName, sportKey) {
  const config = SPORT_MAP[sportKey]
  if (!config) return null
  const abbr = config.abbrs[teamName]
  if (!abbr) return null
  return `https://a.espncdn.com/i/teamlogos/${config.sport}/500/${abbr}.png`
}

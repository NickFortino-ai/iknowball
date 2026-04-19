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

const SPORT_MAP = {
  icehockey_nhl: { abbrs: NHL_ABBRS, sport: 'nhl' },
  basketball_nba: { abbrs: NBA_ABBRS, sport: 'nba' },
  baseball_mlb: { abbrs: MLB_ABBRS, sport: 'mlb' },
  americanfootball_nfl: { abbrs: NFL_ABBRS, sport: 'nfl' },
  basketball_wnba: { abbrs: WNBA_ABBRS, sport: 'wnba' },
  americanfootball_ncaaf: { ids: NCAAF_IDS, sport: 'ncaa' },
}

export function getTeamLogoUrl(teamName, sportKey) {
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

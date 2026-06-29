// NCAAF team prestige tiers — used to sort the picks page so marquee
// matchups float to the top of each day's slate. Static map (not
// AP-rankings dynamic) because we want predictable Power-4-first
// ordering, not a polls-of-the-week roller coaster.
//
//   Tier 5 — top ~20 historical brands
//   Tier 4 — rest of Power 4 + Notre Dame
//   Tier 3 — top G5
//   Tier 2 — rest of G5
//   Tier 1 — unknown (FCS, edge cases) — handled as default

const TIER_5 = new Set([
  'Alabama Crimson Tide',
  'Ohio State Buckeyes',
  'Georgia Bulldogs',
  'Texas Longhorns',
  'Oklahoma Sooners',
  'Michigan Wolverines',
  'USC Trojans',
  'Penn State Nittany Lions',
  'Notre Dame Fighting Irish',
  'LSU Tigers',
  'Florida Gators',
  'Tennessee Volunteers',
  'Auburn Tigers',
  'Oregon Ducks',
  'Clemson Tigers',
  'Miami Hurricanes',
  'Florida State Seminoles',
  'Texas A&M Aggies',
  'Wisconsin Badgers',
  'Washington Huskies',
])

const TIER_4 = new Set([
  // Rest of SEC
  'Arkansas Razorbacks', 'Kentucky Wildcats', 'Mississippi State Bulldogs',
  'Missouri Tigers', 'Ole Miss Rebels', 'South Carolina Gamecocks',
  'Vanderbilt Commodores',
  // Rest of Big Ten
  'Illinois Fighting Illini', 'Indiana Hoosiers', 'Iowa Hawkeyes',
  'Maryland Terrapins', 'Michigan State Spartans', 'Minnesota Golden Gophers',
  'Nebraska Cornhuskers', 'Northwestern Wildcats', 'Purdue Boilermakers',
  'Rutgers Scarlet Knights', 'UCLA Bruins',
  // Rest of ACC
  'Boston College Eagles', 'California Golden Bears', 'Duke Blue Devils',
  'Georgia Tech Yellow Jackets', 'Louisville Cardinals', 'NC State Wolfpack',
  'North Carolina Tar Heels', 'Pittsburgh Panthers', 'SMU Mustangs',
  'Stanford Cardinal', 'Syracuse Orange', 'Virginia Cavaliers',
  'Virginia Tech Hokies', 'Wake Forest Demon Deacons',
  // Rest of Big 12
  'Arizona Wildcats', 'Arizona State Sun Devils', 'Baylor Bears',
  'BYU Cougars', 'Cincinnati Bearcats', 'Colorado Buffaloes',
  'Houston Cougars', 'Iowa State Cyclones', 'Kansas Jayhawks',
  'Kansas State Wildcats', 'Oklahoma State Cowboys', 'TCU Horned Frogs',
  'Texas Tech Red Raiders', 'UCF Knights', 'Utah Utes',
  'West Virginia Mountaineers',
])

const TIER_3 = new Set([
  // Top G5 — programs with national relevance / playoff appearances
  'Boise State Broncos', 'Memphis Tigers', 'Tulane Green Wave',
  'Liberty Flames', 'App State Mountaineers', 'James Madison Dukes',
  'Air Force Falcons', 'Navy Midshipmen', 'Army Black Knights',
])

function tierFor(team) {
  if (!team) return 1
  if (TIER_5.has(team)) return 5
  if (TIER_4.has(team)) return 4
  if (TIER_3.has(team)) return 3
  // Everything else FBS-ish (Sun Belt, MAC tail, Conf USA, smaller G5) — Tier 2
  return 2
}

/** Sum of both teams' tier scores. Higher = more marquee matchup. */
export function getNcaafGamePrestige(game) {
  if (!game) return 0
  return tierFor(game.home_team) + tierFor(game.away_team)
}

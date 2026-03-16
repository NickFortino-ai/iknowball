import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { supabase } from '../config/supabase.js'

const router = Router()

// Static fallback team lists for when no games exist in the DB (offseason)
export const FALLBACK_TEAMS = {
  basketball_nba: [
    'Atlanta Hawks', 'Boston Celtics', 'Brooklyn Nets', 'Charlotte Hornets',
    'Chicago Bulls', 'Cleveland Cavaliers', 'Dallas Mavericks', 'Denver Nuggets',
    'Detroit Pistons', 'Golden State Warriors', 'Houston Rockets', 'Indiana Pacers',
    'LA Clippers', 'Los Angeles Lakers', 'Memphis Grizzlies', 'Miami Heat',
    'Milwaukee Bucks', 'Minnesota Timberwolves', 'New Orleans Pelicans', 'New York Knicks',
    'Oklahoma City Thunder', 'Orlando Magic', 'Philadelphia 76ers', 'Phoenix Suns',
    'Portland Trail Blazers', 'Sacramento Kings', 'San Antonio Spurs', 'Toronto Raptors',
    'Utah Jazz', 'Washington Wizards',
  ],
  basketball_wnba: [
    'Atlanta Dream', 'Chicago Sky', 'Connecticut Sun', 'Dallas Wings',
    'Golden State Valkyries', 'Indiana Fever', 'Las Vegas Aces', 'Los Angeles Sparks',
    'Minnesota Lynx', 'New York Liberty', 'Phoenix Mercury', 'Seattle Storm',
    'Washington Mystics',
  ],
  basketball_ncaab: [
    'Alabama Crimson Tide', 'Arizona Wildcats', 'Arkansas Razorbacks', 'Auburn Tigers',
    'Baylor Bears', 'BYU Cougars', 'Cincinnati Bearcats', 'Colorado Buffaloes',
    'Connecticut Huskies', 'Creighton Bluejays', 'Duke Blue Devils', 'Florida Gators',
    'Gonzaga Bulldogs', 'Houston Cougars', 'Illinois Fighting Illini', 'Indiana Hoosiers',
    'Iowa Hawkeyes', 'Iowa State Cyclones', 'Kansas Jayhawks', 'Kansas State Wildcats',
    'Kentucky Wildcats', 'Louisville Cardinals', 'Marquette Golden Eagles', 'Maryland Terrapins',
    'Memphis Tigers', 'Miami Hurricanes', 'Michigan State Spartans', 'Michigan Wolverines',
    'Mississippi State Bulldogs', 'Missouri Tigers', 'NC State Wolfpack', 'North Carolina Tar Heels',
    'Northwestern Wildcats', 'Ohio State Buckeyes', 'Oklahoma Sooners', 'Oregon Ducks',
    'Purdue Boilermakers', 'San Diego State Aztecs', 'St. John\'s Red Storm', 'Syracuse Orange',
    'TCU Horned Frogs', 'Tennessee Volunteers', 'Texas Longhorns', 'Texas A&M Aggies',
    'Texas Tech Red Raiders', 'UCLA Bruins', 'USC Trojans', 'Villanova Wildcats',
    'Virginia Cavaliers', 'West Virginia Mountaineers', 'Wisconsin Badgers', 'Xavier Musketeers',
  ],
  basketball_wncaab: [
    'Alabama Crimson Tide', 'Arizona Wildcats', 'Arkansas Razorbacks', 'Auburn Tigers',
    'Baylor Bears', 'BYU Cougars', 'California Golden Bears', 'Colorado Buffaloes',
    'Colorado State Rams', 'Connecticut Huskies', 'Creighton Bluejays', 'Drake Bulldogs',
    'Duke Blue Devils', 'Florida Gulf Coast Eagles', 'Florida State Seminoles',
    'Georgia Bulldogs', 'Georgia Tech Yellow Jackets', 'Gonzaga Bulldogs', 'Green Bay Phoenix',
    'High Point Panthers', 'Illinois Fighting Illini', 'Indiana Hoosiers', 'Iowa Hawkeyes',
    'Iowa State Cyclones', 'JMU Dukes', 'Kansas Jayhawks', 'Kansas State Wildcats',
    'Kentucky Wildcats', 'Louisville Cardinals', 'LSU Tigers', 'Marquette Golden Eagles',
    'Maryland Terrapins', 'Miami Hurricanes', 'Michigan Wolverines', 'Michigan State Spartans',
    'Mississippi State Bulldogs', 'Missouri Tigers', 'NC State Wolfpack', 'Nebraska Cornhuskers',
    'North Carolina Tar Heels', 'Notre Dame Fighting Irish', 'Ohio State Buckeyes',
    'Oklahoma Sooners', 'Oklahoma State Cowgirls', 'Ole Miss Rebels', 'Oregon Ducks',
    'Oregon State Beavers', 'Princeton Tigers', 'Purdue Boilermakers', 'Rice Owls',
    'Rutgers Scarlet Knights', 'Saint Louis Billikens', 'South Carolina Gamecocks',
    'South Dakota State Jackrabbits', 'Stanford Cardinal', 'Syracuse Orange',
    'TCU Horned Frogs', 'Tennessee Lady Vols', 'Texas Longhorns', 'Texas A&M Aggies',
    'UCLA Bruins', 'UNLV Rebels', 'USC Trojans', 'Utah Utes', 'Vanderbilt Commodores',
    'Villanova Wildcats', 'Virginia Tech Hokies', 'West Virginia Mountaineers',
    'Wisconsin Badgers',
  ],
  americanfootball_nfl: [
    'Arizona Cardinals', 'Atlanta Falcons', 'Baltimore Ravens', 'Buffalo Bills',
    'Carolina Panthers', 'Chicago Bears', 'Cincinnati Bengals', 'Cleveland Browns',
    'Dallas Cowboys', 'Denver Broncos', 'Detroit Lions', 'Green Bay Packers',
    'Houston Texans', 'Indianapolis Colts', 'Jacksonville Jaguars', 'Kansas City Chiefs',
    'Las Vegas Raiders', 'Los Angeles Chargers', 'Los Angeles Rams', 'Miami Dolphins',
    'Minnesota Vikings', 'New England Patriots', 'New Orleans Saints', 'New York Giants',
    'New York Jets', 'Philadelphia Eagles', 'Pittsburgh Steelers', 'San Francisco 49ers',
    'Seattle Seahawks', 'Tampa Bay Buccaneers', 'Tennessee Titans', 'Washington Commanders',
  ],
  americanfootball_ncaaf: [
    'Alabama Crimson Tide', 'Arizona State Sun Devils', 'Arkansas Razorbacks', 'Auburn Tigers',
    'Boise State Broncos', 'BYU Cougars', 'Clemson Tigers', 'Colorado Buffaloes',
    'Florida Gators', 'Florida State Seminoles', 'Georgia Bulldogs', 'Indiana Hoosiers',
    'Iowa Hawkeyes', 'Iowa State Cyclones', 'Kansas State Wildcats', 'LSU Tigers',
    'Miami Hurricanes', 'Michigan Wolverines', 'Michigan State Spartans', 'Mississippi State Bulldogs',
    'Missouri Tigers', 'Notre Dame Fighting Irish', 'Ohio State Buckeyes', 'Oklahoma Sooners',
    'Ole Miss Rebels', 'Oregon Ducks', 'Oregon State Beavers', 'Penn State Nittany Lions',
    'SMU Mustangs', 'South Carolina Gamecocks', 'Tennessee Volunteers', 'Texas Longhorns',
    'Texas A&M Aggies', 'Texas Tech Red Raiders', 'Tulane Green Wave', 'UCLA Bruins',
    'USC Trojans', 'Utah Utes', 'Washington Huskies', 'Wisconsin Badgers',
  ],
  baseball_mlb: [
    'Arizona Diamondbacks', 'Atlanta Braves', 'Baltimore Orioles', 'Boston Red Sox',
    'Chicago Cubs', 'Chicago White Sox', 'Cincinnati Reds', 'Cleveland Guardians',
    'Colorado Rockies', 'Detroit Tigers', 'Houston Astros', 'Kansas City Royals',
    'Los Angeles Angels', 'Los Angeles Dodgers', 'Miami Marlins', 'Milwaukee Brewers',
    'Minnesota Twins', 'New York Mets', 'New York Yankees', 'Oakland Athletics',
    'Philadelphia Phillies', 'Pittsburgh Pirates', 'San Diego Padres', 'San Francisco Giants',
    'Seattle Mariners', 'St. Louis Cardinals', 'Tampa Bay Rays', 'Texas Rangers',
    'Toronto Blue Jays', 'Washington Nationals',
  ],
  icehockey_nhl: [
    'Anaheim Ducks', 'Arizona Coyotes', 'Boston Bruins', 'Buffalo Sabres',
    'Calgary Flames', 'Carolina Hurricanes', 'Chicago Blackhawks', 'Colorado Avalanche',
    'Columbus Blue Jackets', 'Dallas Stars', 'Detroit Red Wings', 'Edmonton Oilers',
    'Florida Panthers', 'Los Angeles Kings', 'Minnesota Wild', 'Montreal Canadiens',
    'Nashville Predators', 'New Jersey Devils', 'New York Islanders', 'New York Rangers',
    'Ottawa Senators', 'Philadelphia Flyers', 'Pittsburgh Penguins', 'San Jose Sharks',
    'Seattle Kraken', 'St. Louis Blues', 'Tampa Bay Lightning', 'Toronto Maple Leafs',
    'Utah Hockey Club', 'Vancouver Canucks', 'Vegas Golden Knights', 'Washington Capitals',
    'Winnipeg Jets',
  ],
  soccer_usa_mls: [
    'Atlanta United FC', 'Austin FC', 'CF Montreal', 'Charlotte FC',
    'Chicago Fire FC', 'Colorado Rapids', 'Columbus Crew', 'D.C. United',
    'FC Cincinnati', 'FC Dallas', 'Houston Dynamo FC', 'Inter Miami CF',
    'LA Galaxy', 'Los Angeles FC', 'Miami FC', 'Minnesota United FC',
    'Nashville SC', 'New England Revolution', 'New York City FC', 'New York Red Bulls',
    'Orlando City SC', 'Philadelphia Union', 'Portland Timbers', 'Real Salt Lake',
    'San Diego FC', 'San Jose Earthquakes', 'Seattle Sounders FC', 'Sporting Kansas City',
    'St. Louis City SC', 'Toronto FC', 'Vancouver Whitecaps FC',
  ],
}

router.get('/', requireAuth, async (req, res) => {
  const { sport } = req.query
  if (!sport) {
    return res.status(400).json({ error: 'sport query param is required' })
  }

  const { data: sportRow } = await supabase
    .from('sports')
    .select('id')
    .eq('key', sport)
    .single()

  if (!sportRow) {
    // No sport in DB — use fallback if available
    return res.json(FALLBACK_TEAMS[sport] || [])
  }

  const { data: games, error } = await supabase
    .from('games')
    .select('home_team, away_team')
    .eq('sport_id', sportRow.id)

  if (error) return res.json(FALLBACK_TEAMS[sport] || [])

  const teamSet = new Set()
  for (const g of games || []) {
    if (g.home_team) teamSet.add(g.home_team)
    if (g.away_team) teamSet.add(g.away_team)
  }

  // If games query returned teams, use them; otherwise fall back to static list
  if (teamSet.size > 0) {
    res.json([...teamSet].sort())
  } else {
    res.json(FALLBACK_TEAMS[sport] || [])
  }
})

export default router

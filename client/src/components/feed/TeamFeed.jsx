import { useState, useMemo, useEffect } from 'react'
import { useTeamsForSport, useTeamHotTakes, useSportHotTakes, useBookmarkStatus, useToggleBookmark } from '../../hooks/useHotTakes'
import { useActiveSports } from '../../hooks/useGames'
import { useFeedReactionsBatch } from '../../hooks/useSocial'
import TeamAutocomplete from './TeamAutocomplete'
import HotTakeComposer from './HotTakeComposer'
import HotTakeFeedCard from './HotTakeFeedCard'
import FeedSkeleton from './FeedSkeleton'

// Reverse lookup: team name → sport key (built from known team lists)
const TEAM_SPORT_MAP = {}
const SPORT_TEAMS = {
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
  basketball_wnba: [
    'Atlanta Dream', 'Chicago Sky', 'Connecticut Sun', 'Dallas Wings',
    'Golden State Valkyries', 'Indiana Fever', 'Las Vegas Aces', 'Los Angeles Sparks',
    'Minnesota Lynx', 'New York Liberty', 'Phoenix Mercury', 'Seattle Storm',
    'Washington Mystics',
  ],
}
for (const [sport, teams] of Object.entries(SPORT_TEAMS)) {
  for (const team of teams) TEAM_SPORT_MAP[team] = sport
}

const RECENT_TEAMS_KEY = 'iknowball_recent_teams'
const MAX_RECENT = 10

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNCAAB', key: 'basketball_wncaab' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NHL', key: 'icehockey_nhl' },
  { label: 'MLS', key: 'soccer_usa_mls' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

function getRecentTeams() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_TEAMS_KEY)) || []
  } catch {
    return []
  }
}

function addRecentTeam(teamName) {
  const recent = getRecentTeams().filter((t) => t !== teamName)
  recent.unshift(teamName)
  localStorage.setItem(RECENT_TEAMS_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)))
}

export default function TeamFeed({ onUserTap, initialTeam = null, initialSport = null, onTeamConsumed }) {
  const [selectedSport, setSelectedSport] = useState(initialSport)
  const [selectedTeam, setSelectedTeam] = useState(initialTeam)
  const [searchValue, setSearchValue] = useState('')
  const [recentTeams, setRecentTeams] = useState(getRecentTeams)

  // Handle initialTeam from query params — auto-select sport + team
  useEffect(() => {
    if (initialTeam) {
      setSelectedTeam(initialTeam)
      const sport = TEAM_SPORT_MAP[initialTeam]
      if (sport) setSelectedSport(sport)
      addRecentTeam(initialTeam)
      setRecentTeams(getRecentTeams())
      onTeamConsumed?.()
    }
  }, [initialTeam])

  const { data: activeSports } = useActiveSports()
  const { data: teams } = useTeamsForSport(selectedSport)
  const sportFeed = useSportHotTakes(selectedSport && !selectedTeam ? selectedSport : null)
  const teamFeed = useTeamHotTakes(selectedTeam)
  const activeFeed = selectedTeam ? teamFeed : sportFeed
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = activeFeed

  const sortedSportTabs = useMemo(() => {
    if (!activeSports?.length) return sportTabs
    const activeKeys = new Set(activeSports.map((s) => s.key))
    return [...sportTabs].sort((a, b) => {
      const aActive = activeKeys.has(a.key) ? 0 : 1
      const bActive = activeKeys.has(b.key) ? 0 : 1
      return aActive - bActive
    })
  }, [activeSports])

  const items = useMemo(() => {
    if (!data?.pages) return []
    return data.pages.flatMap((page) => page.items || [])
  }, [data])

  // Batch reactions for displayed items
  const reactionTargets = useMemo(() => {
    return items.map((item) => ({ target_type: 'hot_take', target_id: item.hot_take.id }))
  }, [items])

  const { data: reactionsBatch } = useFeedReactionsBatch(reactionTargets)

  // Bookmark status
  const hotTakeIds = useMemo(() => items.map((i) => i.hot_take.id), [items])
  const { data: bookmarkStatusData } = useBookmarkStatus(hotTakeIds)
  const toggleBookmark = useToggleBookmark()

  function getReactions(targetType, targetId) {
    if (!reactionsBatch) return []
    return reactionsBatch[`${targetType}-${targetId}`] || []
  }

  function handleBookmarkToggle(hotTakeId) {
    toggleBookmark.mutate(hotTakeId)
  }

  function handleSelectTeam(teamName) {
    setSelectedTeam(teamName)
    setSearchValue('')
    addRecentTeam(teamName)
    setRecentTeams(getRecentTeams())
  }

  function handleClearTeam() {
    setSelectedTeam(null)
  }

  return (
    <div>
      {/* Sport chips */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar mb-3">
        {sortedSportTabs.map((sport) => (
          <button
            key={sport.key}
            onClick={() => {
              if (selectedSport === sport.key) {
                setSelectedSport(null)
                setSelectedTeam(null)
                setSearchValue('')
              } else {
                setSelectedSport(sport.key)
                setSelectedTeam(null)
                setSearchValue('')
              }
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
              selectedSport === sport.key
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {sport.label}
          </button>
        ))}
      </div>

      {/* Team search / selected team header */}
      {selectedSport && (
        <div className="mb-3">
          {selectedTeam ? (
            <div className="flex items-center justify-between bg-bg-card border border-border rounded-xl px-4 py-2.5">
              <span className="text-sm font-semibold text-text-primary">{selectedTeam}</span>
              <button
                onClick={handleClearTeam}
                className="text-xs text-accent hover:text-accent-hover transition-colors"
              >
                All {sortedSportTabs.find((s) => s.key === selectedSport)?.label || 'teams'}
              </button>
            </div>
          ) : (
            <TeamAutocomplete
              teams={teams || []}
              onSelect={handleSelectTeam}
              inputValue={searchValue}
              onInputChange={setSearchValue}
              placeholder="Filter by team..."
            />
          )}
        </div>
      )}

      {/* Recent teams (when no team selected and sport selected) */}
      {selectedSport && !selectedTeam && !searchValue && recentTeams.length > 0 && (
        <div className="mb-3">
          <h3 className="text-[10px] text-text-muted uppercase tracking-wider mb-1.5">Recent</h3>
          <div className="flex flex-wrap gap-1.5">
            {recentTeams.map((team) => (
              <button
                key={team}
                onClick={() => handleSelectTeam(team)}
                className="px-2.5 py-1 rounded-full text-xs font-medium bg-bg-card border border-border text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                {team}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No sport selected */}
      {!selectedSport && !selectedTeam && (
        <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">{'\uD83C\uDFC8'}</div>
          <div className="text-sm text-text-primary font-medium mb-1">Select a sport</div>
          <div className="text-xs text-text-muted">Pick a sport above to browse hot takes</div>
        </div>
      )}

      {/* Composer + Feed results (sport-wide or team-filtered) */}
      {selectedSport && (
        <>
          <HotTakeComposer initialTeamTags={selectedTeam ? [selectedTeam] : []} />

          {isLoading ? (
            <FeedSkeleton />
          ) : !items.length ? (
            <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
              <div className="text-2xl mb-2">{'\uD83D\uDCAC'}</div>
              <div className="text-sm text-text-primary font-medium mb-2">
                {selectedTeam
                  ? `Be the first to say something about ${selectedTeam}!`
                  : 'No hot takes yet for this sport!'}
              </div>
              <div className="text-xs text-text-muted leading-relaxed max-w-xs mx-auto">
                Drop a hot take above and get the conversation started.
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => (
                <HotTakeFeedCard
                  key={item.id}
                  item={item}
                  reactions={getReactions('hot_take', item.hot_take.id)}
                  onUserTap={onUserTap}
                  isBookmarked={bookmarkStatusData?.[item.hot_take.id] || false}
                  onBookmarkToggle={handleBookmarkToggle}
                />
              ))}

              {hasNextPage && (
                <div className="mt-4 text-center">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="text-sm text-accent hover:text-accent-hover font-medium px-4 py-2 rounded-lg bg-bg-card border border-border hover:border-accent/30 transition-colors disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'Loading...' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

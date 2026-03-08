import { useState, useMemo } from 'react'
import { useTeamsForSport, useTeamHotTakes, useBookmarkStatus, useToggleBookmark } from '../../hooks/useHotTakes'
import { useActiveSports } from '../../hooks/useGames'
import { useFeedReactionsBatch } from '../../hooks/useSocial'
import TeamAutocomplete from './TeamAutocomplete'
import HotTakeFeedCard from './HotTakeFeedCard'
import FeedSkeleton from './FeedSkeleton'

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

export default function TeamFeed({ onUserTap }) {
  const [selectedSport, setSelectedSport] = useState(null)
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [searchValue, setSearchValue] = useState('')
  const [recentTeams, setRecentTeams] = useState(getRecentTeams)

  const { data: activeSports } = useActiveSports()
  const { data: teams } = useTeamsForSport(selectedSport)
  const { data, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useTeamHotTakes(selectedTeam)

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

      {/* Team search */}
      {selectedSport && !selectedTeam && (
        <div className="mb-3">
          <TeamAutocomplete
            teams={teams || []}
            onSelect={handleSelectTeam}
            inputValue={searchValue}
            onInputChange={setSearchValue}
            placeholder="Search for a team..."
          />
        </div>
      )}

      {/* Selected team header */}
      {selectedTeam && (
        <div className="flex items-center justify-between mb-3 bg-bg-card border border-border rounded-xl px-4 py-2.5">
          <span className="text-sm font-semibold text-text-primary">{selectedTeam}</span>
          <button
            onClick={handleClearTeam}
            className="text-xs text-text-muted hover:text-text-secondary transition-colors"
          >
            Clear
          </button>
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
      {!selectedSport && (
        <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">{'\uD83C\uDFC8'}</div>
          <div className="text-sm text-text-primary font-medium mb-1">Select a sport</div>
          <div className="text-xs text-text-muted">Pick a sport above to search for team hot takes</div>
        </div>
      )}

      {/* No team selected but sport selected */}
      {selectedSport && !selectedTeam && (
        <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
          <div className="text-2xl mb-2">{'\uD83D\uDD0D'}</div>
          <div className="text-sm text-text-primary font-medium mb-1">Search for a team</div>
          <div className="text-xs text-text-muted">Type 3+ characters to find a team</div>
        </div>
      )}

      {/* Team feed results */}
      {selectedTeam && (
        <>
          {isLoading ? (
            <FeedSkeleton />
          ) : !items.length ? (
            <div className="bg-bg-card border border-border rounded-xl px-4 py-10 text-center">
              <div className="text-2xl mb-2">{'\uD83E\uDD37'}</div>
              <div className="text-sm text-text-primary font-medium mb-1">No hot takes yet</div>
              <div className="text-xs text-text-muted">Be the first to post about {selectedTeam}!</div>
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

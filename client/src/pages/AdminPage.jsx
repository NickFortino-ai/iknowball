import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useScoreGames, useAdminFeaturedProps, useUnfeatureProp } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import PropSyncPanel from '../components/admin/PropSyncPanel'
import PropSettlePanel from '../components/admin/PropSettlePanel'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [activeSport, setActiveSport] = useState(0)
  const [selectedGame, setSelectedGame] = useState(null)
  const [activeTab, setActiveTab] = useState('sync') // sync | settle

  const sportKey = sportTabs[activeSport].key
  const { data: games, isLoading: gamesLoading } = useGames(sportKey, null, 7)
  const { data: featuredProps } = useAdminFeaturedProps()
  const unfeatureProp = useUnfeatureProp()

  const syncOdds = useSyncOdds()
  const scoreGames = useScoreGames()

  if (!profile?.is_admin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl mb-4">Access Denied</h1>
        <p className="text-text-muted">You need admin access to view this page.</p>
      </div>
    )
  }

  async function handleSyncOdds() {
    try {
      await syncOdds.mutateAsync()
      toast('Odds synced successfully', 'success')
    } catch (err) {
      toast(err.message || 'Sync failed', 'error')
    }
  }

  async function handleScoreGames() {
    try {
      await scoreGames.mutateAsync()
      toast('Games scored successfully', 'success')
    } catch (err) {
      toast(err.message || 'Scoring failed', 'error')
    }
  }

  async function handleUnfeature(propId) {
    try {
      await unfeatureProp.mutateAsync(propId)
      toast('Prop removed from featured', 'success')
    } catch (err) {
      toast(err.message || 'Failed to unfeature', 'error')
    }
  }

  const upcomingGames = (games || []).filter((g) => g.status === 'upcoming')
  const liveGames = (games || []).filter((g) => g.status === 'live')
  const finalGames = (games || []).filter((g) => g.status === 'final')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Admin Panel</h1>

      {/* Featured Props Overview */}
      {featuredProps?.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3">Daily Featured Props</h2>
          <div className="space-y-2">
            {featuredProps.map((prop) => (
              <div key={prop.id} className="flex items-center gap-3 p-2 rounded-lg bg-correct/5 border border-correct/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {prop.player_name} — {prop.market_label} ({prop.line})
                  </div>
                  <div className="text-xs text-text-muted">
                    {prop.games?.away_team} @ {prop.games?.home_team} — {prop.games?.sports?.name}
                  </div>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                  prop.status === 'settled' ? 'bg-text-muted/20 text-text-muted' :
                  prop.status === 'locked' ? 'bg-accent/20 text-accent' :
                  'bg-correct/20 text-correct'
                }`}>
                  {prop.featured_date}
                </span>
                <span className="text-xs text-text-muted">{prop.status}</span>
                {prop.status === 'published' && (
                  <button
                    onClick={() => handleUnfeature(prop.id)}
                    disabled={unfeatureProp.isPending}
                    className="text-xs text-incorrect hover:underline"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Props Manager */}
      <h2 className="font-display text-xl mb-4">Props Manager</h2>

      {/* Sport Tabs */}
      <div className="flex gap-2 mb-4">
        {sportTabs.map((tab, i) => (
          <button
            key={tab.key}
            onClick={() => {
              setActiveSport(i)
              setSelectedGame(null)
            }}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeSport === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Game List */}
        <div className="lg:col-span-1">
          {gamesLoading ? (
            <LoadingSpinner />
          ) : (
            <div className="space-y-4">
              {upcomingGames.length > 0 && (
                <div>
                  <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Upcoming</h3>
                  <div className="space-y-1">
                    {upcomingGames.map((game) => (
                      <GameListItem
                        key={game.id}
                        game={game}
                        isSelected={selectedGame?.id === game.id}
                        onClick={() => setSelectedGame(game)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {liveGames.length > 0 && (
                <div>
                  <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Live</h3>
                  <div className="space-y-1">
                    {liveGames.map((game) => (
                      <GameListItem
                        key={game.id}
                        game={game}
                        isSelected={selectedGame?.id === game.id}
                        onClick={() => setSelectedGame(game)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {finalGames.length > 0 && (
                <div>
                  <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Final</h3>
                  <div className="space-y-1">
                    {finalGames.map((game) => (
                      <GameListItem
                        key={game.id}
                        game={game}
                        isSelected={selectedGame?.id === game.id}
                        onClick={() => setSelectedGame(game)}
                      />
                    ))}
                  </div>
                </div>
              )}
              {!upcomingGames.length && !liveGames.length && !finalGames.length && (
                <div className="text-center text-text-muted text-sm py-8">No games found</div>
              )}
            </div>
          )}
        </div>

        {/* Props Panel */}
        <div className="lg:col-span-2">
          {selectedGame ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm">
                  {selectedGame.away_team} @ {selectedGame.home_team}
                </h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => setActiveTab('sync')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'sync' ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    Sync & Feature
                  </button>
                  <button
                    onClick={() => setActiveTab('settle')}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'settle' ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                    }`}
                  >
                    Settle
                  </button>
                </div>
              </div>

              {activeTab === 'sync' ? (
                <PropSyncPanel game={selectedGame} sportKey={sportKey} />
              ) : (
                <PropSettlePanel game={selectedGame} />
              )}
            </div>
          ) : (
            <div className="text-center text-text-muted text-sm py-16">
              Select a game to manage props
            </div>
          )}
        </div>
      </div>

      {/* System Actions — manual overrides, rarely needed */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mt-8">
        <h2 className="text-xs text-text-muted uppercase tracking-wider mb-3">Manual Overrides</h2>
        <div className="flex gap-3">
          <button
            onClick={handleSyncOdds}
            disabled={syncOdds.isPending}
            className="bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {syncOdds.isPending ? 'Syncing...' : 'Sync Odds'}
          </button>
          <button
            onClick={handleScoreGames}
            disabled={scoreGames.isPending}
            className="bg-bg-card-hover hover:bg-border text-text-secondary px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {scoreGames.isPending ? 'Scoring...' : 'Score Games'}
          </button>
        </div>
      </div>
    </div>
  )
}

function GameListItem({ game, isSelected, onClick }) {
  const time = new Date(game.starts_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-colors ${
        isSelected
          ? 'bg-accent/10 border-accent'
          : 'bg-bg-card border-border hover:bg-bg-card-hover'
      }`}
    >
      <div className="text-sm font-medium truncate">
        {game.away_team} @ {game.home_team}
      </div>
      <div className="text-xs text-text-muted mt-0.5">
        {game.status === 'final'
          ? `Final: ${game.away_score} - ${game.home_score}`
          : game.status === 'live'
            ? 'LIVE'
            : time}
      </div>
    </button>
  )
}

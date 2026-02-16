import { useState } from 'react'
import { useGames } from '../hooks/useGames'
import { useSyncOdds, useScoreGames, useAdminFeaturedProps, useUnfeatureProp, useSettleProps } from '../hooks/useAdmin'
import { useAuth } from '../hooks/useAuth'
import PropSyncPanel from '../components/admin/PropSyncPanel'
import BracketTemplateManager from '../components/admin/BracketTemplateManager'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'

const sportTabs = [
  { label: 'NBA', key: 'basketball_nba' },
  { label: 'NCAAB', key: 'basketball_ncaab' },
  { label: 'WNBA', key: 'basketball_wnba' },
  { label: 'MLB', key: 'baseball_mlb' },
  { label: 'NFL', key: 'americanfootball_nfl' },
  { label: 'NCAAF', key: 'americanfootball_ncaaf' },
]

export default function AdminPage() {
  const { profile } = useAuth()
  const [adminSection, setAdminSection] = useState('props') // props | brackets
  const [activeSport, setActiveSport] = useState(0)
  const [selectedGame, setSelectedGame] = useState(null)

  const sportKey = sportTabs[activeSport].key
  const { data: games, isLoading: gamesLoading } = useGames(sportKey, 'upcoming', 7)
  const { data: featuredProps } = useAdminFeaturedProps()
  const unfeatureProp = useUnfeatureProp()
  const settleProps = useSettleProps()

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

  async function handleSettle(propId, outcome) {
    try {
      const results = await settleProps.mutateAsync([{ propId, outcome }])
      const totalScored = results.reduce((sum, r) => sum + r.scored, 0)
      toast(`Settled as ${outcome} — scored ${totalScored} picks`, 'success')
    } catch (err) {
      toast(err.message || 'Settlement failed', 'error')
    }
  }

  const upcomingGames = games || []

  // Split featured props into settleable vs others
  const settleableFeatured = (featuredProps || []).filter((p) => p.status === 'locked' || p.status === 'published')
  const otherFeatured = (featuredProps || []).filter((p) => p.status !== 'locked' && p.status !== 'published')

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-4">Admin Panel</h1>

      {/* Top-level section tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setAdminSection('props')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'props'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Props Manager
        </button>
        <button
          onClick={() => setAdminSection('brackets')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
            adminSection === 'brackets'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          Brackets
        </button>
      </div>

      {adminSection === 'brackets' && <BracketTemplateManager />}

      {adminSection === 'props' && <>
      {/* Featured Props — Settle */}
      {settleableFeatured.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3">Settle Featured Props</h2>
          <div className="space-y-2">
            {settleableFeatured.map((prop) => (
              <div key={prop.id} className="flex items-center gap-3 p-3 rounded-lg bg-accent/5 border border-accent/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {prop.player_name} — {prop.market_label} ({prop.line})
                  </div>
                  <div className="text-xs text-text-muted">
                    {prop.games?.away_team} @ {prop.games?.home_team} — {prop.featured_date}
                  </div>
                </div>
                <div className="flex gap-1">
                  {['over', 'under', 'push'].map((outcome) => (
                    <button
                      key={outcome}
                      onClick={() => handleSettle(prop.id, outcome)}
                      disabled={settleProps.isPending}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                        outcome === 'over'
                          ? 'bg-correct/20 text-correct hover:bg-correct/30'
                          : outcome === 'under'
                            ? 'bg-incorrect/20 text-incorrect hover:bg-incorrect/30'
                            : 'bg-text-muted/20 text-text-muted hover:bg-text-muted/30'
                      }`}
                    >
                      {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Featured Props — Scheduled / Settled */}
      {otherFeatured.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
          <h2 className="font-semibold text-sm mb-3">Daily Featured Props</h2>
          <div className="space-y-2">
            {otherFeatured.map((prop) => (
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
                  'bg-correct/20 text-correct'
                }`}>
                  {prop.featured_date}
                </span>
                <span className="text-xs text-text-muted">{prop.status}</span>
                {prop.outcome && (
                  <span className={`text-xs font-semibold ${
                    prop.outcome === 'over' ? 'text-correct' : prop.outcome === 'under' ? 'text-incorrect' : 'text-text-muted'
                  }`}>
                    {prop.outcome.toUpperCase()}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Props Manager */}
      <h2 className="font-display text-xl mb-4">Sync & Feature Props</h2>

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
        {/* Game List — upcoming only */}
        <div className="lg:col-span-1">
          {gamesLoading ? (
            <LoadingSpinner />
          ) : upcomingGames.length > 0 ? (
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
          ) : (
            <div className="text-center text-text-muted text-sm py-8">No upcoming games</div>
          )}
        </div>

        {/* Props Panel */}
        <div className="lg:col-span-2">
          {selectedGame ? (
            <div>
              <h3 className="font-semibold text-sm mb-4">
                {selectedGame.away_team} @ {selectedGame.home_team}
              </h3>
              <PropSyncPanel game={selectedGame} sportKey={sportKey} />
            </div>
          ) : (
            <div className="text-center text-text-muted text-sm py-16">
              Select a game to sync & feature props
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
      </>}
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
      <div className="text-xs text-text-muted mt-0.5">{time}</div>
    </button>
  )
}

import { useState } from 'react'
import { useAdminPropsForGame, useSyncProps, useFeatureProp, useUnfeatureProp } from '../../hooks/useAdmin'
import { formatOdds } from '../../lib/scoring'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

const NBA_MARKETS = [
  { key: 'player_points', label: 'Points' },
  { key: 'player_rebounds', label: 'Rebounds' },
  { key: 'player_assists', label: 'Assists' },
  { key: 'player_threes', label: '3-Pointers' },
  { key: 'player_points_rebounds_assists', label: 'PRA' },
]

const NFL_MARKETS = [
  { key: 'player_pass_tds', label: 'Pass TDs' },
  { key: 'player_pass_yds', label: 'Pass Yds' },
  { key: 'player_rush_yds', label: 'Rush Yds' },
  { key: 'player_reception_yds', label: 'Rec Yds' },
  { key: 'player_receptions', label: 'Receptions' },
  { key: 'player_anytime_td', label: 'Anytime TD' },
]

const MARKET_OPTIONS = {
  basketball_nba: NBA_MARKETS,
  basketball_ncaab: NBA_MARKETS,
  basketball_wnba: NBA_MARKETS,
  basketball_wncaab: NBA_MARKETS,
  americanfootball_nfl: NFL_MARKETS,
  americanfootball_ncaaf: NFL_MARKETS,
  baseball_mlb: [
    { key: 'player_strikeouts', label: 'Strikeouts' },
    { key: 'player_hits', label: 'Hits' },
    { key: 'player_total_bases', label: 'Total Bases' },
    { key: 'player_home_runs', label: 'Home Runs' },
  ],
}

function getDateOptions() {
  const options = []
  for (let i = 0; i < 3; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    options.push({ date: dateStr, label })
  }
  return options
}

export default function PropSyncPanel({ game, sportKey }) {
  const [selectedMarkets, setSelectedMarkets] = useState([])

  const { data: props, isLoading } = useAdminPropsForGame(game.id)
  const syncProps = useSyncProps()
  const featureProp = useFeatureProp()
  const unfeatureProp = useUnfeatureProp()

  const markets = MARKET_OPTIONS[sportKey] || []
  const dateOptions = getDateOptions()

  function toggleMarket(key) {
    setSelectedMarkets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  async function handleSync() {
    if (!selectedMarkets.length) {
      toast('Select at least one market to sync', 'error')
      return
    }
    try {
      const result = await syncProps.mutateAsync({ gameId: game.id, markets: selectedMarkets })
      toast(`Synced ${result.synced} props`, 'success')
    } catch (err) {
      toast(err.message || 'Sync failed', 'error')
    }
  }

  async function handleFeature(propId, featuredDate) {
    try {
      await featureProp.mutateAsync({ propId, featuredDate })
      toast(`Prop featured for ${featuredDate}`, 'success')
    } catch (err) {
      toast(err.message || 'Feature failed', 'error')
    }
  }

  async function handleUnfeature(propId) {
    try {
      await unfeatureProp.mutateAsync(propId)
      toast('Prop unplanned', 'success')
    } catch (err) {
      toast(err.message || 'Unfeature failed', 'error')
    }
  }

  const syncedProps = (props || []).filter((p) => p.status === 'synced')
  const featuredProps = (props || []).filter((p) => p.featured_date)
  const lockedProps = (props || []).filter((p) => p.status === 'locked' && !p.featured_date)

  return (
    <div className="space-y-6">
      {/* Sync Controls */}
      <div className="bg-bg-card rounded-xl border border-border p-4">
        <h3 className="font-semibold text-sm mb-3">Sync Props from API</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {markets.map((m) => (
            <button
              key={m.key}
              onClick={() => toggleMarket(m.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedMarkets.includes(m.key)
                  ? 'bg-accent text-white'
                  : 'bg-bg-secondary text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={handleSync}
          disabled={syncProps.isPending || !selectedMarkets.length}
          className="bg-accent hover:bg-accent-hover text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
        >
          {syncProps.isPending ? 'Syncing...' : 'Sync Props'}
        </button>
      </div>

      {isLoading && <LoadingSpinner />}

      {/* Featured Props */}
      {featuredProps.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 text-correct">Featured ({featuredProps.length})</h3>
          <div className="space-y-2">
            {featuredProps.map((prop) => (
              <div key={prop.id} className="flex items-center gap-3 p-2 rounded-lg bg-correct/5 border border-correct/20">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{prop.player_name}</div>
                  <div className="text-xs text-text-muted">
                    {prop.market_label} — Line {prop.line}
                  </div>
                </div>
                <span className="text-xs font-semibold text-correct">{prop.featured_date}</span>
                <div className="text-xs text-text-secondary text-right">
                  <div>O {prop.over_odds ? formatOdds(prop.over_odds) : '—'}</div>
                  <div>U {prop.under_odds ? formatOdds(prop.under_odds) : '—'}</div>
                </div>
                <button
                  onClick={() => handleUnfeature(prop.id)}
                  disabled={unfeatureProp.isPending}
                  className="text-xs text-incorrect hover:underline"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Synced Props (ready to feature) */}
      {syncedProps.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3">Synced ({syncedProps.length})</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {syncedProps.map((prop) => (
              <div
                key={prop.id}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-bg-secondary"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{prop.player_name}</div>
                  <div className="text-xs text-text-muted">
                    {prop.market_label} — Line {prop.line}
                  </div>
                </div>
                <div className="text-xs text-text-secondary text-right mr-2">
                  <div>O {prop.over_odds ? formatOdds(prop.over_odds) : '—'}</div>
                  <div>U {prop.under_odds ? formatOdds(prop.under_odds) : '—'}</div>
                </div>
                <div className="flex gap-1">
                  {dateOptions.map((opt) => (
                    <button
                      key={opt.date}
                      onClick={() => handleFeature(prop.id, opt.date)}
                      disabled={featureProp.isPending}
                      className="px-2 py-1 rounded text-xs font-medium bg-accent/10 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
                      title={`Feature for ${opt.date}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Locked Props */}
      {lockedProps.length > 0 && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <h3 className="font-semibold text-sm mb-3 text-text-muted">Locked ({lockedProps.length})</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {lockedProps.map((prop) => (
              <div key={prop.id} className="flex items-center gap-3 p-2 rounded-lg opacity-60">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{prop.player_name}</div>
                  <div className="text-xs text-text-muted">
                    {prop.market_label} — Line {prop.line}
                  </div>
                </div>
                <div className="text-xs text-text-secondary text-right">
                  <div>O {prop.over_odds ? formatOdds(prop.over_odds) : '—'}</div>
                  <div>U {prop.under_odds ? formatOdds(prop.under_odds) : '—'}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !props?.length && (
        <div className="text-center text-text-muted text-sm py-8">
          No props synced yet. Select markets and sync from the API.
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useAppConfig, useUpdateAppConfig } from '../../hooks/useAppConfig'
import { toast } from '../ui/Toast'

// News tabs the NewsFeed knows how to render. Adding a new sport here
// requires a matching ESPN news endpoint mapping server-side.
const NEWS_OPTIONS = [
  { key: 'nba', label: 'NBA' },
  { key: 'nfl', label: 'NFL' },
  { key: 'mlb', label: 'MLB' },
  { key: 'nhl', label: 'NHL' },
]

// Mirror of DEFAULT_TABS in LeaderboardPage. Keep in sync when adding
// leaderboard scopes — admin can hide/reorder by editing this knob.
const LEADERBOARD_OPTIONS = [
  'Global', 'NBA', 'NCAAB', 'WNCAAB', 'MLB', 'NHL', 'MLS',
  'Picks', 'Props', 'Parlays', 'Leagues',
  'NFL', 'NCAAF', 'UFL', 'WNBA',
]

function ReorderList({ items, onChange, getLabel }) {
  function move(idx, dir) {
    const target = dir === 'up' ? idx - 1 : idx + 1
    if (target < 0 || target >= items.length) return
    const next = [...items]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }
  return (
    <div className="space-y-1">
      {items.map((item, idx) => (
        <div key={item} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-primary border border-text-primary/20">
          <span className="text-xs text-text-muted w-6">{idx + 1}.</span>
          <span className="flex-1 text-sm text-text-primary">{getLabel(item)}</span>
          <button
            type="button"
            onClick={() => move(idx, 'up')}
            disabled={idx === 0}
            className="px-2 py-1 rounded text-xs text-text-secondary hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move up"
          >▲</button>
          <button
            type="button"
            onClick={() => move(idx, 'down')}
            disabled={idx === items.length - 1}
            className="px-2 py-1 rounded text-xs text-text-secondary hover:text-accent disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Move down"
          >▼</button>
        </div>
      ))}
    </div>
  )
}

export default function AppConfigPanel() {
  const { data: cfg } = useAppConfig()
  const updateCfg = useUpdateAppConfig()

  const [newsOrder, setNewsOrder] = useState([])
  const [leaderboardOrder, setLeaderboardOrder] = useState([])

  useEffect(() => {
    if (!cfg) return
    const initialNews = Array.isArray(cfg.news_tab_order) && cfg.news_tab_order.length
      ? cfg.news_tab_order
      : NEWS_OPTIONS.map((o) => o.key)
    const initialLb = Array.isArray(cfg.leaderboard_default_tab_order) && cfg.leaderboard_default_tab_order.length
      ? cfg.leaderboard_default_tab_order
      : LEADERBOARD_OPTIONS
    setNewsOrder(initialNews)
    setLeaderboardOrder(initialLb)
  }, [cfg])

  async function save(key, value, label) {
    try {
      await updateCfg.mutateAsync({ key, value })
      toast(`Saved ${label}`, 'success')
    } catch (err) {
      toast(err.message || `Failed to save ${label}`, 'error')
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-xl mb-2">Remote Config</h2>
        <p className="text-xs text-text-muted mb-4">
          Server-driven UI knobs. Changes take effect on clients within ~5 minutes (next config fetch).
        </p>
      </div>

      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Hub news tab order</h3>
        <p className="text-xs text-text-muted mb-3">
          Order of sport tabs in the Hub's news feed (and desktop news sidebar).
        </p>
        <ReorderList
          items={newsOrder}
          onChange={setNewsOrder}
          getLabel={(k) => NEWS_OPTIONS.find((o) => o.key === k)?.label || k}
        />
        <button
          onClick={() => save('news_tab_order', newsOrder, 'news tab order')}
          disabled={updateCfg.isPending}
          className="mt-3 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
        >
          Save news order
        </button>
      </section>

      <section>
        <h3 className="text-sm font-semibold text-text-primary mb-2">Leaderboard default tab order</h3>
        <p className="text-xs text-text-muted mb-3">
          Initial order new users see on the leaderboard. Users who have personally reordered keep their own order.
        </p>
        <ReorderList
          items={leaderboardOrder}
          onChange={setLeaderboardOrder}
          getLabel={(l) => l}
        />
        <button
          onClick={() => save('leaderboard_default_tab_order', leaderboardOrder, 'leaderboard default order')}
          disabled={updateCfg.isPending}
          className="mt-3 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold hover:bg-accent-hover disabled:opacity-50"
        >
          Save leaderboard order
        </button>
      </section>
    </div>
  )
}

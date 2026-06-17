import { useState, useMemo } from 'react'
import { useNews } from '../../hooks/useNews'
import { useAppConfig } from '../../hooks/useAppConfig'
import LoadingSpinner from '../ui/LoadingSpinner'

const TAB_DEFS = {
  nba: { key: 'nba', label: 'NBA' },
  nfl: { key: 'nfl', label: 'NFL' },
  mlb: { key: 'mlb', label: 'MLB' },
  nhl: { key: 'nhl', label: 'NHL' },
}
const FALLBACK_ORDER = ['nba', 'nfl', 'mlb', 'nhl']

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export default function NewsFeed({ compact }) {
  const { data: cfg } = useAppConfig()
  const sportTabs = useMemo(() => {
    const order = Array.isArray(cfg?.news_tab_order) && cfg.news_tab_order.length
      ? cfg.news_tab_order
      : FALLBACK_ORDER
    return order.map((k) => TAB_DEFS[k]).filter(Boolean)
  }, [cfg?.news_tab_order])

  const [sport, setSport] = useState(sportTabs[0]?.key || 'nba')
  const { data, isLoading } = useNews(sport)
  const articles = data?.articles || []

  return (
    <div>
      {/* Sport tabs */}
      <div className="flex gap-1.5 mb-3">
        {sportTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSport(tab.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
              sport === tab.key ? 'bg-bg-primary/50 border-accent text-accent' : 'bg-bg-primary/50 border-text-primary/20 text-text-secondary hover:border-text-primary/40'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !articles.length ? (
        <div className="text-center py-6 text-sm text-text-muted">No news available.</div>
      ) : (
        <div className="space-y-2">
          {articles.map((article) => (
            <a
              key={article.id}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-3 p-3 rounded-xl bg-bg-primary border border-text-primary/20 hover:bg-text-primary/5 transition-colors"
            >
              {article.image && !compact && (
                <img
                  src={article.image}
                  alt=""
                  className="w-16 h-16 rounded-lg object-cover bg-bg-secondary shrink-0"
                  onError={(e) => { e.target.style.display = 'none' }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-text-primary line-clamp-2 leading-snug">
                  {article.headline}
                </div>
                {article.description && !compact && (
                  <div className="text-xs text-text-muted mt-1 line-clamp-2">{article.description}</div>
                )}
                <div className="text-[10px] text-text-muted mt-1">
                  {timeAgo(article.published)}
                </div>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

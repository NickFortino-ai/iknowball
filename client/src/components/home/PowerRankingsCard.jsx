import { useState, useMemo } from 'react'
import { useLatestRecap } from '../../hooks/useRecaps'

function formatDateRange(weekStart, weekEnd) {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(weekEnd + 'T00:00:00')
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function parseRecapContent(content) {
  if (!content) return { rankings: [], awards: '' }

  const parts = content.split(/^## AWARDS/m)
  const rankingsRaw = (parts[0] || '').replace(/^## RANKINGS\s*/m, '')
  const awardsRaw = parts[1] || ''

  // Parse individual rankings
  const rankBlocks = rankingsRaw.split(/^### /m).filter((b) => b.trim())
  const rankings = rankBlocks.map((block) => {
    const lines = block.trim().split('\n')
    const headerLine = lines[0] || ''
    const narrative = lines.slice(1).join(' ').trim()

    // Parse: "1. Name (W-L) | +X pts"
    const headerMatch = headerLine.match(/^(\d+)\.\s+(.+?)\s+\((\d+-\d+)\)\s*\|\s*([+-]?\d+)\s*pts?/)
    if (headerMatch) {
      return {
        rank: parseInt(headerMatch[1]),
        name: headerMatch[2],
        record: headerMatch[3],
        points: headerMatch[4],
        narrative,
      }
    }

    return { rank: 0, name: headerLine, record: '', points: '', narrative }
  })

  // Parse awards section
  const awardLines = awardsRaw.trim().split('\n').filter((l) => l.trim())
  const awards = awardLines.map((line) => {
    const match = line.match(/^\*\*(.+?)\*\*:\s*(.+)$/)
    if (match) return { label: match[1], text: match[2] }
    return { label: '', text: line.replace(/^\*\*|\*\*$/g, '').trim() }
  })

  return { rankings, awards }
}

export default function PowerRankingsCard() {
  const { data: recap, isLoading } = useLatestRecap()
  const [expanded, setExpanded] = useState(null) // null = auto, true/false = manual

  const isOlderThan2Days = useMemo(() => {
    if (!recap?.created_at) return false
    const created = new Date(recap.created_at)
    const now = new Date()
    return (now - created) > 2 * 24 * 60 * 60 * 1000
  }, [recap?.created_at])

  const isExpanded = expanded !== null ? expanded : !isOlderThan2Days

  const { rankings, awards } = useMemo(
    () => parseRecapContent(recap?.recap_content),
    [recap?.recap_content]
  )

  if (isLoading) return null

  // Placeholder when no recap exists yet
  if (!recap) {
    return (
      <div className="mb-8">
        <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
          <h2 className="font-display text-xl mb-2">WEEKLY POWER RANKINGS</h2>
          <p className="text-text-secondary text-sm">
            Power Rankings drop every Monday — make your picks to get featured!
          </p>
        </div>
      </div>
    )
  }

  const dateRange = formatDateRange(recap.week_start, recap.week_end)

  // Collapsed view
  if (!isExpanded) {
    return (
      <div className="mb-8">
        <button
          onClick={() => setExpanded(true)}
          className="w-full bg-bg-card rounded-2xl border border-border p-4 flex items-center justify-between hover:border-border-hover transition-colors"
        >
          <span className="font-display text-base text-text-primary">
            See this week's Power Rankings
          </span>
          <svg className="w-5 h-5 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    )
  }

  return (
    <div className="mb-8">
      <div className="bg-bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-display text-xl">
            WEEKLY POWER RANKINGS — {dateRange}
          </h2>
          {isOlderThan2Days && (
            <button
              onClick={() => setExpanded(false)}
              className="text-text-muted hover:text-text-primary text-xl leading-none"
            >
              &times;
            </button>
          )}
        </div>

        {/* Rankings */}
        <div className="space-y-4 mb-6">
          {rankings.map((r) => (
            <div key={r.rank || r.name} className="bg-bg-primary rounded-xl p-4">
              <div className="flex items-baseline gap-3 mb-1">
                <span className="font-display text-2xl text-accent">#{r.rank}</span>
                <span className="font-display text-lg">{r.name}</span>
                <span className="text-text-muted text-sm ml-auto">{r.record}</span>
                <span className="font-semibold text-accent text-sm">{r.points > 0 ? '+' : ''}{r.points} pts</span>
              </div>
              {r.narrative && (
                <p className="text-text-secondary text-sm leading-relaxed">{r.narrative}</p>
              )}
            </div>
          ))}
        </div>

        {/* Awards */}
        {awards.length > 0 && (
          <div className="border-t border-border pt-4 space-y-2">
            {awards.map((award, i) => (
              <div key={i} className="text-sm">
                <span className="font-semibold text-text-primary">{award.label}</span>
                {award.label && ': '}
                <span className="text-text-secondary">{award.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

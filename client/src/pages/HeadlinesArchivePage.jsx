import { useState, useMemo } from 'react'
import { useRecapArchive } from '../hooks/useRecaps'
import { useAuth } from '../hooks/useAuth'
import { useUpdateRecap } from '../hooks/useAdmin'
import { toast } from '../components/ui/Toast'
import LoadingSpinner from '../components/ui/LoadingSpinner'

function formatDateRange(weekStart, weekEnd) {
  const start = new Date(weekStart + 'T00:00:00')
  const end = new Date(weekEnd + 'T00:00:00')
  const opts = { month: 'short', day: 'numeric' }
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`
}

function parseRecapContent(content) {
  if (!content) return { rankings: [], awards: [] }

  const parts = content.split(/^## AWARDS/m)
  const rankingsRaw = (parts[0] || '').replace(/^## RANKINGS\s*/m, '')
  const awardsRaw = parts[1] || ''

  const rankBlocks = rankingsRaw.split(/^### /m).filter((b) => b.trim())
  const rankings = rankBlocks.map((block) => {
    const lines = block.trim().split('\n')
    const headerLine = lines[0] || ''
    const narrative = lines.slice(1).join(' ').trim()

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

  const awardLines = awardsRaw.trim().split('\n').filter((l) => l.trim())
  const awards = awardLines.map((line) => {
    const match = line.match(/^\*\*(.+?)\*\*:\s*(.+)$/)
    if (match) return { label: match[1], text: match[2] }
    return { label: '', text: line.replace(/^\*\*|\*\*$/g, '').trim() }
  })

  return { rankings, awards }
}

function getMonthKey(weekStart) {
  const d = new Date(weekStart + 'T00:00:00')
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function getMonthLabel(weekStart) {
  const d = new Date(weekStart + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function getCurrentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export default function HeadlinesArchivePage() {
  const { data: recaps, isLoading } = useRecapArchive()
  const { profile } = useAuth()
  const updateRecap = useUpdateRecap()
  const [expanded, setExpanded] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editContent, setEditContent] = useState('')
  const isAdmin = profile?.is_admin

  const currentMonth = getCurrentMonthKey()

  const months = useMemo(() => {
    if (!recaps?.length) return []

    const grouped = {}
    const order = []

    for (const recap of recaps) {
      const key = getMonthKey(recap.week_start)
      if (!grouped[key]) {
        grouped[key] = { key, label: getMonthLabel(recap.week_start), recaps: [] }
        order.push(key)
      }
      grouped[key].recaps.push(recap)
    }

    return order.map((k) => grouped[k])
  }, [recaps])

  function isExpanded(key) {
    if (key in expanded) return expanded[key]
    return key === currentMonth
  }

  function toggle(key) {
    setExpanded((prev) => ({ ...prev, [key]: !isExpanded(key) }))
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl mb-6">HEADLINES ARCHIVE</h1>
        <LoadingSpinner />
      </div>
    )
  }

  if (!months.length) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="font-display text-2xl mb-6">HEADLINES ARCHIVE</h1>
        <div className="bg-bg-card rounded-2xl border border-border p-6 text-center">
          <p className="text-text-secondary text-sm">
            No headlines yet — they drop every Monday!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-2xl mb-6">HEADLINES ARCHIVE</h1>

      <div className="space-y-2">
        {months.map((month) => {
          const open = isExpanded(month.key)

          return (
            <div key={month.key}>
              <button
                onClick={() => toggle(month.key)}
                className="w-full bg-bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs text-text-muted transition-transform ${open ? 'rotate-90' : ''}`}>
                    &#9656;
                  </span>
                  <span className="font-semibold text-sm">{month.label}</span>
                  <span className="text-text-muted text-xs">
                    {month.recaps.length} {month.recaps.length === 1 ? 'week' : 'weeks'}
                  </span>
                </div>
              </button>

              {open && (
                <div className="mt-2 space-y-4">
                  {month.recaps.map((recap, i) => {
                    const isLatest = months[0].recaps[0].id === recap.id
                    const dateRange = formatDateRange(recap.week_start, recap.week_end)
                    const { rankings, awards } = parseRecapContent(recap.recap_content)

                    return (
                      <div key={recap.id} className="bg-bg-card rounded-2xl border border-border p-6">
                        <div className="flex items-center gap-3 mb-6">
                          <h2 className="font-display text-lg">
                            WEEKLY HEADLINES — {dateRange}
                          </h2>
                          {isLatest && (
                            <span className="text-[10px] font-bold uppercase bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                              Latest
                            </span>
                          )}
                          {isAdmin && editingId !== recap.id && (
                            <button
                              onClick={() => {
                                setEditingId(recap.id)
                                setEditContent(recap.recap_content)
                              }}
                              className="ml-auto text-xs text-accent font-semibold hover:underline"
                            >
                              Edit
                            </button>
                          )}
                        </div>

                        {editingId === recap.id ? (
                          <div>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              className="w-full bg-bg-primary border border-border rounded-xl p-4 text-sm text-text-primary font-mono leading-relaxed resize-y min-h-[200px]"
                              rows={16}
                            />
                            <div className="flex gap-2 mt-3">
                              <button
                                onClick={async () => {
                                  try {
                                    await updateRecap.mutateAsync({ recapId: recap.id, recap_content: editContent })
                                    toast.success('Recap updated')
                                    setEditingId(null)
                                  } catch {
                                    toast.error('Failed to update recap')
                                  }
                                }}
                                disabled={updateRecap.isPending}
                                className="bg-accent text-white text-xs font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                              >
                                {updateRecap.isPending ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="text-text-muted text-xs font-semibold px-4 py-2 rounded-lg hover:text-text-primary"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
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
                                {awards.map((award, j) => (
                                  <div key={j} className="text-sm">
                                    <span className="font-semibold text-text-primary">{award.label}</span>
                                    {award.label && ': '}
                                    <span className="text-text-secondary">{award.text}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRecords } from '../hooks/useRecords'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import EmptyState from '../components/ui/EmptyState'
import ErrorState from '../components/ui/ErrorState'
import TierBadge from '../components/ui/TierBadge'

const CATEGORY_ORDER = ['streak', 'single_pick', 'percentage', 'efficiency', 'climb']
const CATEGORY_LABELS = {
  streak: 'Streaks',
  single_pick: 'Big Hits',
  percentage: 'Percentages',
  efficiency: 'Efficiency',
  climb: 'Climb',
}

function formatRecordValue(record) {
  const val = record.record_value
  if (val == null) return '--'

  switch (record.record_key) {
    case 'highest_prop_pct':
    case 'biggest_dog_lover':
    case 'highest_overall_win_pct':
      return `${val}%`
    case 'biggest_underdog_hit':
    case 'best_futures_hit':
      return val > 0 ? `+${val}` : `${val}`
    case 'biggest_parlay':
      return `+${Math.round((val - 1) * 100)}`
    case 'great_climb':
      return `${val} spots`
    case 'fewest_picks_to_baller':
    case 'fewest_picks_to_elite':
    case 'fewest_picks_to_hof':
    case 'fewest_picks_to_goat':
      return `${val} picks`
    default:
      // Per-sport futures hits
      if (record.record_key.startsWith('best_futures_hit_')) {
        return val > 0 ? `+${val}` : `${val}`
      }
      return `${val}`
  }
}

function RecordCard({ record }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const holder = record.users
  const hasSubs = record.sub_records?.length > 0
  const hasHolder = holder != null

  return (
    <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
      <div
        className={`p-4 ${hasSubs ? 'cursor-pointer' : ''}`}
        onClick={() => hasSubs && setExpanded(!expanded)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-text-primary">{record.display_name}</h3>
              {hasSubs && (
                <svg
                  width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              )}
            </div>
            <p className="text-xs text-text-muted">{record.description}</p>
          </div>

          {hasHolder && (
            <div className="text-right flex-shrink-0">
              <div className="text-xl font-bold text-accent">{formatRecordValue(record)}</div>
            </div>
          )}
        </div>

        {hasHolder && (
          <div
            className="flex items-center gap-2 mt-3 pt-3 border-t border-border cursor-pointer hover:opacity-80 transition-opacity"
            onClick={(e) => { e.stopPropagation(); navigate(`/profile?user=${holder.id}`) }}
          >
            <span className="w-7 h-7 rounded-full bg-accent/20 flex items-center justify-center text-xs flex-shrink-0">
              {holder.avatar_emoji || holder.display_name?.[0]?.toUpperCase() || holder.username?.[0]?.toUpperCase()}
            </span>
            <span className="text-sm font-medium text-text-primary">{holder.display_name || holder.username}</span>
            <TierBadge tier={holder.tier} size="xs" />
          </div>
        )}

        {!hasHolder && (
          <div className="mt-3 pt-3 border-t border-border">
            <span className="text-sm text-text-muted italic">No record holder yet</span>
          </div>
        )}
      </div>

      {expanded && hasSubs && (
        <div className="border-t border-border">
          {record.sub_records
            .filter((s) => s.record_holder_id != null)
            .map((sub) => (
              <div key={sub.record_key} className="px-4 py-3 border-b border-border last:border-b-0 bg-bg-secondary/50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-text-primary">{sub.display_name}</div>
                    {sub.users && (
                      <div
                        className="flex items-center gap-1.5 mt-1 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => navigate(`/profile?user=${sub.users.id}`)}
                      >
                        <span className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-[10px] flex-shrink-0">
                          {sub.users.avatar_emoji || sub.users.display_name?.[0]?.toUpperCase()}
                        </span>
                        <span className="text-xs text-text-secondary">{sub.users.display_name || sub.users.username}</span>
                      </div>
                    )}
                  </div>
                  <div className="text-lg font-bold text-accent">{formatRecordValue(sub)}</div>
                </div>
              </div>
            ))}
          {record.sub_records.filter((s) => s.record_holder_id != null).length === 0 && (
            <div className="px-4 py-3 text-sm text-text-muted italic">No sport records set yet</div>
          )}
        </div>
      )}
    </div>
  )
}

export default function RecordBookPage() {
  const { data: records, isLoading, isError, refetch } = useRecords()

  // Group records by category — only show records that have a holder
  const grouped = {}
  for (const cat of CATEGORY_ORDER) {
    grouped[cat] = []
  }
  for (const record of records || []) {
    if (grouped[record.category] && record.record_holder_id) {
      // Also filter sub-records to only those with holders
      const filtered = { ...record, sub_records: (record.sub_records || []).filter((s) => s.record_holder_id) }
      grouped[record.category].push(filtered)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-2">IKB Official Record Book</h1>
      <p className="text-sm text-text-muted mb-6">All-time records across I KNOW BALL</p>

      {isLoading ? (
        <LoadingSpinner />
      ) : isError ? (
        <ErrorState title="Failed to load records" message="Check your connection and try again." onRetry={refetch} />
      ) : !records?.length ? (
        <EmptyState title="No records yet" message="Records will appear as picks are settled." />
      ) : (
        <div className="space-y-8">
          {CATEGORY_ORDER.map((cat) => {
            const catRecords = grouped[cat]
            if (!catRecords?.length) return null
            return (
              <div key={cat}>
                <h2 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
                  {CATEGORY_LABELS[cat]}
                </h2>
                <div className="space-y-3">
                  {catRecords.map((record) => (
                    <RecordCard key={record.record_key} record={record} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

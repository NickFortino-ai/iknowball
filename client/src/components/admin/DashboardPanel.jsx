import { useState } from 'react'
import { useAdminDashboard } from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'

const RANGES = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: '90d', label: '90 days' },
]

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  bracket: 'Bracket',
  squares: 'Squares',
  fantasy: 'Fantasy Football',
  nba_dfs: 'NBA DFS',
  mlb_dfs: 'MLB DFS',
  hr_derby: 'HR Derby',
  td_pass: 'TD Pass',
}

function formatRelativeTime(iso) {
  if (!iso) return ''
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function GrowthBadge({ pct }) {
  if (pct == null) return <span className="text-xs text-text-muted">—</span>
  const positive = pct >= 0
  return (
    <span className={`text-xs font-semibold ${positive ? 'text-correct' : 'text-incorrect'}`}>
      {positive ? '+' : ''}{pct}%
    </span>
  )
}

function MetricCard({ label, value, sublabel, growth }) {
  return (
    <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-5">
      <div className="text-xs text-text-muted uppercase tracking-wider mb-2">{label}</div>
      <div className="flex items-baseline gap-2">
        <div className="font-display text-3xl text-white">{value}</div>
        {growth !== undefined && <GrowthBadge pct={growth} />}
      </div>
      {sublabel && <div className="text-xs text-text-muted mt-2">{sublabel}</div>}
    </div>
  )
}

export default function DashboardPanel() {
  const [range, setRange] = useState('30d')
  const { data, isLoading, isError } = useAdminDashboard(range)

  if (isLoading) return <LoadingSpinner />
  if (isError || !data) return <p className="text-text-muted">Failed to load dashboard.</p>

  const { users, engagement, revenue, leagues, picks, promoCodes, latest } = data

  return (
    <div className="space-y-6">
      {/* Range selector */}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              range === r.key
                ? 'bg-accent text-white'
                : 'bg-bg-primary border border-text-primary/20 text-text-secondary hover:bg-bg-primary/70'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* Phase 1: 6 essential metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard
          label="Total users"
          value={users.total.toLocaleString()}
          sublabel={`${users.newThisPeriod.toLocaleString()} new this period`}
        />
        <MetricCard
          label="Signups"
          value={users.newThisPeriod.toLocaleString()}
          growth={users.growthPct}
          sublabel="vs prior period"
        />
        <MetricCard
          label="DAU"
          value={engagement.dau.toLocaleString()}
          sublabel="users active in last 24h"
        />
        <MetricCard
          label="Paid subscribers"
          value={revenue.paidActive.toLocaleString()}
          sublabel={`${revenue.monthlyCount} mo · ${revenue.yearlyCount} yr · ${revenue.lifetimeCount} life`}
        />
        <MetricCard
          label="MRR estimate"
          value={`$${revenue.mrrEstimate.toLocaleString()}`}
          sublabel={`${revenue.newPaidThisPeriod} new paid this period`}
        />
        <MetricCard
          label="Leagues created"
          value={leagues.newThisPeriod.toLocaleString()}
          growth={leagues.growthPct}
          sublabel="vs prior period"
        />
        <MetricCard
          label="Picks made"
          value={picks.newThisPeriod.toLocaleString()}
          growth={picks.growthPct}
          sublabel="vs prior period"
        />
      </div>

      {/* Promo codes — usage by code */}
      <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-5">
        <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Promo code usage</div>
        {(!promoCodes || promoCodes.length === 0) ? (
          <p className="text-sm text-text-muted">No promo codes created</p>
        ) : (
          <div className="space-y-2">
            {promoCodes.map((p) => (
              <div key={p.code} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-text-primary">{p.code}</span>
                    {!p.is_active && (
                      <span className="text-[10px] uppercase text-text-muted">Inactive</span>
                    )}
                  </div>
                </div>
                <div className="text-sm text-text-primary shrink-0">
                  <span className="font-semibold">{p.current_uses}</span>
                  <span className="text-text-muted"> / {p.max_uses ?? '∞'}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Latest activity — real-time pulse */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-5">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Latest signups</div>
          {latest.users.length === 0 ? (
            <p className="text-sm text-text-muted">No recent signups</p>
          ) : (
            <div className="space-y-2.5">
              {latest.users.map((u) => (
                <div key={u.id} className="flex items-center gap-3">
                  <Avatar user={u} size="md" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{u.display_name || u.username}</div>
                    <div className="text-xs text-text-muted truncate">@{u.username}</div>
                  </div>
                  <div className="text-xs text-text-muted shrink-0">{formatRelativeTime(u.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-bg-primary border border-text-primary/20 rounded-xl p-5">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Latest leagues</div>
          {latest.leagues.length === 0 ? (
            <p className="text-sm text-text-muted">No recent leagues</p>
          ) : (
            <div className="space-y-2.5">
              {latest.leagues.map((l) => (
                <div key={l.id} className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-text-primary truncate">{l.name}</div>
                    <div className="text-xs text-text-muted truncate">
                      {FORMAT_LABELS[l.format] || l.format} · @{l.users?.username || 'unknown'}
                    </div>
                  </div>
                  <div className="text-xs text-text-muted shrink-0">{formatRelativeTime(l.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

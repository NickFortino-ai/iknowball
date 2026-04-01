import { useState } from 'react'
import { useLeagueReport } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'

function PlayerRow({ name, headshot, stat, statLabel, subtext }) {
  return (
    <div className="flex items-center gap-3 py-2">
      {headshot ? (
        <img src={headshot} alt={name} className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted text-xs shrink-0">?</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
        {subtext && <div className="text-xs text-text-muted">{subtext}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-display text-accent">{stat}</div>
        {statLabel && <div className="text-[10px] text-text-muted">{statLabel}</div>}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-5">
      <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  )
}

function UserReport({ report, isMe }) {
  const { user, mostPlayed, pickOfTheYear, bestValuePlays, worstInvestments, uniquePlayersRostered, favoritePosition, seasonStats } = report

  return (
    <div className={`rounded-xl border p-4 ${isMe ? 'border-accent/50 bg-accent/5' : 'border-text-primary/20 bg-bg-primary'}`}>
      {/* User header */}
      <div className="flex items-center gap-3 mb-4">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="font-display text-base text-text-primary truncate">{user.displayName}</div>
          <div className="text-xs text-text-muted">@{user.username}</div>
        </div>
      </div>

      {/* Season overview */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-accent">{seasonStats.wins}</div>
          <div className="text-[10px] text-text-muted">Wins</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-text-primary">{seasonStats.avgPointsPerNight}</div>
          <div className="text-[10px] text-text-muted">Avg Pts</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-text-primary">{uniquePlayersRostered}</div>
          <div className="text-[10px] text-text-muted">Players Used</div>
        </div>
      </div>

      {/* Pick of the Year */}
      {pickOfTheYear && (
        <Section title="Pick of the Year">
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
            <PlayerRow
              name={pickOfTheYear.playerName}
              headshot={pickOfTheYear.headshot}
              stat={`${pickOfTheYear.points} pts`}
              statLabel={`$${pickOfTheYear.salary.toLocaleString()}`}
              subtext={pickOfTheYear.date}
            />
          </div>
        </Section>
      )}

      {/* Most Played */}
      {mostPlayed.length > 0 && (
        <Section title="Most Rostered Players">
          <div className="divide-y divide-text-primary/10">
            {mostPlayed.map((p, i) => (
              <PlayerRow
                key={i}
                name={p.playerName}
                headshot={p.headshot}
                stat={`${p.timesRostered}x`}
                statLabel={`${p.avgPoints} avg`}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Best Value Plays */}
      {bestValuePlays.length > 0 && (
        <Section title="Best Value Plays">
          <div className="divide-y divide-text-primary/10">
            {bestValuePlays.map((p, i) => (
              <PlayerRow
                key={i}
                name={p.playerName}
                headshot={p.headshot}
                stat={`${p.points} pts`}
                statLabel={`$${p.salary.toLocaleString()}`}
                subtext={p.date}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Worst Investments */}
      {worstInvestments.length > 0 && (
        <Section title="Worst Investments">
          <div className="divide-y divide-text-primary/10">
            {worstInvestments.map((p, i) => (
              <PlayerRow
                key={i}
                name={p.playerName}
                headshot={p.headshot}
                stat={`${p.points} pts`}
                statLabel={`$${p.salary.toLocaleString()}`}
                subtext={p.date}
              />
            ))}
          </div>
        </Section>
      )}

      {/* Season Stats */}
      <Section title="Season Summary">
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-text-muted">Total Points</span>
            <span className="text-text-primary font-semibold">{seasonStats.totalPointsScored}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Total Salary Spent</span>
            <span className="text-text-primary font-semibold">${seasonStats.totalSalarySpent.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Contest Days Played</span>
            <span className="text-text-primary font-semibold">{seasonStats.contestDaysPlayed}</span>
          </div>
          {seasonStats.longestWinStreak > 1 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Longest Win Streak</span>
              <span className="text-accent font-semibold">{seasonStats.longestWinStreak}</span>
            </div>
          )}
          {seasonStats.bestNight && (
            <div className="flex justify-between">
              <span className="text-text-muted">Best Night</span>
              <span className="text-text-primary font-semibold">{seasonStats.bestNight.points} pts ({seasonStats.bestNight.date})</span>
            </div>
          )}
          {favoritePosition && (
            <div className="flex justify-between">
              <span className="text-text-muted">Favorite Position</span>
              <span className="text-text-primary font-semibold">{favoritePosition.position}</span>
            </div>
          )}
        </div>
      </Section>
    </div>
  )
}

export default function LeagueReport({ leagueId, onClose }) {
  const { profile } = useAuth()
  const { data, isLoading, error } = useLeagueReport(leagueId)
  const [selectedUserId, setSelectedUserId] = useState(null)

  if (isLoading) return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <LoadingSpinner />
    </div>
  )

  if (error || !data?.report) return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg-secondary rounded-2xl p-6 text-center max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-text-primary font-semibold mb-2">No Report Available</p>
        <p className="text-text-muted text-sm">Reports are generated when a league completes with 10+ contest days.</p>
        <button onClick={onClose} className="mt-4 text-accent text-sm font-semibold">Close</button>
      </div>
    </div>
  )

  const report = data.report
  const userIds = Object.keys(report.users || {})
  const currentUserId = selectedUserId || profile?.id || userIds[0]
  const currentReport = report.users?.[currentUserId]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full md:max-w-lg max-h-[90vh] rounded-t-2xl md:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-bg-secondary border-b border-text-primary/10 px-4 py-3 flex items-center justify-between z-10">
          <h3 className="font-display text-lg">Season Report</h3>
          <button onClick={onClose} className="text-text-muted p-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* User selector */}
        {userIds.length > 1 && (
          <div className="px-4 py-3 flex gap-2 overflow-x-auto scrollbar-hide border-b border-text-primary/10">
            {userIds.map((uid) => {
              const u = report.users[uid]?.user
              if (!u) return null
              const isActive = uid === currentUserId
              return (
                <button
                  key={uid}
                  onClick={() => setSelectedUserId(uid)}
                  className={`shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    isActive ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                  }`}
                >
                  <Avatar user={u} size="xs" />
                  {u.displayName || u.username}
                </button>
              )
            })}
          </div>
        )}

        {/* Report content */}
        <div className="p-4">
          <div className="text-xs text-text-muted text-center mb-4">{report.contestDays} contest days</div>
          {currentReport ? (
            <UserReport report={currentReport} isMe={currentUserId === profile?.id} />
          ) : (
            <p className="text-center text-text-muted text-sm">No report data for this user.</p>
          )}
        </div>
      </div>
    </div>
  )
}

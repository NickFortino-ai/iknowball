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

// =====================================================================
// DFS User Report (NBA, MLB, NFL Salary Cap)
// =====================================================================

function DfsUserReport({ report, isMe }) {
  const { user, mostPlayed, pickOfTheYear, bestValuePlays, worstInvestments, uniquePlayersRostered, favoritePosition, seasonStats } = report

  return (
    <div className={`rounded-xl border p-4 ${isMe ? 'border-accent/50 bg-accent/5' : 'border-text-primary/20 bg-bg-primary'}`}>
      <div className="flex items-center gap-3 mb-4">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="font-display text-base text-text-primary truncate">{user.displayName}</div>
          <div className="text-xs text-text-muted">@{user.username}</div>
        </div>
      </div>

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

      {mostPlayed.length > 0 && (
        <Section title="Most Rostered Players">
          <div className="divide-y divide-text-primary/10">
            {mostPlayed.map((p, i) => (
              <PlayerRow key={i} name={p.playerName} headshot={p.headshot} stat={`${p.timesRostered}x`} statLabel={`${p.avgPoints} avg`} />
            ))}
          </div>
        </Section>
      )}

      {bestValuePlays.length > 0 && (
        <Section title="Best Value Plays">
          <div className="divide-y divide-text-primary/10">
            {bestValuePlays.map((p, i) => (
              <PlayerRow key={i} name={p.playerName} headshot={p.headshot} stat={`${p.points} pts`} statLabel={`$${p.salary.toLocaleString()}`} subtext={p.date} />
            ))}
          </div>
        </Section>
      )}

      {worstInvestments.length > 0 && (
        <Section title="Worst Investments">
          <div className="divide-y divide-text-primary/10">
            {worstInvestments.map((p, i) => (
              <PlayerRow key={i} name={p.playerName} headshot={p.headshot} stat={`${p.points} pts`} statLabel={`$${p.salary.toLocaleString()}`} subtext={p.date} />
            ))}
          </div>
        </Section>
      )}

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

// =====================================================================
// Traditional Fantasy User Report
// =====================================================================

function TraditionalUserReport({ report, isMe }) {
  const { user, seasonRecord, draftAnalysis, tradeAnalysis, bestWaiverPickup, teamMvp } = report

  return (
    <div className={`rounded-xl border p-4 ${isMe ? 'border-accent/50 bg-accent/5' : 'border-text-primary/20 bg-bg-primary'}`}>
      <div className="flex items-center gap-3 mb-4">
        <Avatar user={user} size="lg" />
        <div className="min-w-0">
          <div className="font-display text-base text-text-primary truncate">{user.displayName}</div>
          <div className="text-xs text-text-muted">@{user.username}</div>
        </div>
        {seasonRecord.standing && (
          <div className="ml-auto text-right">
            <div className="font-display text-2xl text-accent">#{seasonRecord.standing}</div>
            <div className="text-[10px] text-text-muted">Final</div>
          </div>
        )}
      </div>

      {/* Season record grid */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-correct">{seasonRecord.wins}</div>
          <div className="text-[10px] text-text-muted">Wins</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-incorrect">{seasonRecord.losses}</div>
          <div className="text-[10px] text-text-muted">Losses</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-accent">{seasonRecord.pointsFor}</div>
          <div className="text-[10px] text-text-muted">PF</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2 text-center">
          <div className="font-display text-lg text-text-secondary">{seasonRecord.pointsAgainst}</div>
          <div className="text-[10px] text-text-muted">PA</div>
        </div>
      </div>

      {/* Streaks */}
      {(seasonRecord.longestWinStreak > 1 || seasonRecord.longestLoseStreak > 1) && (
        <div className="flex gap-3 mb-5 text-sm">
          {seasonRecord.longestWinStreak > 1 && (
            <div className="flex-1 bg-correct/10 border border-correct/20 rounded-lg p-2 text-center">
              <div className="font-display text-lg text-correct">{seasonRecord.longestWinStreak}</div>
              <div className="text-[10px] text-text-muted">Best Win Streak</div>
            </div>
          )}
          {seasonRecord.longestLoseStreak > 1 && (
            <div className="flex-1 bg-incorrect/10 border border-incorrect/20 rounded-lg p-2 text-center">
              <div className="font-display text-lg text-incorrect">{seasonRecord.longestLoseStreak}</div>
              <div className="text-[10px] text-text-muted">Worst Lose Streak</div>
            </div>
          )}
        </div>
      )}

      {/* Team MVP */}
      {teamMvp && (
        <Section title="Team MVP">
          <div className="bg-accent/10 border border-accent/30 rounded-lg p-3">
            <PlayerRow
              name={teamMvp.player.name}
              headshot={teamMvp.player.headshot}
              stat={`${teamMvp.player.position || ''}`}
              statLabel={`${teamMvp.totalPoints} pts`}
            />
          </div>
        </Section>
      )}

      {/* Draft Analysis */}
      {draftAnalysis && (
        <Section title="Draft Report">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-bg-card/50 rounded-lg px-3 py-2 text-center">
              <div className="font-display text-2xl text-accent">{draftAnalysis.draftGrade}</div>
              <div className="text-[10px] text-text-muted">Grade</div>
            </div>
            <div className="text-sm text-text-muted">
              {draftAnalysis.totalDraftedPoints} total points from drafted players
            </div>
          </div>

          {/* Best values */}
          {draftAnalysis.bestValues.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-correct font-semibold mb-1.5">Best Steals</div>
              <div className="divide-y divide-text-primary/10">
                {draftAnalysis.bestValues.map((p, i) => (
                  <PlayerRow
                    key={i}
                    name={p.player.name}
                    headshot={p.player.headshot}
                    stat={p.positionRank || ''}
                    statLabel={`${p.seasonPoints} pts`}
                    subtext={`Rd ${p.round}, Pick ${p.pickNumber} — drafted as ${p.player.position}${p.draftedAsPositionPick}`}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Biggest busts */}
          {draftAnalysis.biggestBusts.length > 0 && (
            <div>
              <div className="text-[11px] text-incorrect font-semibold mb-1.5">Biggest Busts</div>
              <div className="divide-y divide-text-primary/10">
                {draftAnalysis.biggestBusts.map((p, i) => (
                  <PlayerRow
                    key={i}
                    name={p.player.name}
                    headshot={p.player.headshot}
                    stat={p.positionRank || ''}
                    statLabel={`${p.seasonPoints} pts`}
                    subtext={`Rd ${p.round}, Pick ${p.pickNumber} — drafted as ${p.player.position}${p.draftedAsPositionPick}`}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>
      )}

      {/* Trade Analysis */}
      {tradeAnalysis.length > 0 && (
        <Section title="Trades">
          <div className="space-y-3">
            {tradeAnalysis.map((t, i) => (
              <div key={i} className={`rounded-lg border p-3 ${t.won ? 'border-correct/30 bg-correct/5' : 'border-incorrect/30 bg-incorrect/5'}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Avatar user={t.partnerUser} size="xs" />
                    <span className="text-xs text-text-muted">Week {t.week}</span>
                  </div>
                  <span className={`text-sm font-display ${t.won ? 'text-correct' : 'text-incorrect'}`}>
                    {t.netPoints > 0 ? '+' : ''}{t.netPoints} pts
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-text-muted mb-1">Sent</div>
                    {t.sent.map((s, j) => (
                      <div key={j} className="flex items-center gap-1.5 py-0.5">
                        {s.player.headshot ? <img src={s.player.headshot} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" /> : <div className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />}
                        <span className="text-text-primary truncate">{s.player.name}</span>
                        <span className="text-text-muted ml-auto shrink-0">{s.pointsAfterTrade}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-text-muted mb-1">Received</div>
                    {t.received.map((r, j) => (
                      <div key={j} className="flex items-center gap-1.5 py-0.5">
                        {r.player.headshot ? <img src={r.player.headshot} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" /> : <div className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />}
                        <span className="text-text-primary truncate">{r.player.name}</span>
                        <span className="text-text-muted ml-auto shrink-0">{r.pointsAfterTrade}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Best Waiver Pickup */}
      {bestWaiverPickup && (
        <Section title="Best Waiver Pickup">
          <div className="bg-bg-card/50 rounded-lg p-3">
            <PlayerRow
              name={bestWaiverPickup.player.name}
              headshot={bestWaiverPickup.player.headshot}
              stat={`${bestWaiverPickup.pointsProduced} pts`}
              statLabel={bestWaiverPickup.bidAmount > 0 ? `$${bestWaiverPickup.bidAmount} FAAB` : 'Free'}
            />
          </div>
        </Section>
      )}
    </div>
  )
}

// =====================================================================
// Award Cards
// =====================================================================

function AwardCard({ title, user, rightValue, context }) {
  return (
    <div className="bg-bg-card rounded-xl border border-text-primary/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">{title}</div>
      <div className="flex items-center gap-3">
        {user && <Avatar user={user} size="sm" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary truncate">{user?.displayName || user?.username || 'Unknown'}</div>
        </div>
        {rightValue && <div className="font-display text-lg text-accent">{rightValue}</div>}
      </div>
      {context && <div className="text-[11px] text-text-muted mt-2">{context}</div>}
    </div>
  )
}

function PlayerAwardCard({ title, playerName, headshot, rightValue, context, user }) {
  return (
    <div className="bg-bg-card rounded-xl border border-text-primary/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">{title}</div>
      <div className="flex items-center gap-3">
        {headshot ? (
          <img src={headshot} alt="" className="w-10 h-10 rounded-full object-cover bg-bg-secondary shrink-0" />
        ) : (
          <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text-primary truncate">{playerName}</div>
          {user && <div className="text-[11px] text-text-muted truncate">{user.displayName || user.username}</div>}
        </div>
        {rightValue && <div className="font-display text-lg text-accent">{rightValue}</div>}
      </div>
      {context && <div className="text-[11px] text-text-muted mt-2">{context}</div>}
    </div>
  )
}

function MatchupAwardCard({ title, entry }) {
  if (!entry) return null
  return (
    <div className="bg-bg-card rounded-xl border border-text-primary/20 p-3">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">{title}</div>
      <div className="flex items-center gap-2">
        <Avatar user={entry.winner.user} size="sm" />
        <div className="flex-1 min-w-0 text-center">
          <div className="text-sm font-display">
            <span className="text-correct">{entry.winner.points}</span>
            <span className="text-text-muted mx-1">-</span>
            <span className="text-incorrect">{entry.loser.points}</span>
          </div>
          <div className="text-[10px] text-text-muted">Week {entry.week} &middot; {entry.margin} pt margin</div>
        </div>
        <Avatar user={entry.loser.user} size="sm" />
      </div>
    </div>
  )
}

// =====================================================================
// DFS League Awards
// =====================================================================

function DfsLeagueAwards({ awards }) {
  if (!awards) return null
  return (
    <div className="mb-6 space-y-3">
      <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">League Awards</h4>
      {awards.topScorer && (
        <AwardCard
          title="Top Scorer Overall"
          user={awards.topScorer.user}
          rightValue={`${awards.topScorer.totalPoints} pts`}
          context={awards.topScorer.context}
        />
      )}
      {awards.mostRosteredPlayer && (
        <PlayerAwardCard
          title="Most Rostered Player"
          playerName={awards.mostRosteredPlayer.playerName}
          headshot={awards.mostRosteredPlayer.headshot}
          rightValue={`${awards.mostRosteredPlayer.timesRostered}x`}
          context={awards.mostRosteredPlayer.context}
        />
      )}
      {awards.mostContrarianPick && (
        <PlayerAwardCard
          title="Most Contrarian Pick"
          playerName={awards.mostContrarianPick.playerName}
          headshot={awards.mostContrarianPick.headshot}
          rightValue={`${awards.mostContrarianPick.points} pts`}
          context={awards.mostContrarianPick.context}
        />
      )}
    </div>
  )
}

// =====================================================================
// Traditional Fantasy League Awards
// =====================================================================

function TraditionalLeagueAwards({ awards, champion }) {
  if (!awards) return null
  return (
    <div className="mb-6 space-y-3">
      {/* League Champion — featured prominently at the top */}
      {champion && (
        <div className="bg-gradient-to-br from-yellow-500/20 to-accent/10 border border-yellow-500/40 rounded-xl p-4 text-center mb-2">
          <div className="text-[10px] uppercase tracking-widest text-yellow-500 mb-2">League Champion</div>
          <div className="flex justify-center mb-2">
            <Avatar user={champion.user} size="xl" />
          </div>
          <div className="font-display text-xl text-text-primary">{champion.user.displayName || champion.user.username}</div>
          <div className="text-sm text-text-muted mt-1">
            {champion.seasonRecord.wins}-{champion.seasonRecord.losses} &middot; {champion.seasonRecord.pointsFor} pts
          </div>
        </div>
      )}

      <h4 className="text-xs text-text-muted uppercase tracking-wider mb-2">League Awards</h4>
      {awards.highestScorer && (
        <AwardCard
          title="Highest Scorer"
          user={awards.highestScorer.user}
          rightValue={`${awards.highestScorer.totalPointsFor} pts`}
          context={awards.highestScorer.context}
        />
      )}
      <MatchupAwardCard title="Biggest Blowout" entry={awards.biggestBlowout} />
      <MatchupAwardCard title="Closest Game" entry={awards.closestGame} />
      {awards.bestDraft && (
        <AwardCard
          title="Best Draft"
          user={awards.bestDraft.user}
          rightValue={awards.bestDraft.draftGrade}
          context={`${awards.bestDraft.totalDraftedPoints} total points from drafted players`}
        />
      )}
      {awards.bestTrade && (
        <AwardCard
          title="Best Trade"
          user={awards.bestTrade.user}
          rightValue={`+${awards.bestTrade.netPoints}`}
          context={`Won trade in week ${awards.bestTrade.week}`}
        />
      )}
      {awards.bestWaiverPickup && (
        <PlayerAwardCard
          title="Best Waiver Pickup"
          playerName={awards.bestWaiverPickup.player.name}
          headshot={awards.bestWaiverPickup.player.headshot}
          rightValue={`${awards.bestWaiverPickup.pointsProduced} pts`}
          user={awards.bestWaiverPickup.user}
        />
      )}
      {awards.leagueMvp && (
        <PlayerAwardCard
          title="League MVP"
          playerName={awards.leagueMvp.player.name}
          headshot={awards.leagueMvp.player.headshot}
          rightValue={`${awards.leagueMvp.totalPoints} pts`}
        />
      )}
    </div>
  )
}

// =====================================================================
// Main Component
// =====================================================================

export default function LeagueReport({ leagueId, leagueName, memberCount, onClose }) {
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
        <p className="text-text-muted text-sm">Reports are generated when a league completes with enough contest days (10+ for NBA/MLB, 6+ weeks for NFL).</p>
        <button onClick={onClose} className="mt-4 text-accent text-sm font-semibold">Close</button>
      </div>
    </div>
  )

  const report = data.report
  const isTraditional = report.format === 'traditional_fantasy'
  const userIds = Object.keys(report.users || {})
  const currentUserId = selectedUserId || profile?.id || userIds[0]
  const currentReport = report.users?.[currentUserId]

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full md:max-w-lg max-h-[90vh] rounded-t-2xl md:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Branded header */}
        <div className="sticky top-0 bg-bg-secondary border-b border-text-primary/10 px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <div className="font-display text-[10px] uppercase tracking-widest text-accent mb-0.5">I KNOW BALL</div>
              <h3 className="font-display text-lg text-text-primary truncate">{leagueName || 'League Report'}</h3>
              <div className="text-xs text-text-muted">
                {isTraditional
                  ? `${report.season} Season \u00b7 ${report.totalWeeks} weeks \u00b7 ${memberCount || userIds.length} teams`
                  : report.contestWeeks
                    ? `${report.contestWeeks} weeks \u00b7 ${memberCount || userIds.length} players`
                    : `${report.contestDays} contest days \u00b7 ${memberCount || userIds.length} players`}
              </div>
            </div>
            <button onClick={onClose} className="text-text-muted p-1 shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
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
          {/* League-wide awards */}
          {isTraditional
            ? <TraditionalLeagueAwards
                awards={report.leagueAwards}
                champion={Object.values(report.users || {}).find((u) => u.seasonRecord?.standing === 1)}
              />
            : <DfsLeagueAwards awards={report.leagueAwards} />
          }

          {/* Per-user report */}
          {currentReport ? (
            isTraditional
              ? <TraditionalUserReport report={currentReport} isMe={currentUserId === profile?.id} />
              : <DfsUserReport report={currentReport} isMe={currentUserId === profile?.id} />
          ) : (
            <p className="text-center text-text-muted text-sm">No report data for this user.</p>
          )}

          {/* Footer branding */}
          <div className="text-center mt-6 mb-2">
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50">I KNOW BALL</div>
          </div>
        </div>
      </div>
    </div>
  )
}

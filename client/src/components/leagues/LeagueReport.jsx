import { useState } from 'react'
import { useLeagueReport } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import Avatar from '../ui/Avatar'
import LoadingSpinner from '../ui/LoadingSpinner'

// Round floating point display values (241.09999999999997 → 241.1)
const fmt = (v) => typeof v === 'number' ? parseFloat(v.toFixed(1)) : v

// Map report user objects (camelCase) to Avatar-compatible format (snake_case)
const toAvatarUser = (u) => u ? { ...u, avatar_url: u.avatarUrl, avatar_emoji: u.avatarEmoji } : u

function getInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  return parts.length >= 2 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : name[0].toUpperCase()
}

function PlayerRow({ name, headshot, stat, statLabel, subtext }) {
  return (
    <div className="flex items-center gap-3 md:gap-4 py-2.5 md:py-3">
      {headshot ? (
        <img src={headshot} alt={name} className="w-11 h-11 md:w-14 md:h-14 rounded-full object-cover bg-bg-secondary shrink-0" />
      ) : (
        <div className="w-11 h-11 md:w-14 md:h-14 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted text-sm md:text-base font-semibold shrink-0">{getInitials(name)}</div>
      )}
      <div className="flex-1 min-w-0">
        <div className="text-sm md:text-base font-semibold text-text-primary truncate">{name}</div>
        {subtext && <div className="text-xs md:text-sm text-text-muted">{subtext}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm md:text-lg font-display text-text-primary">{stat}</div>
        {statLabel && <div className="text-[10px] md:text-xs text-text-muted">{statLabel}</div>}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6 md:mb-8">
      <h4 className="text-xs md:text-sm text-text-muted uppercase tracking-wider mb-2 md:mb-3">{title}</h4>
      {children}
    </div>
  )
}

// =====================================================================
// DFS User Report (NBA, MLB, NFL Salary Cap)
// =====================================================================

function DfsUserReport({ report, isMe }) {
  const { user, mostPlayed, pickOfTheYear, bestValuePlays, heavyLifters, uniquePlayersRostered, favoritePosition, seasonStats } = report

  return (
    <div className={`rounded-xl border p-4 md:p-6 ${isMe ? 'border-accent/50 bg-bg-primary' : 'border-text-primary/20 bg-bg-primary'}`}>
      <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-6">
        <Avatar user={toAvatarUser(user)} size="xl" />
        <div className="min-w-0">
          <div className="font-display text-lg md:text-xl text-text-primary truncate">{user.displayName}</div>
          <div className="text-xs md:text-sm text-text-muted">@{user.username}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 md:gap-3 mb-5 md:mb-6">
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-text-primary">{seasonStats.wins}</div>
          <div className="text-[10px] md:text-xs text-text-muted">Wins</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-text-primary">{seasonStats.avgPointsPerNight}</div>
          <div className="text-[10px] md:text-xs text-text-muted">Avg Pts</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-text-primary">{uniquePlayersRostered}</div>
          <div className="text-[10px] md:text-xs text-text-muted">Players Used</div>
        </div>
      </div>

      {pickOfTheYear && (
        <Section title="Pick of the Year">
          <div className="border border-accent/40 rounded-lg p-3 md:p-4">
            <PlayerRow
              name={pickOfTheYear.playerName}
              headshot={pickOfTheYear.headshot}
              stat={`${fmt(pickOfTheYear.points)} pts`}
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
              <PlayerRow key={i} name={p.playerName} headshot={p.headshot} stat={`${fmt(p.points)} pts`} statLabel={`$${p.salary.toLocaleString()}`} subtext={p.date} />
            ))}
          </div>
        </Section>
      )}

      {heavyLifters?.length > 0 && (
        <Section title="Heavy Lifters">
          <div className="divide-y divide-text-primary/10">
            {heavyLifters.map((p, i) => (
              <PlayerRow key={i} name={p.playerName} headshot={p.headshot} stat={`${fmt(p.totalPoints)} pts`} statLabel={`${p.appearances} games`} />
            ))}
          </div>
        </Section>
      )}

      <Section title="Season Summary">
        <div className="space-y-2 md:space-y-3 text-sm md:text-base">
          <div className="flex justify-between">
            <span className="text-text-muted">Total Points</span>
            <span className="text-text-primary font-semibold">{fmt(seasonStats.totalPointsScored)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-muted">Total Salary Spent</span>
            <span className="text-text-primary font-semibold">${seasonStats.totalSalarySpent.toLocaleString()}</span>
          </div>
          {seasonStats.totalSalarySpent > 0 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Avg Points Per $1,000 Spent</span>
              <span className="text-text-primary font-semibold">{fmt(seasonStats.totalPointsScored / seasonStats.totalSalarySpent * 1000)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-text-muted">Contest Days Played</span>
            <span className="text-text-primary font-semibold">{seasonStats.contestDaysPlayed}</span>
          </div>
          {seasonStats.longestWinStreak > 1 && (
            <div className="flex justify-between">
              <span className="text-text-muted">Longest Win Streak</span>
              <span className="text-text-primary font-semibold">{seasonStats.longestWinStreak}</span>
            </div>
          )}
          {seasonStats.bestNight && (
            <div className="flex justify-between">
              <span className="text-text-muted">Best Roster</span>
              <span className="text-text-primary font-semibold">{fmt(seasonStats.bestNight.points)} pts ({seasonStats.bestNight.date})</span>
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
    <div className={`rounded-xl border p-4 md:p-6 ${isMe ? 'border-accent/50 bg-bg-primary' : 'border-text-primary/20 bg-bg-primary'}`}>
      <div className="flex items-center gap-3 md:gap-4 mb-5 md:mb-6">
        <Avatar user={toAvatarUser(user)} size="xl" />
        <div className="min-w-0">
          <div className="font-display text-lg md:text-xl text-text-primary truncate">{user.displayName}</div>
          {user.fantasyTeamName && (
            <div className="text-xs md:text-sm italic uppercase tracking-wide text-text-secondary truncate">{user.fantasyTeamName}</div>
          )}
        </div>
        {seasonRecord.standing && (
          <div className="ml-auto text-right">
            <div className="font-display text-2xl md:text-4xl text-text-primary">#{seasonRecord.standing}</div>
            <div className="text-[10px] md:text-xs text-text-muted">Final</div>
          </div>
        )}
      </div>

      {/* Season record grid */}
      <div className="grid grid-cols-4 gap-2 md:gap-3 mb-5 md:mb-6">
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-correct">{seasonRecord.wins}</div>
          <div className="text-[10px] md:text-xs text-text-muted">Wins</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-incorrect">{seasonRecord.losses}</div>
          <div className="text-[10px] md:text-xs text-text-muted">Losses</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-text-primary">{fmt(seasonRecord.pointsFor)}</div>
          <div className="text-[10px] md:text-xs text-text-muted">PF</div>
        </div>
        <div className="bg-bg-card/50 rounded-lg p-2.5 md:p-4 text-center">
          <div className="font-display text-xl md:text-3xl text-text-secondary">{fmt(seasonRecord.pointsAgainst)}</div>
          <div className="text-[10px] md:text-xs text-text-muted">PA</div>
        </div>
      </div>

      {/* Streaks */}
      {(seasonRecord.longestWinStreak > 1 || seasonRecord.longestLoseStreak > 1) && (
        <div className="flex gap-3 mb-5 md:mb-6">
          {seasonRecord.longestWinStreak > 1 && (
            <div className="flex-1 bg-correct/10 border border-correct/20 rounded-lg p-2.5 md:p-4 text-center">
              <div className="font-display text-xl md:text-3xl text-correct">{seasonRecord.longestWinStreak}</div>
              <div className="text-[10px] md:text-xs text-text-muted">Best Win Streak</div>
            </div>
          )}
          {seasonRecord.longestLoseStreak > 1 && (
            <div className="flex-1 bg-incorrect/10 border border-incorrect/20 rounded-lg p-2.5 md:p-4 text-center">
              <div className="font-display text-xl md:text-3xl text-incorrect">{seasonRecord.longestLoseStreak}</div>
              <div className="text-[10px] md:text-xs text-text-muted">Worst Lose Streak</div>
            </div>
          )}
        </div>
      )}

      {/* Team MVP */}
      {teamMvp && (
        <Section title="Team MVP">
          <div className="border border-accent/40 rounded-lg p-3 md:p-4">
            <PlayerRow
              name={teamMvp.player.name}
              headshot={teamMvp.player.headshot}
              stat={`${teamMvp.player.position || ''}`}
              statLabel={`${fmt(teamMvp.totalPoints)} pts`}
            />
          </div>
        </Section>
      )}

      {/* Draft Analysis */}
      {draftAnalysis && (
        <Section title="Draft Report">
          <div className="flex items-center gap-3 md:gap-4 mb-3 md:mb-4">
            <div className="bg-bg-card/50 rounded-lg px-4 py-3 md:px-6 md:py-4 text-center">
              <div className="font-display text-2xl md:text-4xl text-text-primary">{draftAnalysis.draftGrade}</div>
              <div className="text-[10px] md:text-xs text-text-muted">Grade</div>
            </div>
            <div className="text-sm md:text-base text-text-muted">
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
                    <Avatar user={toAvatarUser(t.partnerUser)} size="xs" />
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
                        <span className="text-text-muted ml-auto shrink-0">{fmt(s.pointsAfterTrade)}</span>
                      </div>
                    ))}
                  </div>
                  <div>
                    <div className="text-text-muted mb-1">Received</div>
                    {t.received.map((r, j) => (
                      <div key={j} className="flex items-center gap-1.5 py-0.5">
                        {r.player.headshot ? <img src={r.player.headshot} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" /> : <div className="w-5 h-5 rounded-full bg-bg-secondary shrink-0" />}
                        <span className="text-text-primary truncate">{r.player.name}</span>
                        <span className="text-text-muted ml-auto shrink-0">{fmt(r.pointsAfterTrade)}</span>
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
              stat={`${fmt(bestWaiverPickup.pointsProduced)} pts`}
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
    <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 md:p-5">
      <div className="text-[10px] md:text-xs uppercase tracking-wider text-text-muted mb-2 md:mb-3">{title}</div>
      <div className="flex items-center gap-3 md:gap-4">
        {user && <Avatar user={toAvatarUser(user)} size="lg" />}
        <div className="flex-1 min-w-0">
          <div className="text-sm md:text-lg font-bold text-text-primary truncate">{user?.displayName || user?.username || 'Unknown'}</div>
        </div>
        {rightValue && <div className="font-display text-lg md:text-2xl text-text-primary">{rightValue}</div>}
      </div>
      {context && <div className="text-[11px] md:text-sm text-text-muted mt-2 md:mt-3">{context}</div>}
    </div>
  )
}

function PlayerAwardCard({ title, playerName, headshot, rightValue, context, user }) {
  return (
    <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 md:p-5">
      <div className="text-[10px] md:text-xs uppercase tracking-wider text-text-muted mb-2 md:mb-3">{title}</div>
      <div className="flex items-center gap-3 md:gap-4">
        {headshot ? (
          <img src={headshot} alt="" className="w-11 h-11 md:w-14 md:h-14 rounded-full object-cover bg-bg-secondary shrink-0" />
        ) : (
          <div className="w-11 h-11 md:w-14 md:h-14 rounded-full bg-bg-secondary flex items-center justify-center text-text-muted text-sm md:text-base font-semibold shrink-0">{getInitials(playerName)}</div>
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm md:text-lg font-bold text-text-primary truncate">{playerName}</div>
          {user && <div className="text-[11px] md:text-sm text-text-muted truncate">{user.displayName || user.username}</div>}
        </div>
        {rightValue && <div className="font-display text-lg md:text-2xl text-text-primary">{rightValue}</div>}
      </div>
      {context && <div className="text-[11px] md:text-sm text-text-muted mt-2 md:mt-3">{context}</div>}
    </div>
  )
}

function MatchupAwardCard({ title, entry }) {
  if (!entry) return null
  return (
    <div className="bg-bg-primary rounded-xl border border-text-primary/20 p-4 md:p-5">
      <div className="text-[10px] md:text-xs uppercase tracking-wider text-text-muted mb-2 md:mb-3">{title}</div>
      <div className="flex items-center gap-3 md:gap-4">
        <Avatar user={toAvatarUser(entry.winner.user)} size="lg" />
        <div className="flex-1 min-w-0 text-center">
          <div className="text-base md:text-xl font-display">
            <span className="text-correct">{fmt(entry.winner.points)}</span>
            <span className="text-text-muted mx-1.5">-</span>
            <span className="text-incorrect">{fmt(entry.loser.points)}</span>
          </div>
          <div className="text-[10px] md:text-xs text-text-muted">Week {entry.week} &middot; {entry.margin} pt margin</div>
        </div>
        <Avatar user={toAvatarUser(entry.loser.user)} size="lg" />
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
    <div className="mb-6 md:mb-8 space-y-3 md:space-y-4">
      <h4 className="text-xs md:text-sm text-text-muted uppercase tracking-wider mb-2 md:mb-3">League Awards</h4>
      {awards.topScorer && (
        <AwardCard
          title="Top Scorer Overall"
          user={awards.topScorer.user}
          rightValue={`${fmt(awards.topScorer.totalPoints)} pts`}
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
          rightValue={`${fmt(awards.mostContrarianPick.points)} pts`}
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
    <div className="mb-6 md:mb-8 space-y-3 md:space-y-4">
      {/* League Champion — featured prominently at the top */}
      {champion && (
        <div className="bg-gradient-to-br from-yellow-500/20 to-accent/10 border border-yellow-500/40 rounded-xl p-5 md:p-8 text-center mb-2">
          <div className="text-[10px] md:text-xs uppercase tracking-widest text-yellow-500 mb-3 md:mb-4">League Champion</div>
          <div className="flex justify-center mb-3">
            <Avatar user={toAvatarUser(champion.user)} size="2xl" />
          </div>
          <div className="font-display text-xl md:text-3xl text-text-primary">{champion.user.displayName || champion.user.username}</div>
          {champion.user.fantasyTeamName && (
            <div className="text-sm md:text-base italic uppercase tracking-wide text-text-secondary mt-0.5">{champion.user.fantasyTeamName}</div>
          )}
          <div className="text-sm md:text-base text-text-muted mt-1">
            {champion.seasonRecord.wins}-{champion.seasonRecord.losses} &middot; {fmt(champion.seasonRecord.pointsFor)} pts
          </div>
        </div>
      )}

      <h4 className="text-xs md:text-sm text-text-muted uppercase tracking-wider mb-2 md:mb-3">League Awards</h4>
      {awards.highestScorer && (
        <AwardCard
          title="Highest Scorer"
          user={awards.highestScorer.user}
          rightValue={`${fmt(awards.highestScorer.totalPointsFor)} pts`}
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
          rightValue={`${fmt(awards.bestWaiverPickup.pointsProduced)} pts`}
          user={awards.bestWaiverPickup.user}
        />
      )}
    </div>
  )
}

// =====================================================================
// Main Component
// =====================================================================

export default function LeagueReport({ leagueId, leagueName, memberCount, onClose, inline }) {
  const { profile } = useAuth()
  const { data, isLoading, error } = useLeagueReport(leagueId)
  const [selectedUserId, setSelectedUserId] = useState(null)

  if (isLoading) return inline ? (
    <div className="flex justify-center py-12"><LoadingSpinner /></div>
  ) : (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <LoadingSpinner />
    </div>
  )

  if (error || !data?.report) return inline ? (
    <div className="text-center py-12">
      <p className="text-text-primary font-semibold mb-2">No Report Available</p>
      <p className="text-text-muted text-sm">Reports are generated when a league completes with enough contest days (10+ for NBA/MLB, 6+ weeks for NFL).</p>
    </div>
  ) : (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div className="bg-bg-primary border border-text-primary/20 rounded-2xl p-6 text-center max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <p className="text-text-primary font-semibold mb-2">No Report Available</p>
        <p className="text-text-muted text-sm">Reports are generated when a league completes with enough contest days (10+ for NBA/MLB, 6+ weeks for NFL).</p>
        <button onClick={onClose} className="mt-4 text-accent text-sm font-semibold">Close</button>
      </div>
    </div>
  )

  const report = data.report
  const isTraditional = report.format === 'traditional_fantasy'
  const allUserIds = Object.keys(report.users || {})

  // Order tabs: current user first, then everyone else
  const myId = profile?.id
  const orderedUserIds = myId && allUserIds.includes(myId)
    ? [myId, ...allUserIds.filter((id) => id !== myId)]
    : allUserIds

  // 'league' tab is default, otherwise a user id
  const activeTab = selectedUserId || 'league'
  const currentReport = activeTab !== 'league' ? report.users?.[activeTab] : null

  const content = (
    <>
        {/* Branded header */}
        <div className={inline ? '' : 'sticky top-0 bg-bg-primary z-10'}>
          <div className="px-4 md:px-6 py-4 md:py-5 border-b border-text-primary/20">
            {!inline && (
              <div className="flex justify-end mb-2">
                <button onClick={onClose} className="text-text-muted p-1 shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            )}
            <div className="text-center mb-4">
              <div className="font-display text-sm md:text-base uppercase tracking-widest text-accent mb-1">I KNOW BALL</div>
              <h3 className="font-display text-xl md:text-2xl font-bold text-white">League Report</h3>
            </div>
            <div>
              <div className="font-display text-base md:text-lg text-text-primary truncate">{leagueName}</div>
              <div className="text-xs md:text-sm text-text-muted mt-0.5">
                {isTraditional
                  ? `${report.season} Season \u00b7 ${report.totalWeeks} weeks \u00b7 ${memberCount || allUserIds.length} teams`
                  : report.contestWeeks
                    ? `${report.contestWeeks} weeks \u00b7 ${memberCount || allUserIds.length} players`
                    : `${report.contestDays} contest days \u00b7 ${memberCount || allUserIds.length} players`}
              </div>
            </div>
          </div>

          {/* Tab bar — sticky below header */}
          <div className="relative border-b border-text-primary/20">
            {/* Fade hints for horizontal scroll */}
            <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-bg-primary to-transparent z-10" />
            <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-bg-primary to-transparent z-10" />
            <div className="flex gap-1 px-4 py-2 overflow-x-auto scrollbar-hide scroll-smooth" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* League tab */}
              <button
                onClick={() => setSelectedUserId('league')}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all border ${
                  activeTab === 'league'
                    ? 'bg-accent text-white border-accent shadow-sm shadow-accent/25'
                    : 'bg-bg-primary text-text-secondary border-text-primary/20 hover:border-accent/40'
                }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                League
              </button>
              {/* User tabs — current user first */}
              {orderedUserIds.map((uid) => {
                const u = report.users[uid]?.user
                if (!u) return null
                const isActive = activeTab === uid
                const isMe = uid === myId
                const avatarUser = { ...u, avatar_url: u.avatarUrl, avatar_emoji: u.avatarEmoji }
                return (
                  <button
                    key={uid}
                    onClick={() => setSelectedUserId(uid)}
                    className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all border ${
                      isActive
                        ? 'bg-accent text-white border-accent shadow-sm shadow-accent/25'
                        : 'bg-bg-primary text-text-secondary border-text-primary/20 hover:border-accent/40'
                    }`}
                  >
                    <Avatar user={avatarUser} size="xs" />
                    {isMe ? 'My Report' : (u.displayName || u.username)}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Report content */}
        <div className="p-4 md:p-6">
          {activeTab === 'league' ? (
            <>
              {isTraditional
                ? <TraditionalLeagueAwards
                    awards={report.leagueAwards}
                    champion={Object.values(report.users || {}).find((u) => u.seasonRecord?.standing === 1)}
                  />
                : <DfsLeagueAwards awards={report.leagueAwards} />
              }
            </>
          ) : currentReport ? (
            isTraditional
              ? <TraditionalUserReport report={currentReport} isMe={activeTab === myId} />
              : <DfsUserReport report={currentReport} isMe={activeTab === myId} />
          ) : (
            <p className="text-center text-text-muted text-sm">No report data for this user.</p>
          )}

          {/* Footer branding */}
          <div className="text-center mt-6 mb-2">
            <div className="text-[10px] uppercase tracking-widest text-text-muted/50">I KNOW BALL</div>
          </div>
        </div>
    </>
  )

  if (inline) return <div className="bg-bg-primary rounded-2xl border border-text-primary/20 overflow-y-auto">{content}</div>

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-primary border border-text-primary/20 w-full md:max-w-2xl max-h-[90vh] rounded-t-2xl md:rounded-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {content}
      </div>
    </div>
  )
}

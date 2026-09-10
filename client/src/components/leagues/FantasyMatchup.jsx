import { useState, useMemo, useEffect } from 'react'
import { buildStarterSlots as buildSlots } from '../../lib/rosterSlots'
import { useAuth } from '../../hooks/useAuth'
import { useReadState, useMarkRead, READ_KINDS } from '../../hooks/useReadState'
import { useFantasyMatchupLive, useFantasyMatchupWeek, useBlurbPlayerIds, usePlayoffBracket } from '../../hooks/useLeagues'
import Avatar from '../ui/Avatar'
import { SkeletonCard } from '../ui/Skeleton'
import PlayerDetailModal from './PlayerDetailModal'
import PlayoffBracket from './PlayoffBracket'
import BlurbDot, { markBlurbSeen } from './BlurbDot'
import InjuryBadge from '../ui/InjuryBadge'

// Build the starter slot key set + labels from a league's roster_slots
// config. Anything outside the configured set is treated as bench (e.g.
// orphan 'wr3' rows from a league shrunk to wr=2). Mirrors the helper in
// RosterList.jsx and FantasyMyTeam.jsx.
// Shared definition — lib/rosterSlots. Uses the compact labels because this
// grid's columns are too narrow for the full words.
function buildSlotMeta(rosterSlots) {
  const slots = buildSlots(rosterSlots)
  const labels = {}
  for (const s of slots) labels[s.key] = s.shortLabel
  const keys = slots.map((s) => s.key)
  return { starterSet: new Set(keys), slotOrder: keys, slotLabels: labels }
}

// Strip " D/ST" suffix — slot label already shows position
function displayName(name) {
  if (!name) return '--'
  return name.endsWith(' D/ST') ? name.replace(' D/ST', '') : name
}

// Split a player name into { first, last } for two-line rendering on the
// narrow mobile matchup column. "Christian McCaffrey" → { first:'Christian',
// last:'McCaffrey' }. Multi-word last names ("St. Brown", "Smith-Njigba")
// stay together on the bottom line. D/ST and single-word entries return
// last-only so the top line stays empty.
function splitName(name) {
  if (!name) return { first: '', last: '--' }
  if (name.endsWith(' D/ST')) return { first: '', last: name.replace(' D/ST', '') }
  const parts = name.split(' ')
  if (parts.length < 2) return { first: '', last: name }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}

function buildStatLine(stats, position) {
  if (!stats) return null
  const parts = []
  if (position === 'QB') {
    if (stats.pass_yds) parts.push(`${stats.pass_yds} PaYD`)
    if (stats.pass_td) parts.push(`${stats.pass_td} PaTD`)
    if (stats.int) parts.push(`${stats.int} INT`)
    if (stats.rush_yds) parts.push(`${stats.rush_yds} RuYD`)
    if (stats.rush_td) parts.push(`${stats.rush_td} RuTD`)
  } else if (position === 'K') {
    if (stats.fgm) parts.push(`${stats.fgm} FG`)
    if (stats.fgm_50_plus) parts.push(`${stats.fgm_50_plus} 50+`)
    if (stats.xpm) parts.push(`${stats.xpm} XP`)
  } else if (position === 'DEF') {
    if (stats.def_sack) parts.push(`${stats.def_sack} SK`)
    if (stats.def_int) parts.push(`${stats.def_int} INT`)
    if (stats.def_fum_rec) parts.push(`${stats.def_fum_rec} FR`)
    if (stats.def_td) parts.push(`${stats.def_td} TD`)
  } else {
    if (stats.rush_yds) parts.push(`${stats.rush_yds} RuYD`)
    if (stats.rush_td) parts.push(`${stats.rush_td} RuTD`)
    if (stats.rec) parts.push(`${stats.rec} Rec`)
    if (stats.rec_yds) parts.push(`${stats.rec_yds} ReYD`)
    if (stats.rec_td) parts.push(`${stats.rec_td} ReTD`)
  }
  return parts.length ? parts.join(', ') : null
}

function MatchupCard({ matchup, myId, weekStatus, isExpanded, onToggle, onPlayerClick, blurbIds, starterSet, slotLabels, isChampionship, compact = false }) {
  const isMyMatchup = matchup.home_user?.id === myId || matchup.away_user?.id === myId
  const isCompleted = matchup.status === 'completed' || weekStatus === 'past'
  const homeWinning = (matchup.home_points || 0) >= (matchup.away_points || 0)
  const hasScores = (matchup.home_points || 0) > 0 || (matchup.away_points || 0) > 0
  const [showBench, setShowBench] = useState(false)

  const homeStarters = (matchup.home_roster || []).filter((r) => starterSet.has(r.slot))
  const awayStarters = (matchup.away_roster || []).filter((r) => starterSet.has(r.slot))
  // IR is neither a starter nor a bench player. The !starterSet catch-all is
  // there to sweep up ORPHAN slots (a stale 'wr3' after a league shrinks to
  // wr=2) so nobody vanishes — but it was also swallowing IR, so a stashed
  // player padded the bench. JD's bench read 8 in the matchup and 7 in My
  // Team, which renders IR as its own section. IR players cannot score, so
  // they are excluded here rather than given a row.
  const isIr = (slot) => String(slot || '').toLowerCase().startsWith('ir')
  const homeBench = (matchup.home_roster || []).filter((r) => !starterSet.has(r.slot) && !isIr(r.slot))
  const awayBench = (matchup.away_roster || []).filter((r) => !starterSet.has(r.slot) && !isIr(r.slot))

  // Win probability from projections
  const hProj = matchup.home_projected || 0
  const aProj = matchup.away_projected || 0
  const totalProj = hProj + aProj
  const homePct = totalProj > 0 ? Math.round((hProj / totalProj) * 100) : 50
  // Pre-game projection survives the kickoff blend, so a completed matchup
  // shows what each team was projected to score rather than its own final
  // score restated.
  //
  // No `?? hProj` fallback: hProj is the blended value, which for a finished
  // matchup IS the final score — falling back to it was what produced
  // "Proj 156.4" beside 156.4. Past weeks legitimately have no stored
  // projection, so this stays null and the number is omitted entirely.
  const hPregame = matchup.home_pregame_projected ?? null
  const aPregame = matchup.away_pregame_projected ?? null

  return (
    <div className={`rounded-xl border-2 overflow-hidden ${
      isChampionship
        ? 'border-yellow-400 shadow-[0_0_18px_-4px_rgba(250,204,21,0.55)]'
        : isMyMatchup ? 'border-accent/40' : 'border-text-primary/20'
    }`}>
      {isChampionship && (
        <div className="bg-yellow-400/15 text-yellow-400 text-[10px] uppercase tracking-widest font-bold text-center py-1">
          Championship
        </div>
      )}
      {/* Matchup header — always visible */}
      {/* Tighter padding now that the header is one row — p-4 was sized for
          the old two-row stack and left a lot of dead space around a card
          half the height. */}
      <button onClick={onToggle} className="w-full px-3 py-2.5 md:px-4 md:py-3 hover:bg-text-primary/5 transition-colors">
        {/* Mobile: one line per team, stacked. The side-by-side layout below
            has to fit two names, two records and two scores across a phone,
            which truncates everything to initials. Stacking gives each team a
            full-width line, so long team names survive. Desktop keeps the
            single-row version — it has the horizontal room and benefits from
            the head-to-head read. */}
        <div className={`${compact ? "md:hidden" : "hidden"} space-y-1.5 mb-2`}>
          {[
            { user: matchup.home_user, points: matchup.home_points, proj: isCompleted ? hPregame : hProj, winning: homeWinning },
            { user: matchup.away_user, points: matchup.away_points, proj: isCompleted ? aPregame : aProj, winning: !homeWinning },
          ].map((side, i) => (
            <div key={i} className="flex items-center gap-2.5 text-left">
              <Avatar user={side.user} size="lg" className="!w-9 !h-9 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-bold truncate ${isCompleted && side.winning ? 'text-correct' : side.user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
                  {side.user?.fantasy_team_name || side.user?.display_name || side.user?.username}
                </div>
                <div className="text-[11px] text-text-muted truncate">
                  {/* When a fantasy team name exists it takes the headline, so
                      the manager's name moves down here beside the record —
                      otherwise the person is unidentifiable. */}
                  {side.user?.fantasy_team_name && (
                    <>{side.user?.display_name || side.user?.username}
                      {side.user?.record && ' · '}</>
                  )}
                  {side.user?.record && `${side.user.record.wins}-${side.user.record.losses}`}
                </div>
              </div>
              <div className="flex flex-col items-end shrink-0">
                {(hasScores || isCompleted) ? (
                  <span className={`font-display text-xl tabular-nums ${isCompleted && side.winning ? 'text-correct' : 'text-white'}`}>
                    {(side.points || 0).toFixed(1)}
                  </span>
                ) : null}
                {(side.proj ?? 0) > 0 && (
                  <span className="text-[11px] text-text-muted tabular-nums leading-tight">{side.proj.toFixed(1)}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* My Matchup on mobile. The desktop single row has to fit two team
            names, two manager names, two records and two scores across a
            phone, so everything collapsed to "THE VERY G…". Split into three
            full-width rows instead, each with home on the left edge and away
            on the right:

              TEAM NAME                         TEAM NAME
              [av] 0-0   145.0  proj  154.3   0-0 [av]
              Manager                           Manager

            Team name gets the top row to itself so it has the whole width and
            can align hard against the edge; the manager's name sits under its
            own avatar. All Matchups keeps its stacked one-line-per-team
            layout above — this is deliberately only the `!compact` case. */}
        <div className={`${compact ? "hidden" : "md:hidden"} mb-2`}>
          {(matchup.home_user?.fantasy_team_name || matchup.away_user?.fantasy_team_name) && (
            <div className="flex items-start justify-between gap-2 mb-1">
              {[matchup.home_user, matchup.away_user].map((u, i) => (
                <div
                  key={i}
                  className={`flex-1 min-w-0 text-[11px] uppercase italic font-semibold tracking-wide truncate text-text-primary/70 ${i ? 'text-right' : 'text-left'}`}
                >
                  {u?.fantasy_team_name || ''}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Avatar user={matchup.home_user} size="lg" className="!w-11 !h-11 shrink-0" />
            {matchup.home_user?.record && (
              <span className="text-[11px] text-text-muted shrink-0">
                {matchup.home_user.record.wins}-{matchup.home_user.record.losses}
              </span>
            )}
            <div className="flex-1 flex items-center justify-center gap-1.5 min-w-0">
              {(hasScores || isCompleted) ? (
                <>
                  <span className={`font-display text-xl tabular-nums ${isCompleted && homeWinning ? 'text-correct' : 'text-white'}`}>
                    {(matchup.home_points || 0).toFixed(1)}
                  </span>
                  <span className="text-text-muted text-sm">-</span>
                  <span className={`font-display text-xl tabular-nums ${isCompleted && !homeWinning ? 'text-correct' : 'text-white'}`}>
                    {(matchup.away_points || 0).toFixed(1)}
                  </span>
                </>
              ) : totalProj > 0 ? (
                <>
                  <span className="font-display text-lg text-text-muted tabular-nums">{hProj.toFixed(1)}</span>
                  <span className="text-text-muted text-[10px]">proj</span>
                  <span className="font-display text-lg text-text-muted tabular-nums">{aProj.toFixed(1)}</span>
                </>
              ) : (
                <span className="text-text-muted text-base font-display">vs</span>
              )}
            </div>
            {matchup.away_user?.record && (
              <span className="text-[11px] text-text-muted shrink-0">
                {matchup.away_user.record.wins}-{matchup.away_user.record.losses}
              </span>
            )}
            <Avatar user={matchup.away_user} size="lg" className="!w-11 !h-11 shrink-0" />
          </div>

          <div className="flex items-start justify-between gap-2 mt-0.5">
            {[
              { user: matchup.home_user, winning: homeWinning },
              { user: matchup.away_user, winning: !homeWinning },
            ].map((side, i) => (
              <div
                key={i}
                className={`flex-1 min-w-0 text-sm font-bold truncate ${i ? 'text-right' : 'text-left'} ${
                  isCompleted && side.winning ? 'text-correct' : side.user?.id === myId ? 'text-accent' : 'text-text-primary'
                }`}
              >
                {side.user?.display_name || side.user?.username}
              </div>
            ))}
          </div>
        </div>

        {/* One row: name/record outboard, avatar, then the scores centred.
            This used to be two stacked rows — avatars and scores on top,
            names and records beneath — which made each card tall enough that
            only two matchups fit on screen. Collapsing them roughly halves
            the height so a whole week is scannable at once. Avatars and score
            type are a step smaller to match. Still expands on tap. */}
        <div className="hidden md:flex items-center gap-2 md:gap-3 mb-2">
          {/* Avatars sit on the OUTSIDE edges, each team's text reading away
              from the centre — home left-aligned beside its avatar, away
              right-aligned beside its own. The scores hold the middle. */}
          <Avatar user={matchup.home_user} size="lg" className="!w-10 !h-10 md:!w-12 md:!h-12 shrink-0" />

          <div className="flex-1 min-w-0 text-left">
            <div className={`text-sm md:text-lg font-bold truncate ${isCompleted && homeWinning ? 'text-correct' : matchup.home_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
              {matchup.home_user?.display_name || matchup.home_user?.username}
            </div>
            {matchup.home_user?.fantasy_team_name && (
              <div className="text-[10px] md:text-xs text-text-primary/70 uppercase italic font-semibold tracking-wide truncate">{matchup.home_user.fantasy_team_name}</div>
            )}
            {matchup.home_user?.record && (
              <div className="text-[10px] md:text-xs text-text-muted">{matchup.home_user.record.wins}-{matchup.home_user.record.losses}</div>
            )}
          </div>

          {hasScores || isCompleted ? (
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <div className="flex flex-col items-center">
                <span className={`font-display text-xl md:text-3xl tabular-nums ${isCompleted && homeWinning ? 'text-correct' : 'text-white'}`}>
                  {(matchup.home_points || 0).toFixed(1)}
                </span>
                {((isCompleted ? hPregame : hProj) ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted leading-tight">{(isCompleted ? hPregame : hProj).toFixed(1)}</span>
                )}
              </div>
              <span className="text-text-muted text-sm">-</span>
              <div className="flex flex-col items-center">
                <span className={`font-display text-xl md:text-3xl tabular-nums ${isCompleted && !homeWinning ? 'text-correct' : 'text-white'}`}>
                  {(matchup.away_points || 0).toFixed(1)}
                </span>
                {((isCompleted ? aPregame : aProj) ?? 0) > 0 && (
                  <span className="text-[10px] text-text-muted leading-tight">{(isCompleted ? aPregame : aProj).toFixed(1)}</span>
                )}
              </div>
            </div>
          ) : totalProj > 0 ? (
            <div className="flex items-center gap-1.5 md:gap-2 shrink-0">
              <span className="font-display text-lg md:text-2xl text-text-muted tabular-nums">{hProj.toFixed(1)}</span>
              <span className="text-text-muted text-[10px]">proj</span>
              <span className="font-display text-lg md:text-2xl text-text-muted tabular-nums">{aProj.toFixed(1)}</span>
            </div>
          ) : (
            <span className="text-text-muted text-base md:text-lg font-display shrink-0">vs</span>
          )}

          <div className="flex-1 min-w-0 text-right">
            <div className={`text-sm md:text-lg font-bold truncate ${isCompleted && !homeWinning ? 'text-correct' : matchup.away_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
              {matchup.away_user?.display_name || matchup.away_user?.username}
            </div>
            {matchup.away_user?.fantasy_team_name && (
              <div className="text-[10px] md:text-xs text-text-primary/70 uppercase italic font-semibold tracking-wide truncate">{matchup.away_user.fantasy_team_name}</div>
            )}
            {matchup.away_user?.record && (
              <div className="text-[10px] md:text-xs text-text-muted">{matchup.away_user.record.wins}-{matchup.away_user.record.losses}</div>
            )}
          </div>

          <Avatar user={matchup.away_user} size="lg" className="!w-10 !h-10 md:!w-12 md:!h-12 shrink-0" />
        </div>

        {isCompleted && hasScores && (
          <div className="text-xs text-text-muted text-center mb-1">Final</div>
        )}

        {/* Win probability bar (live) / result bar (completed) / projection bar
            (future).
            Hidden while a compact card is collapsed. In the All Matchups list
            every row carries one, so the screen becomes a stack of bars that
            says less than the scores directly above them — and the bar is a
            derived read of numbers already on the row. It comes back on
            expand, where there is room for it to mean something. My Matchup
            is not compact, so it always shows one. */}
        {(!compact || isExpanded) && (isCompleted && hasScores ? (
          // Final: only the winner's half is green; the loser's half stays
          // gray. Lets a glance at the bar tell you who won without the
          // misleading full-green-across-a-loss problem.
          <div className="mt-3">
            <div className="h-2 rounded-full overflow-hidden bg-bg-card flex">
              <div className={`h-full w-1/2 ${homeWinning ? 'bg-correct rounded-l-full' : ''}`} />
              <div className={`h-full w-1/2 ${!homeWinning ? 'bg-correct rounded-r-full' : ''}`} />
            </div>
            <div className="flex justify-between mt-1">
              <span className={`text-[9px] md:text-xs font-semibold ${homeWinning ? 'text-correct' : 'text-text-muted'}`}>{homeWinning ? 'Winner' : 'Loser'}</span>
              <span className={`text-[9px] md:text-xs font-semibold ${!homeWinning ? 'text-correct' : 'text-text-muted'}`}>{!homeWinning ? 'Winner' : 'Loser'}</span>
            </div>
          </div>
        ) : !isCompleted && (hasScores || totalProj > 0) ? (() => {
          // Live/future: orange for "my" side (or home for others), gray for opponent
          const winProb = matchup.home_win_prob ?? homePct
          // For my matchup: orange = my probability. For others: orange = home.
          const myIsHome = matchup.home_user?.id === myId
          const orangePct = isMyMatchup ? (myIsHome ? winProb : 100 - winProb) : winProb
          // Orange grows from the viewer's side so the visual matches who's
          // ahead. When I'm the away user (right column), the bar starts
          // empty on the left and fills toward the right.
          const orangeOnRight = isMyMatchup && !myIsHome
          return (
            <div className={`mt-2 h-1.5 rounded-full bg-text-muted/30 overflow-hidden flex ${orangeOnRight ? 'justify-end' : ''}`}>
              <div className={`bg-accent/60 transition-all ${orangeOnRight ? 'rounded-r-full' : 'rounded-l-full'}`} style={{ width: `${orangePct}%` }} />
            </div>
          )
        })() : null)}
      </button>

      {/* Expanded roster comparison */}
      {isExpanded && matchup.home_roster && (
        <div className="border-t border-text-primary/10 p-3">
          {/* Mobile only: label the two roster columns. The collapsed card is
              stacked on phones, so nothing above establishes which side is
              which — and the roster below is position-centred with home on
              the left and away on the right. Desktop's header already reads
              left-to-right, so it does not need this. */}
          <div className={`${compact ? "lg:hidden flex" : "hidden"} items-center justify-between gap-2 pb-2 mb-2 border-b border-text-primary/10`}>
            <span className={`flex-1 min-w-0 truncate text-xs font-bold ${matchup.home_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
              {matchup.home_user?.fantasy_team_name || matchup.home_user?.display_name || matchup.home_user?.username}
            </span>
            <span className="text-[10px] text-text-muted shrink-0">vs</span>
            <span className={`flex-1 min-w-0 truncate text-right text-xs font-bold ${matchup.away_user?.id === myId ? 'text-accent' : 'text-text-primary'}`}>
              {matchup.away_user?.fantasy_team_name || matchup.away_user?.display_name || matchup.away_user?.username}
            </span>
          </div>

          {/* Desktop: full table with stat lines and projections */}
          <div className="hidden lg:block">
            <div className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 text-xs text-text-muted uppercase tracking-wider px-1 pb-2 border-b border-text-primary/10 mb-1">
              <span>Player</span>
              <span className="text-right">Proj</span>
              <span className="text-right font-semibold">Pts</span>
              <span className="text-center">Pos</span>
              <span className="text-left font-semibold">Pts</span>
              <span className="text-left">Proj</span>
              <span className="text-right">Player</span>
            </div>
            {/* Longer of the two, same reason as the bench below: these are
                filtered rosters, so a team with an unfilled starter slot has
                a shorter list and the opponent's extra starter would vanish. */}
            {Array.from({ length: Math.max(homeStarters.length, awayStarters.length) }, (_, i) => {
              const hp = homeStarters[i]
              const ap = awayStarters[i]
              const hStat = buildStatLine(hp?.stats, hp?.position)
              const aStat = buildStatLine(ap?.stats, ap?.position)
              const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
              const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
              return (
                <div key={i} className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 items-center text-sm py-2.5 border-b border-text-primary/5 last:border-0">
                  {/* Home player */}
                  <div
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5"
                    onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}
                  >
                    {hp?.headshot_url ? (
                      <img src={hp.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">{displayName(hp?.player_name).split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-text-primary truncate">{displayName(hp?.player_name)}</span>
                        {hp?.injury_status && <InjuryBadge status={hp.injury_status} />}
                      </div>
                      {hStat && <div className="text-xs text-text-primary truncate">{hStat}</div>}
                      {!hStat && hp?.opponent && (
                        <div className="text-[11px] text-text-muted">{hp.is_home ? 'vs' : '@'} {hp.opponent}</div>
                      )}
                      {hp?.on_bye && <div className="text-[10px] text-yellow-400 font-bold">BYE</div>}
                    </div>
                  </div>
                  <div className="text-right text-text-primary/60 text-xs">{(hp?.projected_pregame ?? hp?.projected)?.toFixed(1) || '--'}</div>
                  <div className={`text-right font-bold text-base md:text-lg tabular-nums ${hp?.game_status === 'live' ? 'text-orange-400' : hp?.game_status === 'final' ? 'text-white' : 'text-text-muted'}`}>
                    {hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}
                  </div>
                  <div className="text-center">
                    <span className="text-xs font-semibold text-white">
                      {slotLabels[hp?.slot] || (hp?.position) || '?'}
                    </span>
                  </div>
                  <div className={`text-left font-bold text-base md:text-lg tabular-nums ${ap?.game_status === 'live' ? 'text-orange-400' : ap?.game_status === 'final' ? 'text-white' : 'text-text-muted'}`}>
                    {aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}
                  </div>
                  <div className="text-left text-text-primary/60 text-xs">{(ap?.projected_pregame ?? ap?.projected)?.toFixed(1) || '--'}</div>
                  {/* Away player */}
                  <div
                    className="flex items-center gap-2.5 justify-end min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5"
                    onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}
                  >
                    <div className="min-w-0 text-right">
                      <div className="flex items-center gap-1 justify-end">
                        {ap?.injury_status && <InjuryBadge status={ap.injury_status} />}
                        <span className="font-bold text-text-primary truncate">{displayName(ap?.player_name)}</span>
                      </div>
                      {aStat && <div className="text-xs text-text-primary truncate">{aStat}</div>}
                      {!aStat && ap?.opponent && (
                        <div className="text-[11px] text-text-muted">{ap.is_home ? 'vs' : '@'} {ap.opponent}</div>
                      )}
                      {ap?.on_bye && <div className="text-[10px] text-yellow-400 font-bold">BYE</div>}
                    </div>
                    {ap?.headshot_url ? (
                      <img src={ap.headshot_url} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
                    ) : <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-xs text-text-muted font-bold">{displayName(ap?.player_name).split(' ').map(n => n[0]).join('').slice(0, 2)}</div>}
                  </div>
                </div>
              )
            })}
            {/* Bench dropdown */}
            {(homeBench.length > 0 || awayBench.length > 0) && (
              <button
                onClick={() => setShowBench(!showBench)}
                className="w-full mt-1 pt-2 border-t border-text-primary/10 flex items-center justify-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors py-1"
              >
                <span className="font-semibold">Bench</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showBench ? 'rotate-180' : ''}`}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            )}
            {/* Row count is the LONGER of the two benches. This mapped over
                homeBench and read awayBench[i], so whenever the away team
                carried more bench players — which happens constantly, since
                empty starter slots push extras onto the bench — those
                players were silently dropped from the view. */}
            {showBench && Array.from({ length: Math.max(homeBench.length, awayBench.length) }, (_, i) => {
              const hp = homeBench[i]
              const ap = awayBench[i]
              const hStat = buildStatLine(hp?.stats, hp?.position)
              const aStat = buildStatLine(ap?.stats, ap?.position)
              const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
              const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
              return (
                <div key={`bench-${i}`} className="grid grid-cols-[1fr_3.5rem_4rem_3rem_4rem_3.5rem_1fr] gap-1 items-center text-sm py-2 opacity-60">
                  <div className="flex items-center gap-2 min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5" onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}>
                    {hp?.headshot_url ? <img src={hp.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} /> : <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" />}
                    <div className="min-w-0">
                      <span className="font-semibold text-text-primary truncate block text-xs">{displayName(hp?.player_name)}</span>
                      {hStat && <div className="text-[10px] text-text-primary truncate">{hStat}</div>}
                    </div>
                  </div>
                  <div className="text-right text-text-primary/40 text-xs">{(hp?.projected_pregame ?? hp?.projected)?.toFixed(1) || '--'}</div>
                  <div className="text-right text-text-muted text-sm font-semibold tabular-nums">{hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}</div>
                  <div className="text-center"><span className="text-[10px] font-semibold text-text-muted">BN</span></div>
                  <div className="text-left text-text-muted text-sm font-semibold tabular-nums">{aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}</div>
                  <div className="text-left text-text-primary/40 text-xs">{(ap?.projected_pregame ?? ap?.projected)?.toFixed(1) || '--'}</div>
                  <div className="flex items-center gap-2 justify-end min-w-0 cursor-pointer hover:bg-text-primary/5 rounded px-1 py-0.5" onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}>
                    <div className="min-w-0 text-right">
                      <span className="font-semibold text-text-primary truncate block text-xs">{displayName(ap?.player_name)}</span>
                      {aStat && <div className="text-[10px] text-text-primary truncate">{aStat}</div>}
                    </div>
                    {ap?.headshot_url ? <img src={ap.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" onError={(e) => { e.target.style.display = 'none' }} /> : ap ? <div className="w-8 h-8 rounded-full bg-bg-secondary shrink-0" /> : null}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Mobile: position-centered H2H card view */}
          <div className="lg:hidden">
            {/* Longer of the two, same reason as the bench below: these are
                filtered rosters, so a team with an unfilled starter slot has
                a shorter list and the opponent's extra starter would vanish. */}
            {Array.from({ length: Math.max(homeStarters.length, awayStarters.length) }, (_, i) => {
              const hp = homeStarters[i]
              const ap = awayStarters[i]
              const hStat = buildStatLine(hp?.stats, hp?.position)
              const aStat = buildStatLine(ap?.stats, ap?.position)
              const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
              const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'

              // One line for everything about the player's real game, the way
              // Yahoo does it. This used to be up to three stacked lines --
              // score line, clock line, and (pre-game) a separate opponent
              // line plus a "Proj: 18.4" line -- which made every player row a
              // row taller than it needed to be.
              //
              //   upcoming  Sun 10:00AM @ IND
              //   live      Q3 5:12 · 10-13 @ Sea
              //   final     Final (L) 10-13 @ Sea
              //
              // Kickoff is formatted from game_starts_at in the VIEWER's
              // timezone -- the server sends UTC precisely because it cannot
              // know where the reader is.
              function gameLine(p) {
                if (!p) return null
                if (p.on_bye) return 'BYE'
                if (!p.opponent) return null
                const at = p.is_home ? `vs ${p.opponent}` : `@ ${p.opponent}`

                if (p.game_status === 'final' || p.game_status === 'live') {
                  const us = p.team_score ?? 0
                  const them = p.opp_score ?? 0
                  const score = `${us}-${them}`
                  if (p.game_status === 'final') {
                    // (W)/(L)/(T) from the player's team's perspective.
                    const wl = us > them ? 'W' : us < them ? 'L' : 'T'
                    return `Final (${wl}) ${score} ${at}`
                  }
                  const period = p.game_period
                    ? (p.game_period <= 4 ? `Q${p.game_period}` : p.game_period === 5 ? 'OT' : `${p.game_period - 4}OT`)
                    : ''
                  const clock = [period, p.game_clock].filter(Boolean).join(' ')
                  return `${clock ? clock + ' · ' : ''}${score} ${at}`
                }

                if (!p.game_starts_at) return at
                const d = new Date(p.game_starts_at)
                if (isNaN(d)) return at
                const day = d.toLocaleDateString(undefined, { weekday: 'short' })
                const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(' ', '')
                return `${day} ${time} ${at}`
              }

              function abbrevName(name) {
                if (!name) return '--'
                // D/ST names like "Titans D/ST" — just show "Titans"
                if (name.endsWith(' D/ST')) return name.replace(' D/ST', '')
                const parts = name.split(' ')
                if (parts.length < 2) return name
                return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
              }

              const slotLabel = slotLabels[hp?.slot] || (hp?.position) || '?'

              return (
                <div key={i} className="flex border-b border-text-primary/10">
                  {/* Home player — left aligned */}
                  <div
                    className="flex-1 px-2 py-2.5 cursor-pointer hover:bg-text-primary/5 transition-colors min-w-0"
                    onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}
                  >
                    {/* Injury badge sits inline after the surname rather than
                        pinned to the far edge of the row. It used to be a
                        flex sibling of a flex-1 name block, which pushed it
                        against the score column and left a gap mid-row. */}
                    <div className="mb-0.5 min-w-0 leading-tight">
                      {(() => { const n = splitName(hp?.player_name); return (
                        <>
                          {n.first && <div className="text-[11px] font-medium text-text-primary/70">{n.first}</div>}
                          <div className="flex items-center gap-1 min-w-0">
                            <span className="text-sm font-bold text-text-primary break-words min-w-0">{n.last}</span>
                            {hp?.injury_status && <InjuryBadge status={hp.injury_status} />}
                          </div>
                        </>
                      )})()}
                    </div>
                    {/* truncate, not wrap: "Mon 5:15PM vs DEN" was breaking
                        the opponent onto its own line and costing the row a
                        full line for three characters. Cell padding trimmed
                        from p-3 to px-2 to buy that width back; anything that
                        still doesn't fit ellipsises rather than reflowing. */}
                    {gameLine(hp) && (
                      <div className={`text-[11px] truncate ${hp?.game_status === 'live' ? 'text-accent font-semibold' : 'text-text-muted'}`}>
                        {gameLine(hp)}
                      </div>
                    )}
                    {hStat && (hLive || weekStatus === 'past') && (
                      <div className="text-[11px] text-text-primary/70 mt-0.5">{hStat}</div>
                    )}
                  </div>

                  {/* Home points, with the pre-game projection tucked underneath
                      rather than on its own line in the name block. Same idea
                      as Yahoo: the number you'll eventually care about holds
                      the slot, and what was expected of him sits right below
                      for comparison. */}
                  <div className="w-11 flex flex-col items-end pt-3 shrink-0 leading-tight">
                    <span className={`text-base font-display font-bold ${
                      hp?.game_status === 'live' ? 'text-accent' : hLive || weekStatus === 'past' ? 'text-white' : 'text-text-muted'
                    }`}>
                      {hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}
                    </span>
                    {(hp?.projected_pregame ?? hp?.projected) != null && !hp?.on_bye && (
                      <span className="text-[11px] text-text-primary/50 tabular-nums">
                        {(hp.projected_pregame ?? hp.projected).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Position center column */}
                  <div className="w-9 flex items-start justify-center pt-3.5 shrink-0">
                    <span className="text-[10px] font-bold text-white">{slotLabel}</span>
                  </div>

                  {/* Away points — mirror of the home column above. */}
                  <div className="w-11 flex flex-col items-start pt-3 shrink-0 leading-tight">
                    <span className={`text-base font-display font-bold ${
                      ap?.game_status === 'live' ? 'text-accent' : aLive || weekStatus === 'past' ? 'text-white' : 'text-text-muted'
                    }`}>
                      {aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}
                    </span>
                    {(ap?.projected_pregame ?? ap?.projected) != null && !ap?.on_bye && (
                      <span className="text-[11px] text-text-primary/50 tabular-nums">
                        {(ap.projected_pregame ?? ap.projected).toFixed(1)}
                      </span>
                    )}
                  </div>

                  {/* Away player — right aligned */}
                  <div
                    className="flex-1 px-2 py-2.5 cursor-pointer hover:bg-text-primary/5 transition-colors min-w-0 text-right"
                    onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}
                  >
                    {/* Mirror of the home cell — badge inline before the
                        surname so it reads inward from the right edge. */}
                    <div className="mb-0.5 min-w-0 leading-tight">
                      {(() => { const n = splitName(ap?.player_name); return (
                        <>
                          {n.first && <div className="text-[11px] font-medium text-text-primary/70">{n.first}</div>}
                          <div className="flex items-center justify-end gap-1 min-w-0">
                            {ap?.injury_status && <InjuryBadge status={ap.injury_status} />}
                            <span className="text-sm font-bold text-text-primary break-words min-w-0">{n.last}</span>
                          </div>
                        </>
                      )})()}
                    </div>
                    {gameLine(ap) && (
                      <div className={`text-[11px] truncate ${ap?.game_status === 'live' ? 'text-accent font-semibold' : 'text-text-muted'}`}>
                        {gameLine(ap)}
                      </div>
                    )}
                    {aStat && (aLive || weekStatus === 'past') && (
                      <div className="text-[11px] text-text-primary/70 mt-0.5">{aStat}</div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Mobile bench dropdown */}
            {(homeBench.length > 0 || awayBench.length > 0) && (
              <>
                <button
                  onClick={() => setShowBench(!showBench)}
                  className="w-full py-2 flex items-center justify-center gap-2 text-xs text-text-muted hover:text-text-primary transition-colors border-b border-text-primary/10"
                >
                  <span className="font-semibold">Bench</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${showBench ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {/* Same longer-of-the-two fix as the desktop bench above. */}
                {showBench && Array.from({ length: Math.max(homeBench.length, awayBench.length) }, (_, i) => {
                  const hp = homeBench[i]
                  const ap = awayBench[i]
                  const hStat = buildStatLine(hp?.stats, hp?.position)
                  const aStat = buildStatLine(ap?.stats, ap?.position)
                  const hLive = hp?.game_status === 'live' || hp?.game_status === 'final'
                  const aLive = ap?.game_status === 'live' || ap?.game_status === 'final'
                  return (
                    <div key={`mb-${i}`} className="flex border-b border-text-primary/5 opacity-60">
                      {/* Home bench player */}
                      <div className="flex-1 p-2 min-w-0 cursor-pointer" onClick={() => hp?.player_id && onPlayerClick(hp.player_id)}>
                        <span className="text-xs font-semibold text-text-primary truncate block">{displayName(hp?.player_name)}</span>
                        {hStat && (hLive || weekStatus === 'past') && <div className="text-[10px] text-text-primary/50">{hStat}</div>}
                      </div>
                      <div className="w-11 flex items-start justify-end pt-2 shrink-0">
                        <span className="text-sm font-display text-text-muted">{hLive || weekStatus === 'past' ? (hp?.points || 0).toFixed(1) : '--'}</span>
                      </div>
                      <div className="w-9 flex items-start justify-center pt-2.5 shrink-0">
                        <span className="text-[10px] font-bold text-text-muted">BN</span>
                      </div>
                      <div className="w-11 flex items-start justify-start pt-2 shrink-0">
                        <span className="text-sm font-display text-text-muted">{aLive || weekStatus === 'past' ? (ap?.points || 0).toFixed(1) : '--'}</span>
                      </div>
                      <div className="flex-1 p-2 min-w-0 text-right cursor-pointer" onClick={() => ap?.player_id && onPlayerClick(ap.player_id)}>
                        <span className="text-xs font-semibold text-text-primary truncate block">{displayName(ap?.player_name)}</span>
                        {aStat && (aLive || weekStatus === 'past') && <div className="text-[10px] text-text-primary/50">{aStat}</div>}
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function FantasyMatchup({ league, fantasySettings }) {
  const { profile } = useAuth()
  const season = fantasySettings?.season || 2026
  const currentWeek = fantasySettings?.current_week || fantasySettings?.single_week || 1
  const totalWeeks = fantasySettings?.championship_week || 17
  const [viewWeek, setViewWeek] = useState(currentWeek)
  const playoffStartWeek = fantasySettings?.playoff_start_week || 15
  const isPlayoffWeek = viewWeek >= playoffStartWeek
  const [matchupView, setMatchupView] = useState('mine') // 'mine' | 'all' | 'bracket'
  const [expandedMatchups, setExpandedMatchups] = useState(new Set())
  const [detailPlayerId, setDetailPlayerId] = useState(null)
  const { data: blurbIdsList } = useBlurbPlayerIds(league.id)
  const blurbIds = useMemo(
    () => new Map((blurbIdsList || []).map((r) => [r.player_id, r.latest_id])),
    [blurbIdsList],
  )
  const { starterSet, slotLabels } = useMemo(
    () => buildSlotMeta(fantasySettings?.roster_slots),
    [fantasySettings?.roster_slots]
  )

  function openPlayerDetail(id) {
    if (id) markBlurbSeen(id, blurbIds.get(id))
    setDetailPlayerId(id)
  }
  const isCurrent = viewWeek === currentWeek

  // Current week uses the live endpoint (with ESPN polling)
  const liveQuery = useFantasyMatchupLive(league.id, viewWeek, season)
  // Past/future weeks use the static endpoint
  const weekQuery = useFantasyMatchupWeek(league.id, viewWeek, season, currentWeek)

  const data = isCurrent ? liveQuery.data : weekQuery.data
  const isLoading = isCurrent ? liveQuery.isLoading : weekQuery.isLoading
  const matchups = data?.matchups || []
  const weekStatus = isCurrent ? 'current' : (viewWeek < currentWeek ? 'past' : 'future')

  // Playoff-week fallback: an eliminated (or bye-week) user has no
  // matchup this week — showing 'No matchup found for you' as the
  // default is a dead-end. Flip them to 'all' automatically so they
  // still see the championship + consolation cards. User can still
  // manually toggle back if they want.
  useEffect(() => {
    if (!isPlayoffWeek || !matchups.length) return
    const myMatchup = matchups.find((m) => m.home_user?.id === profile?.id || m.away_user?.id === profile?.id)
    if (!myMatchup && matchupView === 'mine') setMatchupView('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewWeek, matchups.length, isPlayoffWeek])

  // Playoff weeks: drop TBD placeholders (matchups awaiting winner
  // assignment from a lower round), then sort by stakes:
  //   1. Non-consolation ahead of consolation (main bracket first)
  //   2. Higher round ahead of lower (championship ahead of semis)
  //   3. Bracket position ASC as final tiebreak
  // Regular season: existing "my matchup first" behavior.
  const maxRound = matchups.reduce((mx, m) => Math.max(mx, m.round || 0), 0)
  const sorted = [...matchups]
    .filter((m) => (isPlayoffWeek ? m.home_user && m.away_user : true))
    .sort((a, b) => {
      if (isPlayoffWeek) {
        const aCons = a.is_consolation ? 1 : 0
        const bCons = b.is_consolation ? 1 : 0
        if (aCons !== bCons) return aCons - bCons
        if ((b.round || 0) !== (a.round || 0)) return (b.round || 0) - (a.round || 0)
        return (a.bracket_position || 0) - (b.bracket_position || 0)
      }
      const aIsMe = a.home_user?.id === profile?.id || a.away_user?.id === profile?.id
      const bIsMe = b.home_user?.id === profile?.id || b.away_user?.id === profile?.id
      if (aIsMe && !bIsMe) return -1
      if (bIsMe && !aIsMe) return 1
      return 0
    })

  // Matchup result banner (current week, completed)
  const myMatchup = matchups.find((m) => m.status === 'completed' && (m.home_user?.id === profile?.id || m.away_user?.id === profile?.id))
  // Dismissal is per-user and synced now. Derived rather than lazy
  // useState: myMatchup arrives async, and the old initializer ran once
  // with it still undefined, so a dismissed banner reappeared on reload.
  const readState = useReadState()
  const markReadFn = useMarkRead()
  const [justDismissed, setJustDismissed] = useState(false)
  const resultDismissed = justDismissed
    || (!!myMatchup && readState[READ_KINDS.MATCHUP_RESULT]?.[myMatchup.id] === '1')
  const myResult = !resultDismissed && myMatchup && isCurrent ? (() => {
    const isHome = myMatchup.home_user?.id === profile?.id
    const myPts = isHome ? myMatchup.home_points : myMatchup.away_points
    const oppPts = isHome ? myMatchup.away_points : myMatchup.home_points
    const opponent = isHome ? myMatchup.away_user : myMatchup.home_user
    const won = myPts > oppPts
    const tied = myPts === oppPts
    return { won, tied, myPts, oppPts, opponent }
  })() : null

  return (
    <div className="space-y-4">
      {/* Week selector */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={() => setViewWeek((w) => Math.max(1, w - 1))}
          disabled={viewWeek <= 1}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="text-center min-w-[100px]">
          <div className="font-display text-lg text-text-primary">Week {viewWeek}</div>
          <div className={`text-[10px] font-semibold ${isPlayoffWeek ? 'text-accent' : weekStatus === 'current' ? 'text-accent' : 'text-text-muted'}`}>
            {isPlayoffWeek ? 'Playoffs' : weekStatus === 'past' ? 'Final' : weekStatus === 'future' ? 'Upcoming' : 'Current'}
          </div>
        </div>
        <button
          onClick={() => setViewWeek((w) => Math.min(totalWeeks, w + 1))}
          disabled={viewWeek >= totalWeeks}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Result banner */}
      {myResult && (
        <div className={`relative rounded-xl border p-4 text-center ${
          myResult.won ? 'border-correct/40 bg-correct/10' : myResult.tied ? 'border-accent/40 bg-accent/10' : 'border-incorrect/40 bg-incorrect/10'
        }`}>
          <button
            onClick={() => { markReadFn(READ_KINDS.MATCHUP_RESULT, myMatchup.id, '1'); setJustDismissed(true) }}
            className="absolute top-2 right-2 text-text-muted hover:text-text-primary text-lg leading-none"
          >&times;</button>
          <div className={`font-display text-lg ${myResult.won ? 'text-correct' : myResult.tied ? 'text-accent' : 'text-incorrect'}`}>
            {myResult.won ? 'Victory!' : myResult.tied ? 'Tie Game' : 'Defeat'}
          </div>
          <div className="flex items-center justify-center gap-4 mt-2">
            <div className="text-right">
              <div className="font-display text-2xl text-text-primary">{myResult.myPts?.toFixed(1)}</div>
              <div className="text-[10px] text-text-muted">You</div>
            </div>
            <div className="text-text-muted text-sm">vs</div>
            <div className="text-left">
              <div className="font-display text-2xl text-text-secondary">{myResult.oppPts?.toFixed(1)}</div>
              <div className="text-[10px] text-text-muted">{myResult.opponent?.display_name || myResult.opponent?.username}</div>
            </div>
          </div>
        </div>
      )}

      {/* My Matchup / All Matchups / Bracket toggle */}
      {sorted.length > 0 && (
        <div className="flex gap-1">
          {['mine', 'all', ...(isPlayoffWeek ? ['bracket'] : [])].map((v) => (
            <button
              key={v}
              onClick={() => setMatchupView(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                matchupView === v
                  ? 'bg-accent text-white'
                  : 'bg-bg-primary border border-text-primary/20 text-text-primary hover:bg-text-primary/5'
              }`}
            >
              {v === 'mine' ? 'My Matchup' : v === 'bracket' ? 'Bracket' : 'All Matchups'}
            </button>
          ))}
        </div>
      )}

      {/* Matchup cards */}
      {isLoading ? (
        <div className="space-y-3"><SkeletonCard /><SkeletonCard /></div>
      ) : !sorted.length ? (
        <div className="text-center py-8 text-sm text-text-muted">Matchups will be generated automatically once the draft is complete.</div>
      ) : matchupView === 'mine' ? (
        // My Matchup view — only show user's matchup, always expanded
        (() => {
          const mine = sorted.find((m) => m.home_user?.id === profile?.id || m.away_user?.id === profile?.id)
          return mine ? (
            <MatchupCard
              matchup={mine}
              myId={profile?.id}
              weekStatus={weekStatus}
              isExpanded={!expandedMatchups.has('my-collapsed')}
              onToggle={() => setExpandedMatchups((prev) => {
                const next = new Set(prev)
                if (next.has('my-collapsed')) next.delete('my-collapsed')
                else next.add('my-collapsed')
                return next
              })}
              onPlayerClick={openPlayerDetail}
              blurbIds={blurbIds}
              starterSet={starterSet}
              slotLabels={slotLabels}
              isChampionship={isPlayoffWeek && !mine.is_consolation && mine.round === maxRound}
            />
          ) : (
            <div className="text-center py-8 text-sm text-text-muted">No matchup found for you this week.</div>
          )
        })()
      ) : (
        // All Matchups view — user's matchup expanded, others collapsed
        sorted.map((matchup) => {
          const isMyMatchup = matchup.home_user?.id === profile?.id || matchup.away_user?.id === profile?.id
          const isExpanded = (isMyMatchup && !expandedMatchups.has(`collapse-${matchup.id}`)) || expandedMatchups.has(matchup.id)
          const isChampionship = isPlayoffWeek && !matchup.is_consolation && matchup.round === maxRound
          return (
            <MatchupCard
              key={matchup.id}
              compact
              matchup={matchup}
              myId={profile?.id}
              weekStatus={weekStatus}
              isExpanded={isExpanded}
              onToggle={() => setExpandedMatchups((prev) => {
                const next = new Set(prev)
                if (isMyMatchup) {
                  const key = `collapse-${matchup.id}`
                  if (next.has(key)) next.delete(key)
                  else next.add(key)
                } else {
                  if (next.has(matchup.id)) next.delete(matchup.id)
                  else next.add(matchup.id)
                }
                return next
              })}
              onPlayerClick={openPlayerDetail}
              blurbIds={blurbIds}
              starterSet={starterSet}
              slotLabels={slotLabels}
              isChampionship={isChampionship}
            />
          )
        })
      )}

      {/* Bracket view */}
      {matchupView === 'bracket' && (
        <PlayoffBracket leagueId={league.id} />
      )}

      {detailPlayerId && (
        <PlayerDetailModal leagueId={league.id} playerId={detailPlayerId} onClose={() => setDetailPlayerId(null)} />
      )}
    </div>
  )
}

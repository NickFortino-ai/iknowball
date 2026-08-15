import { useEffect, useState } from 'react'
import { useBoxScore } from '../../hooks/useScoresStrip'
import { useGamePicks } from '../../hooks/usePicks'
import { useAuth } from '../../hooks/useAuth'
import { useCreateFlex } from '../../hooks/useHotTakes'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { formatOdds } from '../../lib/scoring'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'
import PickReactions from '../social/PickReactions'
import PickComments from '../social/PickComments'
import UserProfileModal from '../profile/UserProfileModal'
import { toast } from '../ui/Toast'

// Game Center — the unified live/final game screen. Opened by tapping a
// game on the landing scoreboard, sport drill-in, or a user's own
// settled result item. Live and final only; upcoming games are not
// tappable (nothing meaningful to show yet).
//
// Rendering is intentionally sport-agnostic — we iterate whatever
// stat groups ESPN's summary payload provided (Passing / Rushing /
// Receiving for NFL, Batting / Pitching for MLB, a single Player
// Stats block for NBA/WNBA/soccer). Each group renders as a table
// with ESPN's labels row and one row per athlete.
//
// When the viewer is authenticated the modal also surfaces pick context:
// their own pick + result, the community pick split, and squad picks.
// Reactions + comments live in a slide-up drawer keyed on the pick id
// so the box score itself stays uncluttered. Winners of a settled pick
// get a Flex-to-Squad button in the header, matching what used to live
// on PickDetailModal.

function TeamHeaderCard({ team, isWinner }) {
  const [logoBroken, setLogoBroken] = useState(false)
  return (
    <div className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3">
      {team.logo && !logoBroken ? (
        <img
          src={team.logo}
          alt=""
          className="w-9 h-9 sm:w-10 sm:h-10 object-contain shrink-0"
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-bg-secondary shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className={`font-display text-sm sm:text-base truncate ${isWinner ? 'text-text-primary' : 'text-text-secondary'}`}>
          {team.short || team.name}
        </div>
        {team.record && (
          <div className="text-[10px] sm:text-[11px] text-text-muted truncate">{team.record}</div>
        )}
      </div>
      <div className={`font-display text-xl sm:text-2xl tabular-nums shrink-0 ${isWinner ? 'text-text-primary' : 'text-text-secondary'}`}>
        {team.score ?? '—'}
      </div>
    </div>
  )
}

function LineScoreRow({ team, headers, isWinner }) {
  return (
    <tr className="border-t border-text-primary/5">
      <td className={`px-2 py-1 text-sm ${isWinner ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
        {team.abbr || team.short || team.name}
      </td>
      {headers.slice(0, -1).map((_, i) => (
        <td key={i} className="px-2 py-1 text-sm text-right text-text-secondary tabular-nums w-10">
          {team.linescore[i] ?? '—'}
        </td>
      ))}
      <td className={`px-2 py-1 text-sm text-right tabular-nums w-10 ${isWinner ? 'text-text-primary font-bold' : 'text-text-secondary font-semibold'}`}>
        {team.score ?? '—'}
      </td>
    </tr>
  )
}

function LineScoreTable({ teams, headers }) {
  if (!headers.length || !teams.length) return null
  const winnerScore = Math.max(...teams.map((x) => x.score ?? -Infinity))
  const uniqueWinner = teams.filter((x) => x.score === winnerScore).length === 1
  return (
    <div className="overflow-x-auto mb-4 flex justify-center">
      <table className="text-sm w-auto">
        <thead>
          <tr className="text-text-muted">
            <th className="px-2 py-1 text-left font-medium w-12"></th>
            {headers.map((h, i) => (
              <th key={i} className={`px-2 py-1 text-right font-medium w-10 ${i === headers.length - 1 ? 'text-text-primary' : ''}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <LineScoreRow key={t.id} team={t} headers={headers} isWinner={uniqueWinner && t.score === winnerScore} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatGroupTable({ group }) {
  const rows = (group.athletes || []).filter((a) => !a.did_not_play)
  if (!rows.length) return null
  return (
    <div className="mb-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1 px-1">{group.title}</div>
      <div className="overflow-x-auto rounded-lg border border-text-primary/10">
        <table className="w-full text-xs tabular-nums">
          <thead className="bg-bg-primary/30">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-text-muted sticky left-0 bg-bg-primary/30 z-10 min-w-[110px]">Player</th>
              {group.labels.map((l, i) => (
                <th key={i} className="px-2 py-1.5 text-right font-medium text-text-muted whitespace-nowrap">{l}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={a.id || i} className="border-t border-text-primary/5">
                <td className="px-2 py-1.5 text-left text-text-primary sticky left-0 bg-bg-primary/10 z-10 whitespace-nowrap">
                  {a.short || a.name}
                  {a.position && <span className="ml-1 text-[10px] text-text-muted">{a.position}</span>}
                </td>
                {a.stats.map((s, j) => (
                  <td key={j} className="px-2 py-1.5 text-right text-text-primary">{s ?? '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function TeamStatsSection({ groups }) {
  if (!groups || !groups.length) {
    return (
      <p className="text-sm text-text-muted text-center py-6">
        No player stats available for this team.
      </p>
    )
  }
  return (
    <div>
      {groups.map((g, i) => (
        <StatGroupTable key={`${g.title}-${i}`} group={g} />
      ))}
    </div>
  )
}

// Compact one-line summary of the viewer's own pick on this game.
// Result icon → team → odds → points (post-settle only).
function YourPickStrip({ userPick, away, home }) {
  const pickedTeamName = userPick.picked_team === 'home'
    ? (home?.short || home?.name || 'Home')
    : (away?.short || away?.name || 'Away')
  const settled = userPick.status === 'settled'
  const isCorrect = settled && userPick.is_correct === true
  const isLost = settled && userPick.is_correct === false
  const isPush = settled && userPick.is_correct === null

  const iconClass = isCorrect ? 'text-correct'
    : isLost ? 'text-incorrect'
    : isPush ? 'text-yellow-500'
    : 'text-text-muted'
  const icon = isCorrect ? '✓' : isLost ? '✗' : isPush ? '—' : '·'

  const points = userPick.points_earned
  const ptsClass = points > 0 ? 'text-correct'
    : points < 0 ? 'text-incorrect'
    : 'text-text-muted'

  return (
    <div className="flex items-center gap-2 mb-3 mx-auto w-full max-w-md px-3 py-2 rounded-lg bg-bg-primary/40 border border-text-primary/10">
      <span className={`text-base font-bold shrink-0 ${iconClass}`}>{icon}</span>
      <span className="text-xs text-text-muted shrink-0">Picked</span>
      <span className="text-sm font-semibold text-text-primary truncate min-w-0">{pickedTeamName}</span>
      {userPick.multiplier > 1 && (
        <span className="text-[10px] font-bold text-accent shrink-0">{userPick.multiplier}x</span>
      )}
      {userPick.odds_at_pick != null && (
        <span className="text-[11px] text-text-muted shrink-0 ml-auto">{formatOdds(userPick.odds_at_pick)}</span>
      )}
      {settled && points != null && (
        <span className={`text-sm font-display font-bold tabular-nums shrink-0 ${ptsClass} ${userPick.odds_at_pick != null ? '' : 'ml-auto'}`}>
          {points > 0 ? '+' : ''}{points}
        </span>
      )}
    </div>
  )
}

// Horizontal split showing what % of IKB'ers picked each team.
// Once the game is final, winning team's segment turns green and
// losing team's turns red. Live/upcoming games use neutral colors.
function AllPicksBar({ totalCounts, away, home, winnerSide }) {
  const totalPicks = (totalCounts?.home || 0) + (totalCounts?.away || 0)
  if (totalPicks === 0) return null
  const homePct = Math.round(((totalCounts.home || 0) / totalPicks) * 100)
  const awayPct = 100 - homePct
  const awayColor = winnerSide === 'away' ? 'bg-correct'
    : winnerSide === 'home' ? 'bg-incorrect'
    : 'bg-accent'
  const homeColor = winnerSide === 'home' ? 'bg-correct'
    : winnerSide === 'away' ? 'bg-incorrect'
    : 'bg-text-secondary/50'
  return (
    <div className="mb-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-text-primary mb-1.5 text-center">IKB Picks</div>
      <div className="flex justify-between text-[11px] font-semibold mb-1">
        <span className="text-text-primary truncate max-w-[45%]">{away?.short || away?.name} {awayPct}%</span>
        <span className="text-text-primary truncate max-w-[45%] text-right">{homePct}% {home?.short || home?.name}</span>
      </div>
      <div className="relative h-1.5 rounded-full overflow-hidden bg-bg-primary/50">
        {awayPct > 0 && <div className={`absolute inset-y-0 left-0 ${awayColor}`} style={{ width: `${awayPct}%` }} />}
        {homePct > 0 && <div className={`absolute inset-y-0 right-0 ${homeColor}`} style={{ width: `${homePct}%` }} />}
      </div>
      <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
        <span>{totalCounts.away || 0}</span>
        <span>{totalCounts.home || 0}</span>
      </div>
    </div>
  )
}

// Row of squad chips: avatar + team abbr, color-coded by result if
// settled. Tapping does nothing yet — could deep-link to their profile
// in a follow-up.
function SquadChips({ squadPicks, away, home, onOpenProfile }) {
  if (!squadPicks?.length) return null
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5 px-1">Squad</div>
      <div className="flex flex-wrap gap-1.5">
        {squadPicks.map((sp) => {
          const team = sp.picked_team === 'home' ? home : away
          const settled = sp.status === 'settled'
          const colorClass = settled
            ? sp.is_correct === true ? 'border-correct/60 bg-correct/10'
              : sp.is_correct === false ? 'border-incorrect/60 bg-incorrect/10'
              : 'border-yellow-500/60 bg-yellow-500/10'
            : 'border-text-primary/15 bg-bg-primary/30'
          return (
            <button
              key={sp.pick_id || sp.id}
              onClick={() => sp.id && onOpenProfile?.(sp.id)}
              className={`flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full border transition-colors hover:brightness-125 ${colorClass}`}
            >
              <Avatar user={sp} size="xs" />
              <span className="text-[11px] font-semibold text-text-primary">{team?.abbr || team?.short || '—'}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function GameCenterModal({ gameId, onClose }) {
  const { session } = useAuth()
  const isAuthed = !!session
  const { data, isLoading } = useBoxScore(gameId)
  const { data: gamePicksData } = useGamePicks(isAuthed ? gameId : null)
  const createFlex = useCreateFlex()
  const [activeTeamId, setActiveTeamId] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [profileUserId, setProfileUserId] = useState(null)
  const [flexing, setFlexing] = useState(false)
  const [flexText, setFlexText] = useState('')

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setDrawerOpen(false)
    setFlexing(false)
    setFlexText('')
  }, [gameId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!gameId) return null

  const teams = data?.teams || []
  const away = teams.find((t) => t.home_away === 'away') || teams[0]
  const home = teams.find((t) => t.home_away === 'home') || teams[1]

  const currentTeamId = activeTeamId ?? away?.id ?? home?.id
  const currentTeam = teams.find((t) => t.id === currentTeamId) || away

  const userPick = gamePicksData?.userPick
  const totalCounts = gamePicksData?.totalCounts
  const squadPicks = gamePicksData?.squadPicks || []
  const hasPickContext = !!(userPick || (totalCounts && (totalCounts.home + totalCounts.away) > 0) || squadPicks.length)
  // Winner side is only meaningful once the game is final — during a
  // live game we don't want to color the bar as if it's decided.
  const winnerSide = data?.status === 'final' && away?.score != null && home?.score != null && away.score !== home.score
    ? (away.score > home.score ? 'away' : 'home')
    : null
  const canFlex = userPick?.status === 'settled' && userPick?.is_correct === true

  async function handleSubmitFlex() {
    if (!userPick?.id) return
    try {
      await createFlex.mutateAsync({ content: flexText, pickId: userPick.id })
      toast('Flex posted to squad!', 'success')
      setFlexing(false)
      setFlexText('')
      onClose?.()
    } catch (err) {
      toast(err.message || 'Failed to flex', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center sm:px-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:pt-20 sm:pb-6"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-bg-primary/95 backdrop-blur-md border-0 sm:border sm:border-text-primary/20 w-full sm:max-w-3xl rounded-none sm:rounded-2xl max-h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 pt-3 pb-2 border-b border-text-primary/10 shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="font-display text-base sm:text-lg">Game Center</h2>
            {data?.status_detail && (
              <span className="text-[11px] uppercase tracking-wider text-text-muted truncate">· {data.status_detail}</span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {canFlex && !flexing && (
              <button
                onClick={() => setFlexing(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:text-sm font-semibold text-text-primary hover:opacity-80 transition-opacity"
              >
                <img src="/flex-button.png" alt="" className="w-5 h-5 sm:w-6 sm:h-6 object-contain" />
                <span className="hidden sm:inline">Flex to Squad</span>
                <span className="sm:hidden">Flex</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-primary text-2xl leading-none rounded-full hover:bg-bg-secondary transition-colors -mr-2"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Flex composer — expands under the top bar when triggered */}
        {flexing && (
          <div className="px-3 sm:px-5 pt-3 pb-3 border-b border-text-primary/10 shrink-0">
            <textarea
              value={flexText}
              onChange={(e) => setFlexText(e.target.value)}
              placeholder="Let them know!"
              rows={2}
              className="w-full bg-bg-primary/50 border border-accent rounded-lg px-3 py-2 text-sm font-semibold text-white placeholder-text-muted focus:outline-none resize-none"
              autoFocus
            />
            <div className="flex gap-2 justify-end mt-2">
              <button onClick={() => { setFlexing(false); setFlexText('') }} className="text-xs text-text-muted hover:text-text-secondary px-3 py-1.5">Cancel</button>
              <button onClick={handleSubmitFlex} disabled={createFlex.isPending} className="text-xs font-semibold bg-accent text-white px-4 py-1.5 rounded-lg hover:bg-accent-hover disabled:opacity-50">
                {createFlex.isPending ? 'Posting...' : 'Flex'}
              </button>
            </div>
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-5 py-3 sm:py-4">
          {isLoading ? (
            <LoadingSpinner />
          ) : !data ? (
            <p className="text-sm text-text-muted text-center py-8">
              Box score isn't available for this game yet.
            </p>
          ) : (
            <>
              {/* Team header — scores + records + logos */}
              <div className="flex items-center gap-2 sm:gap-4 mb-4 pb-4 border-b border-text-primary/10">
                {away && <TeamHeaderCard team={away} isWinner={away.score > (home?.score ?? -1)} />}
                <div className="text-text-muted text-[10px] sm:text-xs font-semibold px-0.5 shrink-0">@</div>
                {home && <TeamHeaderCard team={home} isWinner={home.score > (away?.score ?? -1)} />}
              </div>

              {/* Pick context — hidden when there's nothing to show */}
              {hasPickContext && (
                <div className="mb-4 pb-4 border-b border-text-primary/10">
                  {userPick && <YourPickStrip userPick={userPick} away={away} home={home} />}
                  <AllPicksBar totalCounts={totalCounts} away={away} home={home} winnerSide={winnerSide} />
                  <SquadChips squadPicks={squadPicks} away={away} home={home} onOpenProfile={setProfileUserId} />
                </div>
              )}

              {/* Line score (quarters / innings / halves) — always both teams */}
              <LineScoreTable teams={[away, home].filter(Boolean)} headers={data.line_score_headers || []} />

              {/* Team-name tab switcher — one team's stat tables at a time */}
              {teams.length > 1 && (
                <div className="flex gap-1 mb-3 border-b border-text-primary/10">
                  {[away, home].filter(Boolean).map((t) => {
                    const isActive = t.id === currentTeamId
                    return (
                      <button
                        key={t.id}
                        onClick={() => setActiveTeamId(t.id)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold border-b-2 transition-colors ${
                          isActive
                            ? 'border-accent text-text-primary'
                            : 'border-transparent text-text-muted hover:text-text-secondary'
                        }`}
                      >
                        {t.logo && <img src={t.logo} alt="" className="w-5 h-5 object-contain" />}
                        <span className="truncate max-w-[140px]">{t.short || t.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}

              {currentTeam && (
                <TeamStatsSection groups={data.stat_groups?.[currentTeam.id]} />
              )}

              {/* Reactions/comments — subtle link at the end of the scroll
                  so users who want it can find it, without competing
                  with the box score for attention. Expands inline. */}
              {isAuthed && (
                <div className="mt-6 pt-4 border-t border-text-primary/10">
                  <div className="text-center">
                    <button
                      onClick={() => setDrawerOpen((v) => !v)}
                      className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-secondary transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      {drawerOpen ? 'Hide discussion' : 'React & discuss'}
                    </button>
                  </div>
                  {drawerOpen && (
                    <div className="mt-3 space-y-3">
                      {userPick ? (
                        <>
                          <PickReactions pickId={userPick.id} />
                          <PickComments pickId={userPick.id} initialExpanded />
                        </>
                      ) : (
                        <p className="text-sm text-text-muted text-center py-6">
                          Make a pick on this game to react and discuss with your squad.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {/* Nested profile modal when a squad chip is tapped. UserProfileModal
          renders its own overlay with a higher stacking order, layering
          on top of the box score. */}
      {profileUserId && (
        <UserProfileModal userId={profileUserId} onClose={() => setProfileUserId(null)} />
      )}
    </div>
  )
}

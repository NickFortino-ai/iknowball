import { useEffect, useState } from 'react'
import { useBoxScore } from '../../hooks/useScoresStrip'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import LoadingSpinner from '../ui/LoadingSpinner'

// ESPN-style post-game box score, opened by tapping a final-state game
// on the landing Scoreboard, drill-in, or a pick result card.
//
// Rendering is intentionally sport-agnostic — we iterate whatever
// stat groups ESPN's summary payload provided (Passing / Rushing /
// Receiving for NFL, Batting / Pitching for MLB, a single Player
// Stats block for NBA/WNBA/soccer). Each group renders as a table
// with ESPN's labels row and one row per athlete.
//
// Mobile: full-bleed sheet, away/home tab switcher so you never scroll
// through both teams' stat tables end-to-end on a small screen.

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
      <td className={`px-2 py-1.5 text-xs ${isWinner ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}>
        {team.abbr || team.short || team.name}
      </td>
      {headers.slice(0, -1).map((_, i) => (
        <td key={i} className="px-2 py-1.5 text-xs text-right text-text-secondary tabular-nums">
          {team.linescore[i] ?? '—'}
        </td>
      ))}
      <td className={`px-2 py-1.5 text-xs text-right tabular-nums ${isWinner ? 'text-text-primary font-bold' : 'text-text-secondary font-semibold'}`}>
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
    <div className="overflow-x-auto -mx-1 mb-4">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-text-muted">
            <th className="px-2 py-1 text-left font-medium w-14"></th>
            {headers.map((h, i) => (
              <th key={i} className={`px-2 py-1 text-right font-medium ${i === headers.length - 1 ? 'text-text-primary' : ''}`}>{h}</th>
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

export default function BoxScoreModal({ gameId, onClose }) {
  const { data, isLoading } = useBoxScore(gameId)
  const [activeTeamId, setActiveTeamId] = useState(null)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  const teams = data?.teams || []
  const away = teams.find((t) => t.home_away === 'away') || teams[0]
  const home = teams.find((t) => t.home_away === 'home') || teams[1]

  // Default active team = away (visitor listed first is convention).
  const currentTeamId = activeTeamId ?? away?.id ?? home?.id
  const currentTeam = teams.find((t) => t.id === currentTeamId) || away

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch sm:items-center sm:justify-center sm:px-4"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-bg-primary/95 backdrop-blur-md border-0 sm:border sm:border-text-primary/20 w-full sm:max-w-3xl sm:my-6 rounded-none sm:rounded-2xl max-h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sticky top bar: title + close */}
        <div className="flex items-center justify-between gap-2 px-3 sm:px-5 pt-3 pb-2 border-b border-text-primary/10 shrink-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2 className="font-display text-base sm:text-lg">Box Score</h2>
            {data?.status_detail && (
              <span className="text-[11px] uppercase tracking-wider text-text-muted truncate">· {data.status_detail}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-11 h-11 flex items-center justify-center text-text-muted hover:text-text-primary text-2xl leading-none rounded-full hover:bg-bg-secondary transition-colors shrink-0 -mr-2"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

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

              {/* Line score (quarters / innings / halves) — always both teams */}
              <LineScoreTable teams={[away, home].filter(Boolean)} headers={data.line_score_headers || []} />

              {/* Away/Home tab switcher — one team's stats at a time */}
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
            </>
          )}
        </div>
      </div>
    </div>
  )
}

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

function TeamHeaderCard({ team, isWinner }) {
  const [logoBroken, setLogoBroken] = useState(false)
  return (
    <div className="flex-1 min-w-0 flex items-center gap-3">
      {team.logo && !logoBroken ? (
        <img
          src={team.logo}
          alt=""
          className="w-10 h-10 object-contain shrink-0"
          onError={() => setLogoBroken(true)}
        />
      ) : (
        <div className="w-10 h-10 rounded-full bg-bg-secondary shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <div className={`font-display text-base truncate ${isWinner ? 'text-text-primary' : 'text-text-secondary'}`}>
          {team.short || team.name}
        </div>
        {team.record && (
          <div className="text-[11px] text-text-muted truncate">{team.record}</div>
        )}
      </div>
      <div className={`font-display text-2xl tabular-nums shrink-0 ${isWinner ? 'text-text-primary' : 'text-text-secondary'}`}>
        {team.score ?? '—'}
      </div>
    </div>
  )
}

// Small line-score table (per-quarter / per-inning / per-half + total).
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
          {teams.map((t) => {
            const winnerScore = Math.max(...teams.map((x) => x.score ?? -Infinity))
            const isWinner = t.score === winnerScore && teams.filter((x) => x.score === winnerScore).length === 1
            return <LineScoreRow key={t.id} team={t} headers={headers} isWinner={isWinner} />
          })}
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

function TeamStatsSection({ team, groups }) {
  if (!groups || !groups.length) return null
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3 px-1">
        {team.logo && <img src={team.logo} alt="" className="w-6 h-6 object-contain shrink-0" />}
        <h3 className="font-display text-base text-text-primary truncate">{team.name}</h3>
      </div>
      {groups.map((g, i) => (
        <StatGroupTable key={`${g.title}-${i}`} group={g} />
      ))}
    </div>
  )
}

export default function BoxScoreModal({ gameId, onClose }) {
  const { data, isLoading } = useBoxScore(gameId)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  const teams = data?.teams || []
  const away = teams.find((t) => t.home_away === 'away') || teams[0]
  const home = teams.find((t) => t.home_away === 'home') || teams[1]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
        paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary/95 backdrop-blur-md border border-text-primary/20 w-full md:max-w-3xl rounded-2xl p-5 max-h-full overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-2 right-2 w-10 h-10 flex items-center justify-center text-text-muted hover:text-text-primary text-xl leading-none rounded-full hover:bg-bg-secondary transition-colors"
        >
          &times;
        </button>

        <div className="flex items-center gap-2 mb-4">
          <h2 className="font-display text-lg">Box Score</h2>
          {data?.status_detail && (
            <span className="text-[11px] uppercase tracking-wider text-text-muted">· {data.status_detail}</span>
          )}
        </div>

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <p className="text-sm text-text-muted text-center py-8">
            Box score isn't available for this game yet.
          </p>
        ) : (
          <>
            {/* Team header with logos, records, final scores */}
            <div className="flex items-center gap-4 mb-4 pb-4 border-b border-text-primary/10">
              {away && <TeamHeaderCard team={away} isWinner={away.score > (home?.score ?? -1)} />}
              <div className="text-text-muted text-xs font-semibold px-1">@</div>
              {home && <TeamHeaderCard team={home} isWinner={home.score > (away?.score ?? -1)} />}
            </div>

            {/* Line score (quarters / innings / halves) */}
            <LineScoreTable teams={[away, home].filter(Boolean)} headers={data.line_score_headers || []} />

            {/* Per-team stat groups */}
            {[away, home].filter(Boolean).map((t) => (
              <TeamStatsSection key={t.id} team={t} groups={data.stat_groups?.[t.id]} />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

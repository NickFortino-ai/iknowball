import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useGlobalRank } from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import LoadingSpinner from '../ui/LoadingSpinner'
import Avatar from '../ui/Avatar'

export default function FantasyGlobalRankModal({ leagueId, onClose }) {
  const { profile } = useAuth()
  const { data, isLoading } = useGlobalRank(leagueId)

  useEffect(() => { lockScroll(); return () => unlockScroll() }, [])

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end md:items-center justify-center" onClick={onClose}>
      <div
        className="bg-bg-secondary w-full md:max-w-xl rounded-t-2xl md:rounded-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-bg-secondary border-b border-text-primary/10 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-display text-base">Global Rank</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex items-center justify-center"><LoadingSpinner /></div>
        ) : !data || data.status !== 'ok' ? (
          <EmptyState data={data} />
        ) : (
          <Body data={data} myUserId={profile?.id} />
        )}
      </div>
    </div>
  )
}

function EmptyState({ data }) {
  const reason = data?.reason
  if (reason === 'not_yet_computed') {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-4xl">🏆</div>
        <h3 className="font-display text-lg text-text-primary">Rankings not computed yet</h3>
        <p className="text-sm text-text-muted">
          Global rankings refresh nightly at 4 AM ET. Check back tomorrow.
        </p>
      </div>
    )
  }
  if (reason === 'custom_rules') {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="text-4xl">🏆</div>
        <h3 className="font-display text-lg text-text-primary">Your league has unique scoring</h3>
        <p className="text-sm text-text-muted">
          Your commissioner has customized the scoring rules, and no other league on IKB
          uses the exact same setup. We only compare teams scored identically — otherwise
          the points wouldn't be apples-to-apples.
        </p>
        <p className="text-xs text-text-muted italic">
          Tip: spread the word about your league's format. Once another league copies it,
          you'll start showing up in the rankings.
        </p>
      </div>
    )
  }
  return (
    <div className="p-8 text-center space-y-3">
      <div className="text-4xl">🏆</div>
      <h3 className="font-display text-lg text-text-primary">No matching leagues yet</h3>
      <p className="text-sm text-text-muted">
        We didn't find another IKB league with your exact roster + scoring + member count.
        At least 2 leagues with matching settings must exist for a comparison group to form.
      </p>
      <p className="text-xs text-text-muted italic">Check back after the next nightly refresh.</p>
    </div>
  )
}

function Body({ data, myUserId }) {
  const { format, me, top10, sandwich } = data
  const inTop10 = me.rank_in_group <= 10
  const ppg = me.games_played > 0 ? (Number(me.total_points) / me.games_played).toFixed(1) : '—'

  return (
    <div className="p-5 space-y-5">
      {/* Hero rank */}
      <div className="text-center">
        <div className="text-xs uppercase text-text-muted tracking-wider mb-1">Your global rank</div>
        <div className="font-display text-5xl text-accent">
          #{me.rank_in_group}
          <span className="text-text-muted text-2xl"> / {format.team_count}</span>
        </div>
        <div className="mt-2 text-sm text-text-secondary">
          <span className="text-text-primary font-semibold">{Number(me.total_points).toFixed(1)} pts</span>
          {' · '}
          <span>{ppg} per game</span>
        </div>
        {me.rank_in_group === 1 && (
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/40 text-yellow-400 text-xs font-bold">
            🏆 CURRENTLY #1 IN IKB
          </div>
        )}
      </div>

      {/* Format definition */}
      <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-3">
        <div className="text-[10px] uppercase text-text-muted tracking-wider mb-1">Format</div>
        <div className="text-sm text-text-primary font-semibold">{format.label}</div>
        <div className="text-[11px] text-text-muted mt-1">
          Comparing {format.team_count} teams across {format.league_count} {format.league_count === 1 ? 'league' : 'leagues'}
        </div>
      </div>

      {/* Top 10 */}
      <div>
        <h3 className="text-xs uppercase text-text-muted tracking-wider mb-2">Top 10</h3>
        <div className="rounded-xl border border-text-primary/20 overflow-hidden divide-y divide-text-primary/10">
          {top10.map((row) => (
            <RankRow key={`${row.league_id}-${row.user_id}`} row={row} myUserId={myUserId} />
          ))}
        </div>
      </div>

      {/* Sandwich for users outside top 10 */}
      {!inTop10 && sandwich && sandwich.length > 0 && (
        <div>
          <h3 className="text-xs uppercase text-text-muted tracking-wider mb-2">Where you stand</h3>
          <div className="rounded-xl border border-accent/40 overflow-hidden divide-y divide-text-primary/10">
            {sandwich.map((row) => (
              <RankRow key={`${row.league_id}-${row.user_id}`} row={row} myUserId={myUserId} />
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-text-muted text-center italic">Updated nightly · 4 AM ET</p>
    </div>
  )
}

function RankRow({ row, myUserId }) {
  const isMe = row.user_id === myUserId
  return (
    <div className={`flex items-center gap-3 px-3 py-2 ${isMe ? 'bg-accent/10' : ''}`}>
      <span className="text-sm font-bold text-text-muted w-7 text-center shrink-0">#{row.rank_in_group}</span>
      <Avatar user={row.users} size="sm" />
      <Link
        to={`/u/${row.users?.username}`}
        className="flex-1 min-w-0 hover:underline"
      >
        <div className="text-sm font-semibold text-text-primary truncate">
          {row.users?.display_name || row.users?.username || 'Unknown'}
          {isMe && <span className="text-accent text-[10px] ml-1">(YOU)</span>}
        </div>
        <div className="text-[10px] text-text-muted truncate">{row.leagues?.name}</div>
      </Link>
      <div className="text-right shrink-0">
        <div className="text-sm font-display text-accent">{Number(row.total_points).toFixed(1)}</div>
        <div className="text-[9px] text-text-muted">pts</div>
      </div>
    </div>
  )
}

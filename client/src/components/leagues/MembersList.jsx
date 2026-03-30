import TierBadge from '../ui/TierBadge'
import Avatar from '../ui/Avatar'
import { getTier } from '../../lib/scoring'

export default function MembersList({ members, pendingInvitations, commissionerId, leagueId, isCommissioner, onUserTap, bracketSubmittedIds }) {
  const hasMembers = members?.length > 0
  // Filter out pending invitations for users who already joined
  const memberUserIds = new Set((members || []).map(m => m.user_id))
  const filteredPending = (pendingInvitations || []).filter(inv => !memberUserIds.has(inv.user_id))
  const hasPending = filteredPending.length > 0

  if (!hasMembers && !hasPending) return null

  return (
    <div className="space-y-2">
      {members?.map((m) => {
        const user = m.users
        if (!user) return null
        const isComm = m.user_id === commissionerId

        return (
          <div
            key={m.id}
            className={`bg-bg-card/70 backdrop-blur-sm rounded-xl border border-text-primary/20 px-4 py-3 flex items-center justify-between${onUserTap ? ' cursor-pointer hover:bg-bg-card/90 transition-colors' : ''}`}
            onClick={() => onUserTap?.(m.user_id)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Avatar user={user} size="xl" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm truncate">{user.display_name || user.username}</span>
                  {isComm && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-tier-hof/20 text-tier-hof flex-shrink-0">
                      Commish
                    </span>
                  )}
                </div>
                <div className="text-xs text-text-muted">@{user.username}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <TierBadge tier={getTier(user.total_points).name} size="xs" />
              {m.is_alive === false && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-incorrect/20 text-incorrect">
                  Eliminated
                </span>
              )}
              {bracketSubmittedIds && (
                bracketSubmittedIds.has(m.user_id)
                  ? <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-correct/15 text-correct">Complete</span>
                  : <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-text-muted/15 text-text-muted">Incomplete</span>
              )}
            </div>
          </div>
        )
      })}

      {hasPending && (
        <>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-4 mb-1">Pending</div>
          {filteredPending.map((inv) => {
            const user = inv.user
            if (!user) return null

            return (
              <div
                key={inv.id}
                className="bg-bg-card/70 backdrop-blur-sm rounded-xl border border-text-primary/20 px-4 py-3 flex items-center justify-between opacity-60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={user} size="xl" />
                  <div className="min-w-0">
                    <span className="font-semibold text-sm truncate block">{user.display_name || user.username}</span>
                    <div className="text-xs text-text-muted">@{user.username}</div>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">
                  Invited
                </span>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}

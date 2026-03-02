import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'

export default function MembersList({ members, pendingInvitations, commissionerId, leagueId, isCommissioner }) {
  const hasMembers = members?.length > 0
  const hasPending = pendingInvitations?.length > 0

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
            className="bg-bg-card rounded-xl border border-border px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0">
                {user.avatar_emoji || user.display_name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
              </div>
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
            </div>
          </div>
        )
      })}

      {hasPending && (
        <>
          <div className="text-[10px] text-text-muted uppercase tracking-wider mt-4 mb-1">Pending</div>
          {pendingInvitations.map((inv) => {
            const user = inv.user
            if (!user) return null

            return (
              <div
                key={inv.id}
                className="bg-bg-card rounded-xl border border-border/50 px-4 py-3 flex items-center justify-between opacity-60"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-bg-primary flex items-center justify-center text-sm flex-shrink-0">
                    {user.avatar_emoji || user.display_name?.[0]?.toUpperCase() || user.username?.[0]?.toUpperCase()}
                  </div>
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

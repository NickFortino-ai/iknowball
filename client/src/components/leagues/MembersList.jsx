import TierBadge from '../ui/TierBadge'
import { getTier } from '../../lib/scoring'

export default function MembersList({ members, commissionerId, leagueId, isCommissioner }) {
  if (!members?.length) return null

  return (
    <div className="space-y-2">
      {members.map((m) => {
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
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-tier-mvp/20 text-tier-mvp flex-shrink-0">
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
    </div>
  )
}

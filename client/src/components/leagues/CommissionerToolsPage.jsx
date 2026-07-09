import { useState } from 'react'
import Avatar from '../ui/Avatar'
import ForceLineupModal from './ForceLineupModal'
import CommissionerAddDropModal from './CommissionerAddDropModal'

/**
 * Full-tab Commissioner Tools page. Rendered when the "Commish" tab is
 * active on a fantasy league (traditional only for now — salary cap has no
 * roster-facing commish actions yet).
 *
 * List of tools grows over time per the commish-tools-framework memory:
 *  - Force lineup (live)
 *  - Override matchup total (TODO)
 *  - Add/drop for a user (TODO)
 *  - Trade veto / reversal (TODO)
 *  - Transfer team ownership (TODO)
 */
export default function CommissionerToolsPage({ league }) {
  const [openTool, setOpenTool] = useState(null) // 'force_lineup' | 'add_drop' | null
  const [forceLineupTarget, setForceLineupTarget] = useState(null) // { userId, name } | null
  const [addDropTarget, setAddDropTarget] = useState(null) // { userId, name } | null

  const members = (league.members || []).filter((m) => m.user_id !== league.commissioner_id)

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-6">
      <div className="pt-2">
        <h2 className="font-display text-2xl text-text-primary">Commissioner Tools</h2>
        <p className="text-sm text-text-muted mt-1">
          Actions you can take on behalf of managers. Every action is logged and the affected manager is notified.
        </p>
      </div>

      {openTool === 'force_lineup' || openTool === 'add_drop' ? (
        <ManagerPicker
          members={members}
          promptText={openTool === 'force_lineup' ? 'Pick a manager to force' : 'Pick a manager to add/drop for'}
          onBack={() => setOpenTool(null)}
          onPick={(target) => {
            if (openTool === 'force_lineup') setForceLineupTarget(target)
            else if (openTool === 'add_drop') setAddDropTarget(target)
            setOpenTool(null)
          }}
        />
      ) : (
        <div className="space-y-2">
          <ToolCard
            icon="🔧"
            title="Force a manager's lineup"
            description="Set another manager's current-week starters. Use when someone is unresponsive or made a mistake."
            onClick={() => setOpenTool('force_lineup')}
          />
          <ToolCard
            icon="📊"
            title="Override matchup total"
            description="Correct a matchup score after a scoring bug. Coming soon."
            disabled
          />
          <ToolCard
            icon="➕"
            title="Add/drop for a manager"
            description="Execute a roster move on someone's behalf — add a free agent, drop a rostered player."
            onClick={() => setOpenTool('add_drop')}
          />
          <ToolCard
            icon="↩️"
            title="Veto / reverse a trade"
            description="Roll back a completed trade. Coming soon."
            disabled
          />
          <ToolCard
            icon="👥"
            title="Transfer team ownership"
            description="Hand a team over to a new user. Coming soon."
            disabled
          />
        </div>
      )}

      {forceLineupTarget && (
        <ForceLineupModal
          league={league}
          targetUserId={forceLineupTarget.userId}
          targetUserName={forceLineupTarget.name}
          onClose={() => setForceLineupTarget(null)}
        />
      )}

      {addDropTarget && (
        <CommissionerAddDropModal
          league={league}
          targetUserId={addDropTarget.userId}
          targetUserName={addDropTarget.name}
          onClose={() => setAddDropTarget(null)}
        />
      )}
    </div>
  )
}

function ManagerPicker({ members, promptText, onBack, onPick }) {
  return (
    <div className="rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden">
      <div className="px-4 py-3 border-b border-text-primary/10 flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary p-1 -ml-1"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs uppercase text-text-muted tracking-wider">{promptText}</span>
      </div>
      <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
        {members.length === 0 ? (
          <div className="text-center py-6 text-xs text-text-muted">No other managers in this league.</div>
        ) : (
          members.map((m) => {
            const name = m.users?.display_name || m.users?.username || 'Manager'
            return (
              <button
                key={m.user_id}
                onClick={() => onPick({ userId: m.user_id, name })}
                className="w-full flex items-center gap-3 rounded-lg hover:bg-text-primary/5 p-3 transition-colors"
              >
                <Avatar user={m.users} size="sm" />
                <div className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-semibold text-text-primary truncate">{name}</div>
                  {m.fantasy_team_name && (
                    <div className="text-[10px] uppercase tracking-wider text-text-muted truncate">{m.fantasy_team_name}</div>
                  )}
                </div>
                <span className="text-text-muted text-lg leading-none">›</span>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}

function ToolCard({ icon, title, description, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`w-full text-left rounded-xl border p-4 transition-colors flex items-start gap-3 ${
        disabled
          ? 'border-text-primary/10 bg-text-primary/[0.02] cursor-not-allowed opacity-60'
          : 'border-text-primary/20 bg-bg-primary hover:bg-text-primary/5'
      }`}
    >
      <span className="text-2xl leading-none pt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-xs text-text-muted mt-0.5">{description}</div>
      </div>
      {!disabled && <span className="text-text-muted text-lg leading-none">›</span>}
    </button>
  )
}

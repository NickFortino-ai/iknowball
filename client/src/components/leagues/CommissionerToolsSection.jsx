import { useState } from 'react'
import Avatar from '../ui/Avatar'
import ForceLineupModal from './ForceLineupModal'

/**
 * Commissioner-only tools tucked into the league settings modal. Each tool
 * gets an entry in the expanded list; picking one either opens a modal or
 * a lightweight inline sub-flow (e.g. Force Lineup asks for a manager first,
 * then opens ForceLineupModal).
 *
 * Grows over time — future tools per the commish-tools-framework memory:
 *  - Override matchup total
 *  - Add/drop for a user
 *  - Trade veto / reversal
 *  - Transfer team ownership
 */
export default function CommissionerToolsSection({ league }) {
  const [expanded, setExpanded] = useState(false)
  const [tool, setTool] = useState(null) // 'force_lineup' | null (picking a manager)
  const [forceLineupTarget, setForceLineupTarget] = useState(null) // { userId, name } | null

  // Only fantasy leagues get force lineup for now — nothing to force in a
  // pickem / DFS / bracket league.
  const isFantasy = league.format === 'fantasy'

  function collapse() {
    setExpanded(false)
    setTool(null)
  }

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full py-2.5 rounded-xl bg-text-primary/5 border border-text-primary/20 text-text-primary hover:bg-text-primary/10 transition-colors flex items-center justify-between px-3"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
          </svg>
          <span className="text-sm font-semibold">Commissioner Tools</span>
        </div>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {!expanded && (
        <p className="text-[11px] text-text-muted mt-2 text-center">
          Actions the commissioner can take on behalf of managers. Every action is logged and the affected manager is notified.
        </p>
      )}

      {expanded && (
        <div className="mt-3 rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden">
          {tool === 'force_lineup' ? (
            <ManagerPickerPane
              league={league}
              onPick={(target) => { setForceLineupTarget(target); setTool(null) }}
              onBack={() => setTool(null)}
            />
          ) : (
            <div>
              <div className="p-3 space-y-1.5">
                {isFantasy ? (
                  <ToolRow
                    icon="🔧"
                    title="Force a manager's lineup"
                    description="Set another manager's current-week starters. Use when someone is unresponsive or made a mistake."
                    onClick={() => setTool('force_lineup')}
                  />
                ) : (
                  <div className="text-center py-4 text-xs text-text-muted">
                    No commissioner tools available for this league format yet.
                  </div>
                )}
              </div>
              <div className="p-3 border-t border-text-primary/10">
                <button
                  onClick={collapse}
                  className="w-full py-2 rounded-lg text-xs font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
                >
                  Close
                </button>
              </div>
            </div>
          )}
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
    </div>
  )
}

function ToolRow({ icon, title, description, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-text-primary/15 bg-text-primary/5 p-3 hover:bg-text-primary/10 transition-colors flex items-start gap-3"
    >
      <span className="text-xl leading-none pt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{title}</div>
        <div className="text-[11px] text-text-muted mt-0.5">{description}</div>
      </div>
      <span className="text-text-muted text-lg leading-none">›</span>
    </button>
  )
}

function ManagerPickerPane({ league, onPick, onBack }) {
  const members = (league.members || []).filter((m) => m.user_id !== league.commissioner_id)
  return (
    <div>
      <div className="px-3 py-2 border-b border-text-primary/10 flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary p-1 -ml-1"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs uppercase text-text-muted tracking-wider">Pick a manager to force</span>
      </div>
      <div className="p-2 max-h-72 overflow-y-auto space-y-1">
        {members.length === 0 ? (
          <div className="text-center py-6 text-xs text-text-muted">No other managers in this league.</div>
        ) : (
          members.map((m) => {
            const name = m.users?.display_name || m.users?.username || 'Manager'
            return (
              <button
                key={m.user_id}
                onClick={() => onPick({ userId: m.user_id, name })}
                className="w-full flex items-center gap-3 rounded-lg hover:bg-text-primary/5 p-2 transition-colors"
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

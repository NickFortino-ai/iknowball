import { useState, useEffect, useRef } from 'react'
import { useReportProblem, useMyReports, useReplyToMyReport } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'

const STATUS_COPY = {
  open: { label: 'Awaiting admin', color: 'text-yellow-400', dot: 'bg-yellow-400' },
  replied: { label: 'Admin replied', color: 'text-blue-400', dot: 'bg-blue-400' },
  resolved: { label: 'Resolved', color: 'text-correct', dot: 'bg-correct' },
}

/**
 * Inline expandable "Report a Problem" section rendered inside the
 * league settings modal for the commissioner. Not a popup — the whole
 * conversation lives here, expanding in place when tapped so the
 * commissioner sees prior threads, the current back-and-forth, and can
 * kick off new reports without navigating away.
 */
export default function ReportProblemSection({ league, embedded = false, onEmbeddedBack }) {
  // embedded=true skips the standalone collapsible header — used when this
  // panel is the primary content of a page (e.g. the Commish tab).
  const [expanded, setExpanded] = useState(embedded)
  const [openThreadId, setOpenThreadId] = useState(null)
  const [composing, setComposing] = useState(false)
  const [newMessage, setNewMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')

  const { data: reports } = useMyReports(league.id)
  const createReport = useReportProblem(league.id)
  const reply = useReplyToMyReport(league.id)

  const unreadCount = (reports || []).filter((r) => r.status === 'replied').length
  const activeReport = openThreadId ? (reports || []).find((r) => r.id === openThreadId) : null

  async function handleCreate() {
    const trimmed = newMessage.trim()
    if (!trimmed) return
    try {
      const created = await createReport.mutateAsync({ message: trimmed })
      setNewMessage('')
      setComposing(false)
      setOpenThreadId(created.id)
      toast('Report sent to admin', 'success')
    } catch (err) {
      toast(err.message || 'Failed to send report', 'error')
    }
  }

  async function handleReply() {
    if (!activeReport) return
    const trimmed = replyMessage.trim()
    if (!trimmed) return
    try {
      await reply.mutateAsync({ reportId: activeReport.id, message: trimmed })
      setReplyMessage('')
    } catch (err) {
      toast(err.message || 'Failed to send reply', 'error')
    }
  }

  function collapse() {
    setExpanded(false)
    setOpenThreadId(null)
    setComposing(false)
  }

  const body = (
    <div className={embedded ? 'rounded-2xl border border-text-primary/20 bg-bg-primary overflow-hidden' : 'mt-3 rounded-xl border border-text-primary/20 bg-bg-primary overflow-hidden'}>
      {activeReport ? (
        <ThreadPane
          report={activeReport}
          replyMessage={replyMessage}
          setReplyMessage={setReplyMessage}
          onSend={handleReply}
          onBack={() => setOpenThreadId(null)}
          isPending={reply.isPending}
        />
      ) : composing ? (
        <ComposePane
          league={league}
          message={newMessage}
          setMessage={setNewMessage}
          onSend={handleCreate}
          onCancel={() => { setComposing(false); setNewMessage('') }}
          isPending={createReport.isPending}
        />
      ) : (
        <ListPane
          reports={reports || []}
          onOpen={(id) => setOpenThreadId(id)}
          onNew={() => setComposing(true)}
          onCollapse={embedded ? onEmbeddedBack : collapse}
          collapseLabel={embedded ? 'Back' : 'Close'}
        />
      )}
    </div>
  )

  if (embedded) return body

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full py-2.5 rounded-xl bg-text-primary/5 border border-text-primary/20 text-text-primary hover:bg-text-primary/10 transition-colors flex items-center justify-between px-3"
      >
        <div className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm font-semibold">Report a Problem</span>
          {unreadCount > 0 && (
            <span className="ml-1 px-1.5 py-0.5 rounded-full bg-accent text-white text-[10px] font-bold">
              {unreadCount} new
            </span>
          )}
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
          Something wrong with this league? Message the admin directly.
        </p>
      )}

      {expanded && body}
    </div>
  )
}

function ListPane({ reports, onOpen, onNew, onCollapse, collapseLabel = 'Close' }) {
  return (
    <div>
      <div className="p-3 space-y-2 max-h-64 overflow-y-auto">
        {reports.length === 0 ? (
          <div className="text-center py-6 text-sm text-text-muted">
            No prior reports. Something wrong? Start a new one.
          </div>
        ) : (
          reports.map((r) => {
            const meta = STATUS_COPY[r.status] || STATUS_COPY.open
            const lastMsg = r.messages?.[r.messages.length - 1]
            return (
              <button
                key={r.id}
                onClick={() => onOpen(r.id)}
                className="w-full text-left rounded-lg border border-text-primary/15 bg-text-primary/5 p-3 hover:bg-text-primary/10 transition-colors"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
                    <span className={`text-[10px] uppercase font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
                  </div>
                  <span className="text-[10px] text-text-muted">{timeAgo(r.created_at)}</span>
                </div>
                <div className="text-sm text-text-primary mt-1 line-clamp-2">
                  {lastMsg?.message || r.message}
                </div>
                <div className="text-[11px] text-text-muted mt-1">
                  {r.messages?.length || 1} {(r.messages?.length || 1) === 1 ? 'message' : 'messages'}
                </div>
              </button>
            )
          })
        )}
      </div>
      <div className="p-3 border-t border-text-primary/10 flex gap-2">
        <button
          onClick={onCollapse}
          className="flex-1 py-2 rounded-lg text-xs font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
        >
          {collapseLabel}
        </button>
        <button
          onClick={onNew}
          className="flex-1 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Start a new report
        </button>
      </div>
    </div>
  )
}

function ComposePane({ league, message, setMessage, onSend, onCancel, isPending }) {
  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2 -mt-1">
        <button
          onClick={onCancel}
          className="text-text-muted hover:text-text-primary p-1 -ml-1"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <span className="text-xs uppercase text-text-muted tracking-wider">New report</span>
      </div>
      <p className="text-sm text-text-secondary">
        Describe what's going wrong with <span className="text-text-primary font-semibold">{league.name}</span>. This goes straight to the admin, who will reply here.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's happening? Which players, weeks, or trades are affected?"
        rows={5}
        maxLength={4000}
        autoFocus
        className="w-full bg-text-primary/5 border border-text-primary/20 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
      />
      <div className="flex justify-between items-center gap-2">
        <span className="text-[11px] text-text-muted">{message.length} / 4000</span>
        <button
          onClick={onSend}
          disabled={!message.trim() || isPending}
          className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
        >
          {isPending ? 'Sending…' : 'Send to admin'}
        </button>
      </div>
    </div>
  )
}

function ThreadPane({ report, replyMessage, setReplyMessage, onSend, onBack, isPending }) {
  const bottomRef = useRef(null)
  const meta = STATUS_COPY[report.status] || STATUS_COPY.open
  const isResolved = report.status === 'resolved'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [report.messages?.length])

  return (
    <div>
      <div className="px-3 py-2 border-b border-text-primary/10 flex items-center justify-between">
        <button
          onClick={onBack}
          className="text-text-muted hover:text-text-primary p-1 -ml-1 flex items-center gap-1"
          aria-label="Back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="text-xs text-text-muted">Reports</span>
        </button>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${meta.dot}`} />
          <span className={`text-[10px] uppercase font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
        </div>
      </div>
      <div className="p-3 space-y-2 max-h-72 overflow-y-auto">
        {(report.messages || []).map((m) => (
          <div key={m.id} className={`flex ${m.sender_role === 'commissioner' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 ${
              m.sender_role === 'commissioner'
                ? 'bg-accent text-white'
                : 'bg-text-primary/10 text-text-primary'
            }`}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-0.5">
                {m.sender_role === 'commissioner' ? 'You' : 'Admin'} · {timeAgo(m.created_at)}
              </div>
              <div className="text-sm whitespace-pre-wrap">{m.message}</div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {isResolved ? (
        <div className="p-3 border-t border-text-primary/20 text-center text-xs text-text-muted">
          This report was marked resolved by the admin.
        </div>
      ) : (
        <div className="p-3 border-t border-text-primary/20 space-y-2">
          <textarea
            value={replyMessage}
            onChange={(e) => setReplyMessage(e.target.value)}
            placeholder="Reply to admin…"
            rows={2}
            maxLength={4000}
            className="w-full bg-text-primary/5 border border-text-primary/20 rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end">
            <button
              onClick={onSend}
              disabled={!replyMessage.trim() || isPending}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

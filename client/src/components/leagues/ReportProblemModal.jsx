import { useState, useEffect, useRef } from 'react'
import { useReportProblem, useMyReports, useReplyToMyReport } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'
import LoadingSpinner from '../ui/LoadingSpinner'

const STATUS_COPY = {
  open: { label: 'Awaiting admin', color: 'text-yellow-400' },
  replied: { label: 'Admin replied', color: 'text-blue-400' },
  resolved: { label: 'Resolved', color: 'text-correct' },
}

export default function ReportProblemModal({ league, onClose }) {
  const { data: reports, isLoading } = useMyReports(league.id)
  const createReport = useReportProblem(league.id)
  const reply = useReplyToMyReport(league.id)

  // 'list' → see prior reports, 'new' → compose a fresh one, or an
  // existing report ID → thread view for that ticket.
  const [view, setView] = useState('list')
  const [newMessage, setNewMessage] = useState('')
  const [replyMessage, setReplyMessage] = useState('')

  // If the user has zero prior reports, jump straight to compose.
  useEffect(() => {
    if (!isLoading && reports?.length === 0 && view === 'list') {
      setView('new')
    }
  }, [isLoading, reports?.length, view])

  const activeReport = typeof view === 'string' && view.startsWith('report-') ? reports?.find((r) => r.id === view.slice(7)) : null

  async function handleCreate() {
    const trimmed = newMessage.trim()
    if (!trimmed) return
    try {
      const created = await createReport.mutateAsync({ message: trimmed })
      setNewMessage('')
      toast('Report sent to admin', 'success')
      setView(`report-${created.id}`)
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{
        paddingTop: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-top) + 1rem))',
        paddingBottom: 'max(1.5rem, calc(3.5rem + env(safe-area-inset-bottom) + 1rem))',
      }}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 rounded-2xl w-full sm:max-w-md max-h-full overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 bg-bg-primary/95 backdrop-blur-sm border-b border-text-primary/20 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            {activeReport && (
              <button
                onClick={() => setView('list')}
                className="text-text-muted hover:text-text-primary p-1"
                aria-label="Back"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <h2 className="font-display text-base text-text-primary truncate">
              {view === 'new' ? 'Report a Problem' : activeReport ? `Report · ${timeAgo(activeReport.created_at)}` : 'Support'}
            </h2>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {isLoading ? (
          <div className="p-10 flex justify-center"><LoadingSpinner /></div>
        ) : view === 'new' ? (
          <ComposeView
            league={league}
            message={newMessage}
            setMessage={setNewMessage}
            onSend={handleCreate}
            onCancel={reports?.length ? () => setView('list') : onClose}
            isPending={createReport.isPending}
          />
        ) : activeReport ? (
          <ThreadView
            report={activeReport}
            replyMessage={replyMessage}
            setReplyMessage={setReplyMessage}
            onSend={handleReply}
            isPending={reply.isPending}
          />
        ) : (
          <ListView
            reports={reports || []}
            onOpen={(id) => setView(`report-${id}`)}
            onNew={() => setView('new')}
          />
        )}
      </div>
    </div>
  )
}

function ComposeView({ league, message, setMessage, onSend, onCancel, isPending }) {
  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      <p className="text-sm text-text-secondary">
        Describe what's going wrong with <span className="text-text-primary font-semibold">{league.name}</span>. This message goes straight to the admin, who will reply here.
      </p>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What's happening? Which players, weeks, or trades are affected?"
        rows={6}
        maxLength={4000}
        autoFocus
        className="w-full bg-text-primary/5 border border-text-primary/20 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
      />
      <div className="text-[11px] text-text-muted text-right">{message.length} / 4000</div>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
        >
          Cancel
        </button>
        <button
          onClick={onSend}
          disabled={!message.trim() || isPending}
          className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
        >
          {isPending ? 'Sending…' : 'Send to admin'}
        </button>
      </div>
    </div>
  )
}

function ListView({ reports, onOpen, onNew }) {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-2">
        {reports.map((r) => {
          const meta = STATUS_COPY[r.status] || STATUS_COPY.open
          const lastMsg = r.messages?.[r.messages.length - 1]
          return (
            <button
              key={r.id}
              onClick={() => onOpen(r.id)}
              className="w-full text-left rounded-xl border border-text-primary/20 bg-bg-primary p-3 hover:bg-text-primary/5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className={`text-[10px] uppercase font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
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
        })}
      </div>
      <div className="sticky bottom-0 p-4 border-t border-text-primary/20 bg-bg-primary/95 backdrop-blur-sm">
        <button
          onClick={onNew}
          className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Start a new report
        </button>
      </div>
    </div>
  )
}

function ThreadView({ report, replyMessage, setReplyMessage, onSend, isPending }) {
  const bottomRef = useRef(null)
  const meta = STATUS_COPY[report.status] || STATUS_COPY.open
  const isResolved = report.status === 'resolved'

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' })
  }, [report.messages?.length])

  return (
    <>
      <div className="px-4 py-2 border-b border-text-primary/10 flex items-center justify-between">
        <span className={`text-[10px] uppercase font-bold tracking-wider ${meta.color}`}>{meta.label}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
        <div className="p-4 border-t border-text-primary/20 text-center text-xs text-text-muted">
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
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
            >
              {isPending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}

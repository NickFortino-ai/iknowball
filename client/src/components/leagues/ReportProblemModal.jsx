import { useState } from 'react'
import { useReportProblem } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

export default function ReportProblemModal({ league, onClose }) {
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)
  const report = useReportProblem(league.id)

  async function handleSend() {
    const trimmed = message.trim()
    if (!trimmed) return
    try {
      await report.mutateAsync({ message: trimmed })
      setSent(true)
    } catch (err) {
      toast(err.message || 'Failed to send report', 'error')
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
        className="relative bg-bg-primary border border-text-primary/20 rounded-2xl w-full sm:max-w-md max-h-full overflow-y-auto overscroll-contain"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-bg-primary/95 backdrop-blur-sm border-b border-text-primary/20 px-4 py-3 flex items-center justify-between z-10">
          <h2 className="font-display text-base text-text-primary">Report a Problem</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary p-1">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {sent ? (
          <div className="p-6 text-center space-y-3">
            <div className="text-3xl">&#10004;&#65039;</div>
            <h3 className="font-display text-lg text-text-primary">Message sent</h3>
            <p className="text-sm text-text-muted">
              The admin will review your report and respond as a notification when there's an update.
            </p>
            <button
              onClick={onClose}
              className="w-full py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Got it
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className="text-sm text-text-secondary">
              Describe what's going wrong with <span className="text-text-primary font-semibold">{league.name}</span>. This message goes straight to the admin, who will reply through a notification.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="What's happening? Which players, weeks, or trades are affected?"
              rows={6}
              maxLength={4000}
              className="w-full bg-text-primary/5 border border-text-primary/20 rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
            />
            <div className="text-[11px] text-text-muted text-right">{message.length} / 4000</div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim() || report.isPending}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white disabled:opacity-50 hover:bg-accent-hover transition-colors"
              >
                {report.isPending ? 'Sending…' : 'Send to admin'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

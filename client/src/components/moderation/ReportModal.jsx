import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSubmitReport } from '../../hooks/useReports'
import { toast } from '../ui/Toast'

const REASONS = [
  { value: 'inappropriate', label: 'Inappropriate' },
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'hate_speech', label: 'Hate Speech' },
  { value: 'other', label: 'Other' },
]

export default function ReportModal({ targetType, targetId, reportedUserId, onClose }) {
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const submitReport = useSubmitReport()

  async function handleSubmit() {
    if (!reason) return
    try {
      await submitReport.mutateAsync({
        reported_user_id: reportedUserId,
        target_type: targetType,
        target_id: targetId || undefined,
        reason,
        details: details.trim() || undefined,
      })
      toast('Report submitted. We\'ll review it shortly.', 'success')
      onClose()
    } catch (err) {
      if (err.message?.includes('already reported')) {
        toast('You\'ve already reported this content.', 'error')
      } else {
        toast(err.message || 'Failed to submit report', 'error')
      }
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-display text-lg mb-4">Report this content</h2>

        <div className="space-y-2 mb-4">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(r.value)}
              className={`w-full text-left px-4 py-2.5 rounded-lg text-sm transition-colors ${
                reason === r.value
                  ? 'bg-accent/15 border border-accent text-accent font-semibold'
                  : 'bg-bg-primary border border-border text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          maxLength={500}
          rows={3}
          placeholder="Tell us more (optional)"
          className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none mb-2"
        />
        <div className="text-right text-xs text-text-muted mb-4">{details.length}/500</div>

        <p className="text-xs text-text-muted mb-4">
          By reporting, you're helping us enforce our{' '}
          <Link to="/guidelines" className="text-accent hover:underline" onClick={onClose}>
            Community Guidelines
          </Link>
          .
        </p>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm text-text-secondary bg-bg-primary border border-border hover:bg-bg-card-hover transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!reason || submitReport.isPending}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
          >
            {submitReport.isPending ? 'Submitting...' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}

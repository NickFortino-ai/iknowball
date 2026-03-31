import { useState } from 'react'
import { useBackdropSubmissions, useApproveBackdrop, useRejectBackdrop } from '../../hooks/useAdmin'
import { toast } from '../ui/Toast'
import LoadingSpinner from '../ui/LoadingSpinner'

export default function BackdropSubmissionsPanel() {
  const { data: submissions, isLoading } = useBackdropSubmissions()
  const approve = useApproveBackdrop()
  const reject = useRejectBackdrop()
  const [rejectId, setRejectId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  if (isLoading) return <LoadingSpinner />

  if (!submissions?.length) {
    return <div className="text-center text-text-muted py-8">No pending backdrop submissions</div>
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub) => (
        <div key={sub.id} className="rounded-xl border border-text-primary/20 overflow-hidden">
          {sub.preview_url && (
            <img
              src={sub.preview_url}
              alt="Submission"
              className="w-full h-48 object-cover"
            />
          )}
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-text-primary">
                  {sub.users?.display_name || sub.users?.username || 'Unknown'}
                </div>
                <div className="text-xs text-text-muted">
                  League: {sub.leagues?.name || 'No league'}
                </div>
                <div className="text-xs text-text-muted">
                  {new Date(sub.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
              <div className="text-xs text-text-muted">{sub.original_filename}</div>
            </div>

            {rejectId === sub.id ? (
              <div className="space-y-2">
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason for rejection..."
                  rows={2}
                  className="w-full bg-bg-input border border-border rounded-lg p-2 text-sm text-text-primary placeholder-text-muted resize-none focus:outline-none focus:border-accent"
                />
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      if (!rejectReason.trim()) return toast('Enter a reason', 'error')
                      try {
                        await reject.mutateAsync({ id: sub.id, reason: rejectReason.trim() })
                        toast('Submission rejected', 'success')
                        setRejectId(null)
                        setRejectReason('')
                      } catch (err) {
                        toast(err.message || 'Failed to reject', 'error')
                      }
                    }}
                    disabled={reject.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-incorrect/10 text-incorrect hover:bg-incorrect/20 disabled:opacity-50"
                  >
                    Confirm Reject
                  </button>
                  <button
                    onClick={() => { setRejectId(null); setRejectReason('') }}
                    className="px-3 py-1.5 rounded-lg text-xs text-text-muted hover:text-text-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    try {
                      await approve.mutateAsync(sub.id)
                      toast('Backdrop approved and applied!', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to approve', 'error')
                    }
                  }}
                  disabled={approve.isPending}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-correct/10 text-correct hover:bg-correct/20 disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  onClick={() => setRejectId(sub.id)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-incorrect/10 text-incorrect hover:bg-incorrect/20"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

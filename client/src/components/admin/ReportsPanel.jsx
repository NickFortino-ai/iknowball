import { useState } from 'react'
import { useAdminReports, useUpdateReportStatus } from '../../hooks/useReports'
import { toast } from '../ui/Toast'
import { timeAgo } from '../../lib/time'
import Avatar from '../ui/Avatar'

const STATUS_FILTERS = ['all', 'pending', 'reviewed', 'actioned', 'dismissed']

const STATUS_COLORS = {
  pending: 'bg-yellow-500/10 text-yellow-400',
  reviewed: 'bg-blue-500/10 text-blue-400',
  actioned: 'bg-correct/10 text-correct',
  dismissed: 'bg-text-muted/10 text-text-muted',
}

export default function ReportsPanel() {
  const [filter, setFilter] = useState('pending')
  const { data: reports, isLoading } = useAdminReports(filter)
  const updateStatus = useUpdateReportStatus()

  async function handleAction(reportId, status, action) {
    try {
      await updateStatus.mutateAsync({ id: reportId, status, action })
      toast(`Report ${status}${action === 'remove_content' ? ' — content removed' : ''}`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to update report', 'error')
    }
  }

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
              filter === s
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center text-text-muted text-sm py-8">Loading reports...</div>
      ) : !reports?.length ? (
        <div className="text-center text-text-muted text-sm py-8">No {filter !== 'all' ? filter : ''} reports</div>
      ) : (
        <div className="space-y-3">
          {reports.map((report) => (
            <div key={report.id} className="bg-bg-card rounded-xl border border-border p-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar user={report.reported} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">@{report.reported?.username}</div>
                    <div className="text-xs text-text-muted">
                      Reported by @{report.reporter?.username} · {timeAgo(report.created_at)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded capitalize ${STATUS_COLORS[report.status]}`}>
                    {report.status}
                  </span>
                </div>
              </div>

              {/* Report details */}
              <div className="bg-bg-primary rounded-lg p-3 mb-3 text-sm">
                <div className="flex gap-3 text-xs text-text-muted mb-2">
                  <span>Type: <span className="text-text-secondary capitalize">{report.target_type.replace('_', ' ')}</span></span>
                  <span>Reason: <span className="text-text-secondary capitalize">{report.reason.replace('_', ' ')}</span></span>
                </div>
                {report.details && (
                  <p className="text-text-secondary text-xs mb-2">{report.details}</p>
                )}

                {/* Reported content preview */}
                {report.reported_content && (
                  <div className="border-l-2 border-accent pl-3 mt-2">
                    {report.target_type === 'hot_take' && (
                      <p className="text-text-primary text-sm">{report.reported_content.content}</p>
                    )}
                    {report.target_type === 'comment' && (
                      <p className="text-text-primary text-sm">{report.reported_content.content}</p>
                    )}
                  </div>
                )}
                {report.target_type === 'profile_picture' && report.reported?.avatar_url && (
                  <div className="mt-2">
                    <img src={report.reported.avatar_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                  </div>
                )}
              </div>

              {/* Actions */}
              {report.status === 'pending' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(report.id, 'dismissed')}
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-primary border border-border text-text-secondary hover:bg-bg-card-hover transition-colors disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                  <button
                    onClick={() => handleAction(report.id, 'actioned', 'remove_content')}
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-incorrect/20 text-incorrect hover:bg-incorrect/30 transition-colors disabled:opacity-50"
                  >
                    Remove Content
                  </button>
                  <button
                    onClick={() => handleAction(report.id, 'actioned')}
                    disabled={updateStatus.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors disabled:opacity-50"
                  >
                    Mark Actioned
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

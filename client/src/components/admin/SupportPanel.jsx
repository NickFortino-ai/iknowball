import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import { timeAgo } from '../../lib/time'

const STATUS_FILTERS = ['all', 'open', 'replied', 'resolved']

const STATUS_COLORS = {
  open: 'bg-yellow-500/10 text-yellow-400',
  replied: 'bg-blue-500/10 text-blue-400',
  resolved: 'bg-correct/10 text-correct',
}

function useCommissionerReports(status) {
  return useQuery({
    queryKey: ['admin', 'commissioner-reports', status],
    queryFn: () => api.get(`/admin/commissioner-reports?status=${status}`),
    refetchInterval: 30_000,
  })
}

function useReplyToReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId, reply }) => api.post(`/admin/commissioner-reports/${reportId}/reply`, { reply }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'commissioner-reports'] }),
  })
}

function useResolveReport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ reportId }) => api.post(`/admin/commissioner-reports/${reportId}/resolve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'commissioner-reports'] }),
  })
}

export default function SupportPanel() {
  const [filter, setFilter] = useState('open')
  const { data: reports, isLoading } = useCommissionerReports(filter)
  const reply = useReplyToReport()
  const resolve = useResolveReport()
  const [replyText, setReplyText] = useState({}) // reportId → text
  const [expandedId, setExpandedId] = useState(null)

  async function handleReply(reportId) {
    const text = (replyText[reportId] || '').trim()
    if (!text) return
    try {
      await reply.mutateAsync({ reportId, reply: text })
      toast('Reply sent — commissioner notified', 'success')
      setReplyText((prev) => ({ ...prev, [reportId]: '' }))
    } catch (err) {
      toast(err.message || 'Failed to send reply', 'error')
    }
  }

  async function handleResolve(reportId) {
    if (!window.confirm('Mark this report as resolved?')) return
    try {
      await resolve.mutateAsync({ reportId })
      toast('Marked resolved', 'success')
    } catch (err) {
      toast(err.message || 'Failed to update', 'error')
    }
  }

  return (
    <div>
      <div className="mb-4 flex gap-2 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
              filter === s ? 'bg-accent text-white' : 'bg-text-primary/5 text-text-muted hover:text-text-primary'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : !reports?.length ? (
        <div className="text-sm text-text-muted p-6 text-center">No {filter === 'all' ? '' : filter} reports.</div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const isExpanded = expandedId === r.id
            return (
              <div
                key={r.id}
                className="rounded-xl border border-text-primary/20 bg-bg-primary p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar user={r.users} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-text-primary truncate">
                        {r.users?.display_name || r.users?.username || 'Unknown'}
                      </div>
                      <div className="text-[11px] text-text-muted truncate">
                        {r.leagues?.name || 'Unknown league'} · {r.leagues?.format} · {timeAgo(r.created_at)}
                      </div>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${STATUS_COLORS[r.status] || 'bg-text-primary/5 text-text-muted'}`}>
                    {r.status}
                  </span>
                </div>

                {/* Full hydrated message thread — includes initial commissioner
                    message, first admin reply (if any), and every follow-up in
                    commissioner_report_messages, ordered by created_at. */}
                <div className="space-y-2">
                  {(r.messages || []).map((m) => (
                    <div key={m.id} className={`flex ${m.sender_role === 'admin' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[85%] rounded-xl px-3 py-2 ${
                        m.sender_role === 'admin'
                          ? 'bg-accent/15 border border-accent/40'
                          : 'bg-text-primary/5 border border-text-primary/10'
                      }`}>
                        <div className="text-[10px] uppercase text-text-muted tracking-wider mb-0.5">
                          {m.sender_role === 'admin' ? 'Admin' : 'Commissioner'} · {timeAgo(m.created_at)}
                        </div>
                        <div className="text-sm text-text-primary whitespace-pre-wrap">{m.message}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {r.status !== 'resolved' && (
                  <>
                    {isExpanded ? (
                      <div className="space-y-2">
                        <textarea
                          value={replyText[r.id] || ''}
                          onChange={(e) => setReplyText((prev) => ({ ...prev, [r.id]: e.target.value }))}
                          placeholder="Reply to the commissioner…"
                          rows={4}
                          className="w-full bg-text-primary/5 border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); setReplyText((prev) => ({ ...prev, [r.id]: '' })) }}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-text-primary/5 text-text-secondary border border-text-primary/20"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleReply(r.id)}
                            disabled={!(replyText[r.id] || '').trim() || reply.isPending}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white disabled:opacity-50"
                          >
                            {reply.isPending ? 'Sending…' : 'Send reply'}
                          </button>
                          <div className="flex-1" />
                          <button
                            onClick={() => handleResolve(r.id)}
                            className="px-3 py-2 rounded-lg text-xs font-semibold bg-correct/15 text-correct border border-correct/40"
                          >
                            Mark resolved
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setExpandedId(r.id)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white"
                        >
                          Reply
                        </button>
                        <button
                          onClick={() => handleResolve(r.id)}
                          className="px-3 py-2 rounded-lg text-xs font-semibold bg-correct/15 text-correct border border-correct/40"
                        >
                          Mark resolved
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

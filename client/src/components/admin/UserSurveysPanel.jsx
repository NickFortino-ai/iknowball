import { useState } from 'react'
import { useAdminSurveyLeagues, useDesignateSurvey, useAdminSurveyResponses } from '../../hooks/useAdmin'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'
import { supabase } from '../../lib/supabase'

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  basketball_wncaab: 'WNCAAB',
  americanfootball_ncaaf: 'NCAAF',
  americanfootball_ufl: 'UFL',
  basketball_wnba: 'WNBA',
  icehockey_nhl: 'NHL',
  soccer_usa_mls: 'MLS',
  soccer_world_cup: 'World Cup',
  all: 'All Sports',
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function UserSurveysPanel() {
  const { data, isLoading } = useAdminSurveyLeagues()
  const designate = useDesignateSurvey()
  const [expandedLeagueId, setExpandedLeagueId] = useState(null)

  async function toggleDesignate(leagueId, currentlyEnabled) {
    try {
      await designate.mutateAsync({ league_id: leagueId, enabled: !currentlyEnabled })
      toast(currentlyEnabled ? 'Survey disabled' : 'Survey enabled', 'success')
    } catch (err) {
      toast(err?.message || 'Failed to update designation', 'error')
    }
  }

  if (isLoading) {
    return <div className="text-text-muted text-sm">Loading...</div>
  }

  const eligible = data?.eligible || []
  const inProgress = data?.in_progress || []
  const completed = data?.completed || []

  return (
    <div className="space-y-8">
      <Section title="Eligible Leagues" subtitle="Not yet started — designate before lock-in">
        {eligible.length === 0 ? (
          <Empty>No eligible leagues right now.</Empty>
        ) : (
          <ul className="divide-y divide-text-primary/10 rounded-xl border border-text-primary/15 bg-bg-primary/15">
            {eligible.map((l) => (
              <li key={l.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold text-text-primary truncate">{l.name}</div>
                  <div className="text-xs text-text-muted">
                    {SPORT_LABELS[l.sport] || l.sport} · {l.format} · starts {fmtDate(l.starts_at)}
                  </div>
                </div>
                <button
                  onClick={() => toggleDesignate(l.id, l.survey_enabled)}
                  disabled={designate.isPending}
                  className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    l.survey_enabled
                      ? 'bg-accent text-white border-accent'
                      : 'bg-bg-primary text-text-primary border-text-primary/20 hover:border-accent'
                  } disabled:opacity-50`}
                >
                  {l.survey_enabled ? 'Designated' : 'Designate'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Surveys In Progress" subtitle="Designated leagues currently running">
        {inProgress.length === 0 ? (
          <Empty>None in progress.</Empty>
        ) : (
          <ul className="space-y-2">
            {inProgress.map((l) => (
              <LeagueRow
                key={l.id}
                league={l}
                expanded={expandedLeagueId === l.id}
                onToggle={() => setExpandedLeagueId(expandedLeagueId === l.id ? null : l.id)}
                phase="in_progress"
              />
            ))}
          </ul>
        )}
      </Section>

      <Section title="Completed Surveys" subtitle="Past leagues with collected responses">
        {completed.length === 0 ? (
          <Empty>None yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {completed.map((l) => (
              <LeagueRow
                key={l.id}
                league={l}
                expanded={expandedLeagueId === l.id}
                onToggle={() => setExpandedLeagueId(expandedLeagueId === l.id ? null : l.id)}
                phase="completed"
              />
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function Section({ title, subtitle, children }) {
  return (
    <section>
      <h2 className="font-display text-xl mb-1">{title}</h2>
      {subtitle && <p className="text-xs text-text-muted mb-3">{subtitle}</p>}
      {children}
    </section>
  )
}

function Empty({ children }) {
  return <div className="text-sm text-text-muted px-1">{children}</div>
}

function LeagueRow({ league, expanded, onToggle, phase }) {
  return (
    <li className="rounded-xl border border-text-primary/15 bg-bg-primary/15 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-text-primary/5 transition-colors text-left"
      >
        <div className="min-w-0">
          <div className="font-semibold text-text-primary truncate">{league.name}</div>
          <div className="text-xs text-text-muted">
            {SPORT_LABELS[league.sport] || league.sport} · {league.format} · {fmtDate(league.starts_at)} – {fmtDate(league.ends_at)}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div>
            <span className="text-accent font-semibold">{league.counts?.entry || 0}</span>
            <span className="text-text-muted"> entry</span>
            <span className="text-text-muted mx-1">·</span>
            <span className="text-accent font-semibold">{league.counts?.exit || 0}</span>
            <span className="text-text-muted"> exit</span>
          </div>
          <div className="text-text-muted">{league.member_count} members</div>
        </div>
      </button>
      {expanded && <LeagueResponses leagueId={league.id} phase={phase} />}
    </li>
  )
}

function LeagueResponses({ leagueId, phase }) {
  const { data, isLoading } = useAdminSurveyResponses(leagueId)

  async function downloadCsv() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      const res = await fetch(`${API_BASE}/admin/surveys/responses.csv?league_id=${leagueId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error('CSV download failed')
      const csv = await res.text()
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `surveys-${leagueId}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast(err?.message || 'Failed to download', 'error')
    }
  }

  if (isLoading) return <div className="px-4 py-3 text-xs text-text-muted">Loading responses…</div>
  if (!data) return null

  return (
    <div className="border-t border-text-primary/10">
      <div className="px-4 py-3 grid md:grid-cols-2 gap-4">
        <AggregateBlock title="Entry survey" questions={data.entry_questions} aggs={data.aggregates.entry} />
        <AggregateBlock title="Exit survey" questions={data.exit_questions} aggs={data.aggregates.exit} />
      </div>

      <div className="px-4 py-2 flex items-center justify-between border-t border-text-primary/10">
        <div className="text-xs text-text-muted">{data.responses.length} users</div>
        <button
          onClick={downloadCsv}
          className="text-xs text-accent hover:underline"
        >
          Download CSV
        </button>
      </div>

      <ul className="divide-y divide-text-primary/10">
        {data.responses.map((u) => (
          <UserResponseRow
            key={u.user.id}
            entry={u.entry}
            exit={u.exit}
            entryDismissedAt={u.entry_dismissed_at}
            exitDismissedAt={u.exit_dismissed_at}
            user={u.user}
            entryQs={data.entry_questions}
            exitQs={data.exit_questions}
            phase={phase}
          />
        ))}
      </ul>
    </div>
  )
}

function AggregateBlock({ title, questions, aggs }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">{title}</div>
      <ul className="space-y-2">
        {aggs.map((a) => {
          const q = questions.find((x) => x.id === a.id) || {}
          return (
            <li key={a.id} className="text-xs">
              <div className="text-text-primary mb-0.5">{q.prompt || a.prompt}</div>
              <div className="text-text-muted">
                n={a.n}
                {q.type === 'scale' && a.mean !== null ? ` · mean=${a.mean.toFixed(2)}` : ''}
                {Object.keys(a.counts || {}).length > 0 && (
                  <> · {Object.entries(a.counts).map(([v, c]) => `${labelFor(q, v)}:${c}`).join(', ')}</>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function labelFor(q, value) {
  if (q?.type === 'scale') return value
  const opt = (q?.options || []).find((o) => String(o.value) === String(value))
  return opt?.label || value
}

function UserResponseRow({ user, entry, exit, entryDismissedAt, exitDismissedAt, entryQs, exitQs }) {
  const [open, setOpen] = useState(false)
  const entryDone = !!entry
  const exitDone = !!exit
  return (
    <li>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-text-primary/5 transition-colors text-left"
      >
        <Avatar user={user} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary truncate">
            {user.display_name || user.username || user.id.slice(0, 8)}
          </div>
          <div className="text-[11px] text-text-muted">
            Entry: {entryDone ? '✓' : entryDismissedAt ? 'dismissed' : '—'}
            <span className="mx-1.5">·</span>
            Exit: {exitDone ? '✓' : exitDismissedAt ? 'dismissed' : '—'}
          </div>
        </div>
        <svg className={`w-4 h-4 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-3 grid md:grid-cols-2 gap-4">
          <ResponseBlock title="Entry" responses={entry?.responses} questions={entryQs} submittedAt={entry?.submitted_at} dismissedAt={entryDismissedAt} />
          <ResponseBlock title="Exit" responses={exit?.responses} questions={exitQs} submittedAt={exit?.submitted_at} dismissedAt={exitDismissedAt} />
        </div>
      )}
    </li>
  )
}

function ResponseBlock({ title, responses, questions, submittedAt, dismissedAt }) {
  return (
    <div className="rounded-lg border border-text-primary/10 bg-bg-primary/10 p-3 text-xs">
      <div className="font-semibold text-text-primary mb-1.5">{title}</div>
      {!responses ? (
        <div className="text-text-muted">{dismissedAt ? `Dismissed ${fmtDate(dismissedAt)}` : 'No response yet'}</div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {questions.map((q) => (
              <li key={q.id}>
                <div className="text-text-muted">{q.prompt}</div>
                <div className="text-text-primary">{labelFor(q, responses[q.id])}</div>
              </li>
            ))}
          </ul>
          {submittedAt && (
            <div className="text-text-muted mt-2">Submitted {fmtDate(submittedAt)}</div>
          )}
        </>
      )}
    </div>
  )
}

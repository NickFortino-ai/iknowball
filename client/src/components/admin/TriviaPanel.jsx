import { useState, useEffect, useCallback } from 'react'
import { api } from '../../lib/api'
import { toast } from '../ui/Toast'

/**
 * Trivia authoring and review.
 *
 * Historical trivia can't be derived from our data — the database holds this
 * season and the last one, nothing earlier — so these are written by hand,
 * and this is where they're written, checked and published.
 *
 * Everything arrives as a DRAFT, including questions written by an admin.
 * A typo in an answer is invisible until a player is marked wrong for being
 * right, so publishing stays a separate, deliberate act.
 */

const SPORTS = [
  { key: 'all', label: 'All Sports' },
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'basketball_wnba', label: 'WNBA' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'americanfootball_ncaaf', label: 'NCAAF' },
  { key: 'basketball_ncaab', label: 'NCAAB' },
]

const SAMPLE = `Which team won Super Bowl I? | Green Bay Packers* | Kansas City Chiefs | New York Jets | Baltimore Colts #1
Who holds the NBA record for most points in a game? | Wilt Chamberlain* | Kobe Bryant | Michael Jordan | David Thompson #2
[nhl] Who has the most career hat tricks? | Wayne Gretzky* | Mario Lemieux | Mike Bossy | Brett Hull #4`

/**
 * Parse the paste box.
 *
 * One question per line:
 *   Question text | choice | correct choice* | choice | choice
 *
 * The asterisk marks the answer. A leading [nfl] style tag overrides the
 * sport for that line, and a trailing #1-#5 ranks difficulty (1 easiest).
 * Chosen over JSON because writing forty questions by hand in JSON is
 * miserable and every missed brace loses the batch — here a malformed line
 * is reported on its own and the rest still import.
 */
export function parseQuestions(text, defaultSport) {
  const out = []
  const problems = []
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean)

  lines.forEach((line, i) => {
    let sport = defaultSport
    let body = line

    const tag = body.match(/^\[([a-z_]+)\]\s*/i)
    if (tag) {
      const key = tag[1].toLowerCase()
      const match = SPORTS.find((s) => s.key === key || s.key.endsWith(`_${key}`) || s.label.toLowerCase() === key)
      if (match) sport = match.key
      body = body.slice(tag[0].length)
    }

    // Trailing #1-#5 is the difficulty ranking. Stripped before the choices
    // are split so it can't be mistaken for part of the last answer.
    let difficulty = 2
    const diff = body.match(/\s*#([1-5])\s*$/)
    if (diff) {
      difficulty = Number(diff[1])
      body = body.slice(0, diff.index)
    }

    const parts = body.split('|').map((p) => p.trim()).filter(Boolean)
    if (parts.length < 3) {
      problems.push({ line: i + 1, text: line, problem: 'needs a question and at least two choices' })
      return
    }

    const question = parts[0]
    const rawChoices = parts.slice(1)
    const answerIndex = rawChoices.findIndex((c) => c.endsWith('*'))
    if (answerIndex === -1) {
      problems.push({ line: i + 1, text: line, problem: 'no choice marked with *' })
      return
    }
    if (rawChoices.filter((c) => c.endsWith('*')).length > 1) {
      problems.push({ line: i + 1, text: line, problem: 'more than one choice marked with *' })
      return
    }

    const choices = rawChoices.map((c) => c.replace(/\*$/, '').trim())
    if (new Set(choices.map((c) => c.toLowerCase())).size !== choices.length) {
      problems.push({ line: i + 1, text: line, problem: 'duplicate choices' })
      return
    }

    out.push({ sport, question, choices, answer_index: answerIndex, difficulty })
  })

  return { questions: out, problems }
}

export default function TriviaPanel() {
  const [tab, setTab] = useState('add')
  const [sport, setSport] = useState('all')
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)

  const [filterStatus, setFilterStatus] = useState('draft')
  const [rows, setRows] = useState([])
  const [byStatus, setByStatus] = useState({})
  const [publishedBySport, setPublishedBySport] = useState({})
  const [selected, setSelected] = useState(new Set())
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.get(`/trivia?status=${filterStatus}`)
      setRows(data.questions || [])
      setByStatus(data.byStatus || {})
      setPublishedBySport(data.publishedBySport || {})
      setSelected(new Set())
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }, [filterStatus])

  useEffect(() => { load() }, [load])

  const preview = parseQuestions(text, sport)

  async function submit() {
    if (!preview.questions.length) return toast('Nothing to add', 'error')
    setSaving(true)
    try {
      const res = await api.post('/trivia', { questions: preview.questions })
      const bits = [`Added ${res.inserted} as drafts`]
      if (res.rejected?.length) bits.push(`${res.rejected.length} rejected`)
      toast(bits.join(' · '), res.inserted ? 'success' : 'error')
      if (res.inserted) { setText(''); setTab('review'); setFilterStatus('draft') }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(ids, status) {
    if (!ids.length) return
    try {
      const res = await api.post('/trivia/bulk-status', { ids, status })
      toast(`${res.updated} ${status}`, 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {[
          { key: 'add', label: 'Add Questions' },
          { key: 'review', label: `Review${byStatus.draft ? ` (${byStatus.draft})` : ''}` },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold ${
              tab === t.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
            }`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-text-muted self-center">
          {byStatus.published || 0} published · {byStatus.draft || 0} draft · {byStatus.archived || 0} archived
        </span>
      </div>

      {tab === 'add' ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-text-muted">Default sport:</span>
            {SPORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSport(s.key)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  sport === s.key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="text-xs text-text-muted leading-relaxed">
            One question per line. Separate with <code className="text-text-primary">|</code> and mark the
            correct answer with <code className="text-text-primary">*</code>.
            Start a line with <code className="text-text-primary">[nfl]</code> to override the sport,
            and end it with <code className="text-text-primary">#1</code>–<code className="text-text-primary">#5</code> to rank difficulty (1 easiest, default 2).
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={SAMPLE}
            rows={12}
            className="w-full rounded-lg bg-bg-primary/60 border border-text-primary/20 p-3 text-sm font-mono text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />

          {text.trim() && (
            <div className="rounded-lg border border-text-primary/15 p-3 space-y-2">
              <div className="text-xs font-semibold text-text-secondary">
                {preview.questions.length} ready
                {preview.problems.length > 0 && ` · ${preview.problems.length} need fixing`}
              </div>
              {preview.problems.map((p) => (
                <div key={p.line} className="text-xs text-incorrect">
                  Line {p.line}: {p.problem}
                </div>
              ))}
              {preview.questions.slice(0, 3).map((q, i) => (
                <div key={i} className="text-xs text-text-muted">
                  <span className="text-text-primary">{q.question}</span>
                  {' → '}
                  <span className="text-correct">{q.choices[q.answer_index]}</span>
                  <span className="ml-1.5 text-text-muted">#{q.difficulty}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={submit}
            disabled={saving || !preview.questions.length}
            className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Adding…' : `Add ${preview.questions.length} as drafts`}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex gap-2 items-center flex-wrap">
            {['draft', 'published', 'archived'].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                  filterStatus === s ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary'
                }`}
              >
                {s}
              </button>
            ))}
            {selected.size > 0 && (
              <div className="ml-auto flex gap-2">
                <button onClick={() => setStatus([...selected], 'published')} className="rounded-lg bg-correct px-3 py-1 text-xs font-semibold text-white">
                  Publish {selected.size}
                </button>
                <button onClick={() => setStatus([...selected], 'archived')} className="rounded-lg border border-text-primary/20 px-3 py-1 text-xs font-semibold text-text-secondary">
                  Archive
                </button>
              </div>
            )}
          </div>

          {/* Which sports can actually fill a round. A sport with three
              published questions will serve a three-question round, which
              reads as broken rather than as "not ready yet". */}
          <div className="text-xs text-text-muted">
            Published by sport: {Object.entries(publishedBySport).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none yet'}
          </div>

          {loading ? (
            <p className="text-sm text-text-muted">Loading…</p>
          ) : !rows.length ? (
            <p className="text-sm text-text-muted">No {filterStatus} questions.</p>
          ) : (
            <div className="divide-y divide-text-primary/10">
              {rows.map((r) => (
                <label key={r.id} className="flex gap-3 py-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selected)
                      e.target.checked ? next.add(r.id) : next.delete(r.id)
                      setSelected(next)
                    }}
                    className="mt-1"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-text-primary">{r.question}</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {(r.choices || []).map((c, i) => (
                        <span key={i} className={i === r.answer_index ? 'text-correct' : ''}>
                          {i > 0 && ' · '}{c}
                        </span>
                      ))}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {r.sport} · difficulty {r.difficulty ?? 2}
                      {r.times_served > 0 && ` · asked ${r.times_served}× · ${Math.round((r.times_correct / r.times_served) * 100)}% right`}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

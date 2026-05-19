import { useState } from 'react'
import { api } from '../../lib/api'
import { useQueryClient } from '@tanstack/react-query'

// Pre/post league survey modal. Renders one question at a time, auto-
// advances on selection. Top note shows on Q1 only. "Permanently
// dismiss" link at the bottom on every step. After the last question
// answers are submitted, a "Thanks!" flash shows for 2s then closes.
export default function SurveyModal({ leagueId, surveyType, questions, sportLabel, topNote, onClose }) {
  const queryClient = useQueryClient()
  const [step, setStep] = useState(0)
  const [responses, setResponses] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [thanks, setThanks] = useState(false)
  const [error, setError] = useState(null)

  const total = questions.length
  const q = questions[step]
  const sportToken = sportLabel || 'this sport'

  function fillTemplate(text) {
    return String(text || '').replace(/this sport/gi, sportToken)
  }

  async function recordAnswer(value) {
    const next = { ...responses, [q.id]: value }
    setResponses(next)
    if (step + 1 < total) {
      setStep(step + 1)
      return
    }
    // Last question — submit.
    setSubmitting(true)
    setError(null)
    try {
      await api.post('/surveys/submit', {
        league_id: leagueId,
        survey_type: surveyType,
        responses: next,
      })
      setThanks(true)
      // Defer the invalidation — running it immediately would flip
      // surveyStatus.surveyType to null at the parent and unmount this
      // modal before the Thanks! flash has a chance to render.
      setTimeout(() => {
        onClose()
        queryClient.invalidateQueries({ queryKey: ['survey-status', leagueId] })
      }, 3000)
    } catch (err) {
      setError(err?.message || 'Failed to save. Please try again.')
      setSubmitting(false)
    }
  }

  async function permanentlyDismiss() {
    try {
      await api.post('/surveys/dismiss', {
        league_id: leagueId,
        survey_type: surveyType,
      })
      queryClient.invalidateQueries({ queryKey: ['survey-status', leagueId] })
    } catch {
      // Even if dismiss fails server-side, close the modal — they'll see it again next visit.
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full max-w-md rounded-2xl p-6 text-text-primary"
        onClick={(e) => e.stopPropagation()}
      >
        {thanks ? (
          <div className="py-10 text-center">
            <div className="font-display text-3xl">
              <span className="text-accent">Thanks</span>
              <span className="text-text-primary">!</span>
            </div>
            <div className="mt-2 text-sm text-text-muted">Your responses are saved.</div>
          </div>
        ) : (
          <>
            {step === 0 && (
              <p className="text-sm mb-5">
                <span className="font-display text-accent">IKB</span>
                <span className="font-display text-text-primary"> is extremely interested in the psychology of watching, tracking, and enjoying sports. If you're open to it, please answer a few quick questions about your experience.</span>
              </p>
            )}

            <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
              Question {step + 1}/{total}
            </div>
            <h2 className="font-display text-lg text-text-primary mb-4">
              {fillTemplate(q.prompt)}
            </h2>

            {q.type === 'scale' ? (
              <ScaleInput
                min={q.min}
                max={q.max}
                minLabel={q.minLabel}
                maxLabel={q.maxLabel}
                onPick={(v) => recordAnswer(v)}
                disabled={submitting}
              />
            ) : (
              <div className="space-y-2 mb-2">
                {q.options.map((opt) => (
                  <button
                    key={opt.value}
                    disabled={submitting}
                    onClick={() => recordAnswer(opt.value)}
                    className="w-full text-left px-4 py-3 rounded-lg text-sm bg-bg-primary border border-text-primary/20 text-text-primary hover:bg-accent/10 hover:border-accent transition-colors disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}

            {error && (
              <div className="text-xs text-incorrect mt-3">{error}</div>
            )}

            <div className="mt-5 text-center">
              <button
                onClick={permanentlyDismiss}
                disabled={submitting}
                className="text-xs text-text-muted hover:text-text-primary underline disabled:opacity-50"
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ScaleInput({ min, max, minLabel, maxLabel, onPick, disabled }) {
  const values = []
  for (let v = min; v <= max; v++) values.push(v)
  return (
    <div className="mb-2">
      <div className="grid grid-cols-7 gap-1.5 mb-2">
        {values.map((v) => (
          <button
            key={v}
            disabled={disabled}
            onClick={() => onPick(v)}
            className="aspect-square rounded-lg bg-bg-primary border border-text-primary/20 text-text-primary font-display text-base hover:bg-accent/10 hover:border-accent transition-colors disabled:opacity-50"
          >
            {v}
          </button>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-text-muted px-1">
        <span>{min} = {minLabel}</span>
        <span>{max} = {maxLabel}</span>
      </div>
    </div>
  )
}

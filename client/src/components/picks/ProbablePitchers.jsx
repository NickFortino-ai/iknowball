import { useState } from 'react'

// MLB probable starters. Extracted from GameDetailModal so the Game Intel
// modal can show them too: probables live on ESPN's SCOREBOARD payload
// (competitor.probables), not on the summary the preview is built from, so
// they arrive via /games/:id/intel rather than with the rest of the preview.

function PitcherAvatar({ headshot, name }) {
  const [errored, setErrored] = useState(false)
  const initials = (name || '?').split(/\s+/).map((n) => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?'
  if (headshot && !errored) {
    return (
      <img
        src={headshot}
        alt=""
        className="w-12 h-12 rounded-full object-cover bg-bg-secondary shrink-0"
        onError={() => setErrored(true)}
      />
    )
  }
  return (
    <div className="w-12 h-12 rounded-full bg-bg-secondary shrink-0 flex items-center justify-center text-sm text-text-muted font-bold">
      {initials}
    </div>
  )
}

function PitcherRow({ pitcher, teamName }) {
  if (!pitcher) return null
  return (
    <div className="flex items-center gap-3">
      <PitcherAvatar headshot={pitcher.headshot} name={pitcher.name} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-text-primary">{pitcher.name}</div>
        <div className="text-xs text-text-muted">
          {/* Nickname only — "New York Yankees" is too long for this line and
              the full name is already in the modal header. */}
          {(teamName || '').split(' ').pop()}{pitcher.record ? ` · ${pitcher.record}` : ''}
        </div>
        {pitcher.stats && <div className="text-xs text-text-secondary mt-0.5">{pitcher.stats}</div>}
      </div>
    </div>
  )
}

export default function ProbablePitchers({ awayPitcher, homePitcher, awayTeam, homeTeam }) {
  if (!awayPitcher && !homePitcher) return null
  return (
    <div>
      <div className="text-xs text-text-muted uppercase tracking-wider mb-3">Probable Pitchers</div>
      <div className="space-y-3">
        <PitcherRow pitcher={awayPitcher} teamName={awayTeam} />
        {awayPitcher && homePitcher && <div className="h-px bg-text-primary/10" />}
        <PitcherRow pitcher={homePitcher} teamName={homeTeam} />
      </div>
    </div>
  )
}

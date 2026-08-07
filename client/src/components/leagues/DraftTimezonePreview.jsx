// Small helper strip that renders under a draft-date picker so the
// commissioner can see what timezone-specific time their league members
// will actually receive. The picker itself takes browser-local input —
// this preview surfaces the impact for members outside the commish's
// zone (especially useful when the commish is traveling and their
// browser-local doesn't match the league's usual zone).
export default function DraftTimezonePreview({ localValue }) {
  if (!localValue) return null
  // datetime-local values are timezone-naive ("YYYY-MM-DDTHH:MM").
  // JS Date parses that as browser-local, which is exactly what the
  // form will submit — so this preview matches what the server stores.
  const d = new Date(localValue)
  if (isNaN(d.getTime())) return null

  const fmt = (tz) =>
    d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: tz, timeZoneName: 'short',
    })

  return (
    <div className="mt-2 rounded-lg border border-text-primary/15 bg-bg-primary/40 px-3 py-2 text-[11px] leading-relaxed text-text-secondary">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Your members will see</div>
      <div><span className="text-text-primary font-semibold">{fmt('America/Los_Angeles')}</span></div>
      <div><span className="text-text-primary font-semibold">{fmt('America/New_York')}</span></div>
    </div>
  )
}

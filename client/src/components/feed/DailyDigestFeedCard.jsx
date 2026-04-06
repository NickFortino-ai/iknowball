export default function DailyDigestFeedCard({ item }) {
  const { highlights } = item

  const hasHighlights = highlights.biggestUnderdog || highlights.bestParlay || highlights.biggestDay || highlights.streaks?.length > 0 || highlights.records?.length > 0
  if (!hasHighlights) return null

  return (
    <div className="bg-gradient-to-br from-bg-card to-accent/5 border border-accent/30 rounded-xl overflow-hidden border-l-4 border-l-accent">
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{'\u2B50'}</span>
          <span className="font-bold text-base text-text-primary">Yesterday's Highlights</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="space-y-1.5">
          {highlights.biggestUnderdog && (
            <div className="text-sm text-text-secondary">
              <span className="text-yellow-400 font-bold">{'\uD83D\uDC36'} Biggest underdog:</span>{' '}
              <span className="text-accent">@{highlights.biggestUnderdog.username}</span> hit {highlights.biggestUnderdog.team} at +{highlights.biggestUnderdog.odds} for +{highlights.biggestUnderdog.points} pts
            </div>
          )}
          {highlights.bestParlay && (
            <div className="text-sm text-text-secondary">
              <span className="text-correct font-bold">{'\uD83C\uDFB0'} Best parlay:</span>{' '}
              <span className="text-accent">@{highlights.bestParlay.username}</span> hit a {highlights.bestParlay.legs}-legger for +{highlights.bestParlay.points} pts
            </div>
          )}
          {highlights.biggestDay && (
            <div className="text-sm text-text-secondary">
              <span className="text-green-400 font-bold">{'\uD83D\uDCB0'} Biggest day:</span>{' '}
              <span className="text-accent">@{highlights.biggestDay.username}</span> earned +{highlights.biggestDay.points} pts
            </div>
          )}
          {highlights.streaks?.map((s, i) => (
            <div key={i} className="text-sm text-text-secondary">
              <span className="text-orange-400 font-bold">{'\uD83D\uDD25'} Streak:</span>{' '}
              <span className="text-accent">@{s.username}</span> reached a {s.length}-win streak in {s.sport}
            </div>
          ))}
          {highlights.records?.map((r, i) => (
            <div key={i} className="text-sm text-text-secondary">
              <span className="text-purple-400 font-bold">{'\uD83C\uDFC6'} Record:</span>{' '}
              <span className="text-accent">@{r.username}</span> broke {r.record} ({r.value})
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

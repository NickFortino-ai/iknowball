export default function DailyDigestFeedCard({ item }) {
  const { stats, highlights } = item

  return (
    <div className="bg-gradient-to-br from-bg-card to-accent/5 border border-accent/30 rounded-xl overflow-hidden border-l-4 border-l-accent">
      {/* Header */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{'\uD83D\uDCCA'}</span>
          <span className="font-bold text-base text-text-primary">Yesterday's Recap</span>
        </div>
      </div>

      <div className="px-4 pb-4">
        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div className="text-center bg-bg-secondary/50 rounded-lg py-2">
            <div className="text-xl font-bold text-text-primary">{stats.totalPicks}</div>
            <div className="text-xs text-text-muted uppercase tracking-wider">Picks</div>
          </div>
          <div className="text-center bg-bg-secondary/50 rounded-lg py-2">
            <div className="text-xl font-bold text-correct">{stats.wins}</div>
            <div className="text-xs text-text-muted uppercase tracking-wider">Wins</div>
          </div>
          <div className="text-center bg-bg-secondary/50 rounded-lg py-2">
            <div className="text-xl font-bold text-text-primary">{stats.winRate}%</div>
            <div className="text-xs text-text-muted uppercase tracking-wider">Win Rate</div>
          </div>
        </div>

        {/* Highlights */}
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

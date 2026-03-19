import { useMemo, useState, Fragment } from 'react'

function MatchupCard({ matchup, pick, eliminated, showPick, onTap, size = 'default', playInPickResults = {} }) {
  const [showScore, setShowScore] = useState(false)

  const topCorrect = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'top'
  const bottomCorrect = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'bottom'
  const topWrong = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'bottom'
  const bottomWrong = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'top'

  const hasScores = matchup.status === 'completed' && matchup.score_top != null && matchup.score_bottom != null
  const canExpand = !onTap && hasScores

  function handleClick() {
    if (onTap) return onTap(matchup)
    if (canExpand) setShowScore((s) => !s)
  }

  const isClickable = !!onTap || canExpand

  function teamClass(team, isTop) {
    if (!team) return 'text-text-muted'
    if (showPick && pick === team) {
      if (isTop ? topCorrect : bottomCorrect) return 'text-correct font-semibold'
      if (isTop ? topWrong : bottomWrong) return 'text-incorrect line-through'
      if (eliminated) return 'text-text-muted line-through'
      return 'text-accent font-semibold'
    }
    // Show play-in pick result on Round 1 teams
    if (showPick && playInPickResults[team] === 'correct') return 'text-correct font-semibold'
    if (showPick && playInPickResults[team] === 'incorrect') return 'text-incorrect line-through'
    if (matchup.status === 'completed') {
      const isWinner = (isTop && matchup.winner === 'top') || (!isTop && matchup.winner === 'bottom')
      return isWinner ? 'font-semibold text-text-primary' : 'text-text-muted'
    }
    return 'text-text-primary'
  }

  return (
    <div
      className={`bg-bg-card border border-border rounded-lg ${size === 'xl' ? 'w-56 text-base' : size === 'lg' ? 'w-48 text-sm' : 'w-44 text-xs'} overflow-hidden${isClickable ? ' cursor-pointer hover:border-accent/50 transition-colors' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <div className={`flex items-center gap-1 ${size === 'xl' ? 'px-3 py-3' : size === 'lg' ? 'px-2.5 py-2' : 'px-2 py-1.5'} border-b border-border ${teamClass(matchup.team_top, true)}`}>
        {matchup.seed_top != null && (
          <span className={`text-text-muted ${size === 'xl' ? 'w-5' : 'w-4'} text-right shrink-0`}>{matchup.seed_top}</span>
        )}
        <span className="truncate flex-1">{matchup.team_top || 'TBD'}</span>
        {matchup.status === 'completed' && matchup.winner === 'top' && (
          <span className="text-correct shrink-0">W</span>
        )}
      </div>
      <div className={`flex items-center gap-1 ${size === 'xl' ? 'px-3 py-3' : size === 'lg' ? 'px-2.5 py-2' : 'px-2 py-1.5'} ${teamClass(matchup.team_bottom, false)}`}>
        {matchup.seed_bottom != null && (
          <span className={`text-text-muted ${size === 'xl' ? 'w-5' : 'w-4'} text-right shrink-0`}>{matchup.seed_bottom}</span>
        )}
        <span className="truncate flex-1">{matchup.team_bottom || 'TBD'}</span>
        {matchup.status === 'completed' && matchup.winner === 'bottom' && (
          <span className="text-correct shrink-0">W</span>
        )}
      </div>
      {showScore && (
        <div className="border-t border-border bg-bg-card-hover px-2 py-1 text-center text-text-muted">
          {matchup.score_top} - {matchup.score_bottom}
        </div>
      )}
    </div>
  )
}

export default function BracketDisplay({ matchups, picks, rounds, regions, onMatchupTap, initialRegion }) {
  const [selectedRegion, setSelectedRegion] = useState(initialRegion ?? null)

  // Build pick lookup by template_matchup_id
  const pickMap = useMemo(() => {
    const map = {}
    for (const p of picks || []) {
      map[p.template_matchup_id] = { team: p.picked_team, eliminated: p.is_eliminated }
    }
    return map
  }, [picks])

  // Group matchups by round (exclude play-in round 0 from bracket view)
  const byRound = useMemo(() => {
    const grouped = {}
    for (const m of matchups || []) {
      if (m.round_number === 0) continue
      if (!grouped[m.round_number]) grouped[m.round_number] = []
      grouped[m.round_number].push(m)
    }
    // Sort each round by position
    for (const key in grouped) {
      grouped[key].sort((a, b) => a.position - b.position)
    }
    return grouped
  }, [matchups])

  // Filter by region when selected
  const filteredByRound = useMemo(() => {
    if (!selectedRegion) return byRound
    const filtered = {}
    for (const key in byRound) {
      const regionMatchups = byRound[key].filter((m) => m.region === selectedRegion)
      if (regionMatchups.length > 0) filtered[key] = regionMatchups
    }
    return filtered
  }, [byRound, selectedRegion])

  // Build team→seed map from Round 1 matchups (seeds only set on early rounds)
  const teamSeedMap = useMemo(() => {
    const map = {}
    for (const m of matchups || []) {
      if (m.round_number <= 1 && m.team_top && m.seed_top != null) map[m.team_top] = m.seed_top
      if (m.round_number <= 1 && m.team_bottom && m.seed_bottom != null) map[m.team_bottom] = m.seed_bottom
    }
    return map
  }, [matchups])

  // Build position-based feeder map for resolving team names from picks
  const feederMap = useMemo(() => {
    const map = {}
    const all = (matchups || []).filter((m) => m.round_number > 0)
    const byRoundLocal = {}
    for (const m of all) {
      if (!byRoundLocal[m.round_number]) byRoundLocal[m.round_number] = []
      byRoundLocal[m.round_number].push(m)
    }
    for (const key in byRoundLocal) {
      byRoundLocal[key].sort((a, b) => a.position - b.position)
    }
    for (const m of all) {
      if (m.round_number <= 1) continue
      const prevRound = byRoundLocal[m.round_number - 1]
      if (!prevRound?.length) continue
      const prevMatchups = m.region ? prevRound.filter((p) => p.region === m.region) : prevRound
      const myRound = byRoundLocal[m.round_number]
      const sameGroup = m.region ? myRound.filter((p) => p.region === m.region) : myRound
      const myIdx = sameGroup.indexOf(m)
      map[m.id] = { top: prevMatchups[myIdx * 2] || null, bottom: prevMatchups[myIdx * 2 + 1] || null }
    }
    return map
  }, [matchups])

  // Resolve team names from picks for matchups with null teams
  const resolvedMatchups = useMemo(() => {
    if (!picks?.length) return null

    function resolveFromFeeder(feeder) {
      if (!feeder) return null
      const pick = pickMap[feeder.template_matchup_id]?.team
      if (pick) return pick
      if (feeder.winner === 'top') return feeder.team_top
      if (feeder.winner === 'bottom') return feeder.team_bottom
      return null
    }

    const resolved = {}

    // Resolve play-in picks into Round 1 null slots
    // Match by region + seed: a play-in between two 16-seeds feeds the 1-vs-16 R1 slot
    const playIns = (matchups || []).filter((m) => m.round_number === 0)
    if (playIns.length) {
      const r1WithNull = (matchups || []).filter((m) => m.round_number === 1 && (!m.team_top || !m.team_bottom))

      for (const r1 of r1WithNull) {
        // Determine the expected seed for the null slot
        const nullIsTop = !r1.team_top
        const expectedSeed = nullIsTop ? r1.seed_top : r1.seed_bottom

        // Find the play-in in the same region whose teams have the matching seed
        const matchingPlayIn = playIns.find((p) =>
          p.region === r1.region &&
          expectedSeed != null &&
          (p.seed_top === expectedSeed || p.seed_bottom === expectedSeed)
        )

        if (!matchingPlayIn) continue
        const resolvedTeam = resolveFromFeeder(matchingPlayIn)
        if (!resolvedTeam) continue

        resolved[r1.id] = {
          team_top: nullIsTop ? resolvedTeam : r1.team_top,
          team_bottom: nullIsTop ? r1.team_bottom : resolvedTeam,
          seed_top: nullIsTop ? (expectedSeed ?? teamSeedMap[resolvedTeam] ?? null) : r1.seed_top,
          seed_bottom: nullIsTop ? r1.seed_bottom : (expectedSeed ?? teamSeedMap[resolvedTeam] ?? null),
        }
      }
    }

    // Resolve later rounds (Round 2+) from picks
    for (const m of matchups || []) {
      if (m.round_number <= 1 || (m.team_top && m.team_bottom)) continue
      const feeders = feederMap[m.id]
      if (!feeders) continue
      const topTeam = m.team_top || resolveFromFeeder(feeders.top)
      const bottomTeam = m.team_bottom || resolveFromFeeder(feeders.bottom)
      resolved[m.id] = {
        team_top: topTeam,
        team_bottom: bottomTeam,
        seed_top: topTeam ? (m.seed_top ?? teamSeedMap[topTeam] ?? null) : null,
        seed_bottom: bottomTeam ? (m.seed_bottom ?? teamSeedMap[bottomTeam] ?? null) : null,
      }
    }
    return resolved
  }, [matchups, picks, pickMap, feederMap, teamSeedMap])

  // Determine facing bracket layout (4+ regions, no specific region selected)
  const facingLayout = useMemo(() => {
    if (selectedRegion || !regions || regions.length < 4) return null

    // Use regions array order for left/right pairing
    // First 2 regions go left, last 2 go right — admin controls order
    const left = [regions[0], regions[1]]
    const right = [regions[2], regions[3]]

    // Determine which rounds have regional matchups vs cross-region
    const regionalRoundSet = new Set()
    const crossRoundSet = new Set()
    for (const m of matchups || []) {
      if (m.round_number > 0) {
        if (m.region) regionalRoundSet.add(m.round_number)
        else crossRoundSet.add(m.round_number)
      }
    }

    return {
      left,
      right,
      regionalRounds: [...regionalRoundSet].sort((a, b) => a - b),
      crossRounds: [...crossRoundSet].sort((a, b) => a - b),
    }
  }, [selectedRegion, regions, matchups])

  // Center column matchups (FF + Championship) for facing layout
  const centerMatchups = useMemo(() => {
    if (!facingLayout) return null

    const ffRound = facingLayout.crossRounds.find((r) => (byRound[r]?.length || 0) === 2)
    const champRound = facingLayout.crossRounds.find((r) => (byRound[r]?.length || 0) === 1)
    if (!ffRound) return null

    const ffMatchups = [...(byRound[ffRound] || [])].sort((a, b) => a.position - b.position)
    return {
      ffLeft: ffMatchups[0],
      ffRight: ffMatchups[1],
      championship: champRound ? byRound[champRound]?.[0] : null,
      ffRound,
      champRound,
    }
  }, [facingLayout, byRound])

  // Half R1 count for facing layout grids (number of R1 matchups per side)
  const halfR1Count = useMemo(() => {
    if (!facingLayout) return 0
    const r1 = facingLayout.regionalRounds[0]
    return (byRound[r1] || []).filter((m) => facingLayout.left.includes(m.region)).length
  }, [facingLayout, byRound])

  // Gap-aware grid helpers for facing layout (adds spacer row between the two regions)
  const perRegionCount = halfR1Count / 2
  const facingGridTemplate = `repeat(${perRegionCount}, minmax(60px, 1fr)) 20px repeat(${perRegionCount}, minmax(60px, 1fr))`

  function facingGridRow(idx, span) {
    const start = idx * span + 1
    return start > perRegionCount
      ? `${start + 1} / span ${span}`
      : `${start} / span ${span}`
  }

  const useFacing = !!(facingLayout && centerMatchups)

  const roundNumbers = Object.keys(filteredByRound).map(Number).sort((a, b) => a - b)
  const firstRoundCount = filteredByRound[roundNumbers[0]]?.length || 0

  function getRoundName(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.name || `Round ${roundNum}`
  }

  function getRoundPoints(roundNum) {
    const r = (rounds || []).find((r) => r.round_number === roundNum)
    return r?.points_per_correct || 0
  }

  // Build play-in pick results: team name → 'correct' | 'incorrect'
  // So Round 1 matchup cards can show green/red for play-in winners
  const playInPickResults = useMemo(() => {
    const map = {}
    const playInMatchups = (matchups || []).filter((m) => m.round_number === 0)
    for (const m of playInMatchups) {
      const pick = pickMap[m.template_matchup_id]
      if (!pick || m.status !== 'completed' || !m.winner) continue
      const winningTeam = m.winner === 'top' ? m.team_top : m.team_bottom
      if (pick.team === winningTeam) {
        map[winningTeam] = 'correct'
      } else {
        map[pick.team] = 'incorrect'
        map[winningTeam] = 'unpicked'
      }
    }
    return map
  }, [matchups, pickMap])

  const hasPicks = picks && picks.length > 0
  const showRegionTabs = regions && regions.length >= 2

  // ── Helper: render a matchup card with resolved data ──

  function renderCard(matchup, size) {
    const resolved = resolvedMatchups?.[matchup.id]
    const dm = resolved
      ? {
          ...matchup,
          team_top: resolved.team_top || matchup.team_top,
          team_bottom: resolved.team_bottom || matchup.team_bottom,
          seed_top: resolved.seed_top ?? matchup.seed_top,
          seed_bottom: resolved.seed_bottom ?? matchup.seed_bottom,
        }
      : matchup

    return (
      <MatchupCard
        matchup={dm}
        pick={pickMap[matchup.template_matchup_id]?.team}
        eliminated={pickMap[matchup.template_matchup_id]?.eliminated}
        showPick={hasPicks}
        onTap={onMatchupTap}
        size={size}
        playInPickResults={playInPickResults}
      />
    )
  }

  // ── Helper: render one bracket connector element (merge 2→1) ──

  function renderConnectorElement(mirrored) {
    if (mirrored) {
      return (
        <>
          <div className="w-3 flex flex-col">
            <div className="flex-1 border-b border-border/70" />
            <div className="flex-1" />
          </div>
          <div className="w-3 flex flex-col">
            <div className="flex-1" />
            <div className="flex-1 border-t border-l border-border/70" />
            <div className="flex-1 border-b border-l border-border/70" />
            <div className="flex-1" />
          </div>
        </>
      )
    }
    return (
      <>
        <div className="w-3 flex flex-col">
          <div className="flex-1" />
          <div className="flex-1 border-t border-r border-border/70" />
          <div className="flex-1 border-b border-r border-border/70" />
          <div className="flex-1" />
        </div>
        <div className="w-3 flex flex-col">
          <div className="flex-1 border-b border-border/70" />
          <div className="flex-1" />
        </div>
      </>
    )
  }

  // ── Helper: render a column of connector elements ──

  function renderConnectorColumn(count, span, gridTemplate, rowFn, mirrored, key) {
    return (
      <div key={key} className="flex flex-col">
        <div className="text-xs font-semibold mb-1 invisible">&nbsp;</div>
        <div className="text-[10px] mb-3 invisible">&nbsp;</div>
        <div className="grid gap-y-1" style={{ gridTemplateRows: gridTemplate }}>
          {Array.from({ length: count }, (_, idx) => (
            <div
              key={idx}
              className="flex"
              style={{ gridRow: rowFn(idx, span) }}
            >
              {renderConnectorElement(mirrored)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ── Facing bracket: render one half (left or right side) ──

  function renderBracketHalf(halfRegions, mirrored, side) {
    const { regionalRounds } = facingLayout

    // Matchups for this half, grouped by round
    const halfByRound = {}
    for (const r of regionalRounds) {
      halfByRound[r] = (byRound[r] || []).filter((m) => halfRegions.includes(m.region))
    }

    const displayRounds = mirrored ? [...regionalRounds].reverse() : regionalRounds
    const elements = []

    displayRounds.forEach((roundNum, displayIdx) => {
      const logicalIdx = regionalRounds.indexOf(roundNum)
      const matchupsList = halfByRound[roundNum] || []
      const span = Math.pow(2, logicalIdx)
      const isLastDisplay = displayIdx === displayRounds.length - 1

      // Round column
      elements.push(
        <div key={`${side}-r-${roundNum}`} className="flex flex-col items-center">
          <div className="text-xs font-semibold text-text-secondary mb-1">
            {getRoundName(roundNum)}
          </div>
          <div className="text-[10px] text-text-muted mb-3">
            {getRoundPoints(roundNum)} pts
          </div>
          <div
            className="grid gap-y-1"
            style={{ gridTemplateRows: facingGridTemplate }}
          >
            {matchupsList.map((matchup, idx) => (
              <div
                key={matchup.id}
                className="flex items-center"
                style={{ gridRow: facingGridRow(idx, span) }}
              >
                {renderCard(matchup, 'default')}
              </div>
            ))}
          </div>
        </div>
      )

      // Inter-round connector
      if (!isLastDisplay) {
        let connCount, connSpan
        if (mirrored) {
          // Mirrored: current display round is "fewer" side (closer to center)
          connCount = matchupsList.length
          connSpan = span
        } else {
          // Normal: next display round is "fewer" side
          const nextRound = displayRounds[displayIdx + 1]
          const nextLogical = regionalRounds.indexOf(nextRound)
          connCount = halfByRound[nextRound]?.length || 0
          connSpan = Math.pow(2, nextLogical)
        }

        if (connCount > 0) {
          elements.push(
            renderConnectorColumn(connCount, connSpan, facingGridTemplate, facingGridRow, mirrored, `${side}-c-${roundNum}`)
          )
        }
      }
    })

    // Merge-to-center connector (last regional round → FF)
    const fullSpanRow = (_, __) => '1 / -1'
    const mergeConn = renderConnectorColumn(
      1,
      0,
      facingGridTemplate,
      fullSpanRow,
      mirrored,
      `${side}-merge`
    )
    if (mirrored) {
      elements.unshift(mergeConn)
    } else {
      elements.push(mergeConn)
    }

    return elements
  }

  // ── Facing bracket: render a center column matchup (FF or Championship) ──

  function renderCenterMatchup(matchup, size, roundNum) {
    if (!matchup) return null
    return (
      <div className="flex flex-col items-center">
        <div className="text-xs font-semibold text-text-secondary mb-1">
          {getRoundName(roundNum)}
        </div>
        <div className="text-[10px] text-text-muted mb-3">
          {getRoundPoints(roundNum)} pts
        </div>
        <div
          className="grid gap-y-1"
          style={{ gridTemplateRows: facingGridTemplate }}
        >
          <div style={{ gridRow: '1 / -1' }} className="flex items-center">
            {renderCard(matchup, size)}
          </div>
        </div>
      </div>
    )
  }

  // ── Facing bracket: horizontal line connector between center cards ──

  function renderCenterLine() {
    return (
      <div className="flex flex-col">
        <div className="text-xs font-semibold mb-1 invisible">&nbsp;</div>
        <div className="text-[10px] mb-3 invisible">&nbsp;</div>
        <div
          className="grid gap-y-1"
          style={{ gridTemplateRows: facingGridTemplate }}
        >
          <div style={{ gridRow: '1 / -1' }} className="flex items-center">
            <div className="w-4 h-px bg-border/70" />
          </div>
        </div>
      </div>
    )
  }

  // Desktop horizontal view — break out of parent max-w container to use full viewport width
  return (
    <div
      className={`md:w-[calc(100vw-3rem)] ${useFacing ? '' : 'md:max-w-[1400px]'} md:-ml-[calc((100vw-3rem-100%)/2)] md:self-center`}
    >
      {/* Region tabs */}
      {showRegionTabs && (
        <div className="flex gap-1 mb-3 overflow-x-auto pb-1">
          <button
            onClick={() => setSelectedRegion(null)}
            className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
              !selectedRegion
                ? 'bg-accent/20 text-accent'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            All
          </button>
          {regions.map((region) => (
            <button
              key={region}
              onClick={() => setSelectedRegion(region)}
              className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                selectedRegion === region
                  ? 'bg-accent/20 text-accent'
                  : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              {region}
            </button>
          ))}
        </div>
      )}

      <div className={`overflow-x-auto ${useFacing ? 'bg-black rounded-xl' : ''}`}>
        {useFacing ? (
          /* ── Facing bracket layout ── */
          <div className="relative flex min-w-max py-2">
            <img
              src="/ncaa-bracket-ball.png"
              alt=""
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(100%+3rem)] w-[500px] h-auto opacity-50 pointer-events-none z-0"
            />
            <div className="relative z-10 flex min-w-max w-full">
              {renderBracketHalf(facingLayout.left, false, 'left')}
              {renderCenterMatchup(centerMatchups.ffLeft, 'lg', centerMatchups.ffRound)}
              {centerMatchups.championship && renderCenterLine()}
              {centerMatchups.championship &&
                renderCenterMatchup(centerMatchups.championship, 'xl', centerMatchups.champRound)}
              {centerMatchups.championship && renderCenterLine()}
              {renderCenterMatchup(centerMatchups.ffRight, 'lg', centerMatchups.ffRound)}
              {renderBracketHalf(facingLayout.right, true, 'right')}
            </div>
          </div>
        ) : (
          /* ── Linear layout (single region or small bracket) ── */
          <div className="flex min-w-max py-2">
            {roundNumbers.map((roundNum, roundIdx) => {
              const matchupsList = filteredByRound[roundNum] || []
              const span = Math.pow(2, roundIdx)
              const isLast = roundIdx === roundNumbers.length - 1
              const cardSize =
                roundIdx === roundNumbers.length - 1
                  ? 'xl'
                  : roundIdx === roundNumbers.length - 2
                    ? 'lg'
                    : 'default'
              const nextMatchupCount = !isLast
                ? filteredByRound[roundNumbers[roundIdx + 1]]?.length || 0
                : 0
              const nextSpan = Math.pow(2, roundIdx + 1)

              return (
                <Fragment key={roundNum}>
                  <div className="flex flex-col items-center">
                    <div className="text-xs font-semibold text-text-secondary mb-1">
                      {getRoundName(roundNum)}
                    </div>
                    <div className="text-[10px] text-text-muted mb-3">
                      {getRoundPoints(roundNum)} pts
                    </div>
                    <div
                      className="grid gap-y-1"
                      style={{
                        gridTemplateRows: `repeat(${firstRoundCount}, minmax(60px, 1fr))`,
                      }}
                    >
                      {matchupsList.map((matchup, idx) => {
                        const resolved = resolvedMatchups?.[matchup.id]
                        const displayMatchup = resolved
                          ? {
                              ...matchup,
                              team_top: resolved.team_top || matchup.team_top,
                              team_bottom: resolved.team_bottom || matchup.team_bottom,
                              seed_top: resolved.seed_top ?? matchup.seed_top,
                              seed_bottom: resolved.seed_bottom ?? matchup.seed_bottom,
                            }
                          : matchup
                        return (
                          <div
                            key={matchup.id}
                            className="flex items-center"
                            style={{ gridRow: `${idx * span + 1} / span ${span}` }}
                          >
                            <MatchupCard
                              matchup={displayMatchup}
                              pick={pickMap[matchup.template_matchup_id]?.team}
                              eliminated={pickMap[matchup.template_matchup_id]?.eliminated}
                              showPick={hasPicks}
                              onTap={onMatchupTap}
                              size={cardSize}
                              playInPickResults={playInPickResults}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </div>
                  {/* Bracket connector lines to next round */}
                  {!isLast && nextMatchupCount > 0 && (
                    <div className="flex flex-col">
                      <div className="text-xs font-semibold mb-1 invisible">&nbsp;</div>
                      <div className="text-[10px] mb-3 invisible">&nbsp;</div>
                      <div
                        className="grid gap-y-1"
                        style={{
                          gridTemplateRows: `repeat(${firstRoundCount}, minmax(60px, 1fr))`,
                        }}
                      >
                        {Array.from({ length: nextMatchupCount }, (_, idx) => (
                          <div
                            key={idx}
                            className="flex"
                            style={{ gridRow: `${idx * nextSpan + 1} / span ${nextSpan}` }}
                          >
                            {/* Left: horizontal arms from feeder matchups + vertical bar */}
                            <div className="w-3 flex flex-col">
                              <div className="flex-1" />
                              <div className="flex-1 border-t border-r border-border/70" />
                              <div className="flex-1 border-b border-r border-border/70" />
                              <div className="flex-1" />
                            </div>
                            {/* Right: horizontal line from midpoint to next matchup */}
                            <div className="w-3 flex flex-col">
                              <div className="flex-1 border-b border-border/70" />
                              <div className="flex-1" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}

        {/* Legend */}
        {hasPicks && (
          <div className="flex gap-4 mt-4 ml-2 text-[10px] text-text-muted">
            <span>
              <span className="inline-block w-2 h-2 bg-correct rounded-full mr-1" />
              Correct
            </span>
            <span>
              <span className="inline-block w-2 h-2 bg-red-700 rounded-full mr-1" />
              Wrong
            </span>
            <span>
              <span className="inline-block w-2 h-2 bg-accent rounded-full mr-1" />
              Your Pick
            </span>
            <span>
              <span className="line-through mr-1">X</span>Eliminated
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

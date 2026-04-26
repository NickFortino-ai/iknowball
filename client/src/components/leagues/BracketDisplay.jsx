import { useEffect, useMemo, useState, useRef, forwardRef, useImperativeHandle, Fragment } from 'react'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'

function TeamLogo({ team, sportKey, size }) {
  const url = getTeamLogoUrl(team, sportKey)
  const [src, setSrc] = useState(url)
  const [hidden, setHidden] = useState(false)
  useEffect(() => { setSrc(getTeamLogoUrl(team, sportKey)); setHidden(false) }, [team, sportKey])
  if (!src || hidden) return null
  const px = size === 'xl' ? 'w-7 h-7' : size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  return <img src={src} alt="" className={`${px} object-contain shrink-0`} onError={() => {
    const fallback = getTeamLogoFallbackUrl(team, sportKey)
    if (fallback && fallback !== src) setSrc(fallback)
    else setHidden(true)
  }} />
}

// Split "Colorado Avalanche" → { city: "Colorado", name: "Avalanche" }
// Handles multi-word cities like "Los Angeles", "New York", "San Jose", etc.
const MULTI_WORD_CITIES = new Set([
  'Los Angeles', 'New York', 'New Jersey', 'San Jose', 'San Antonio', 'San Francisco',
  'San Diego', 'St. Louis', 'St Louis', 'Las Vegas', 'New Orleans', 'Oklahoma City',
  'Kansas City', 'Salt Lake', 'Green Bay', 'Tampa Bay', 'Golden State',
])

function splitTeamName(fullName) {
  if (!fullName) return { city: '', name: fullName || 'TBD' }
  const words = fullName.split(' ')
  if (words.length <= 1) return { city: '', name: fullName }
  // Try 3-word city, then 2-word city
  for (const len of [3, 2]) {
    if (words.length > len) {
      const candidate = words.slice(0, len).join(' ')
      if (MULTI_WORD_CITIES.has(candidate)) {
        return { city: candidate, name: words.slice(len).join(' ') }
      }
    }
  }
  // Default: first word is city, rest is team name
  return { city: words[0], name: words.slice(1).join(' ') }
}

function TeamRow({ team, seed, sportKey, size, className, cityClass, seriesRecord, recordPosition = 'top', mirrored }) {
  const { city, name } = splitTeamName(team)
  const padding = size === 'xl' ? 'px-3 py-2.5' : size === 'lg' ? 'px-2.5 py-2' : 'px-2 py-1.5'

  const logoEl = <TeamLogo team={team} sportKey={sportKey} size={size} />
  const seedEl = seed != null && (
    <span className={`text-text-muted ${size === 'xl' ? 'w-5' : 'w-4'} ${mirrored ? 'text-left' : 'text-right'} shrink-0`}>{seed}</span>
  )
  const nameEl = team ? (
    <div className={`flex flex-col min-w-0 flex-1 leading-tight ${mirrored ? 'items-end' : ''}`}>
      <span className={`truncate ${size === 'xl' ? 'text-xs' : 'text-[11px]'} ${cityClass || 'text-text-muted'}`}>{city}</span>
      <span className={`truncate font-semibold ${size === 'xl' ? 'text-base' : 'text-sm'}`}>{name}</span>
    </div>
  ) : (
    <span className={`truncate flex-1 ${mirrored ? 'text-right' : ''}`}>TBD</span>
  )

  return (
    <div className={`relative flex items-center gap-1.5 ${padding} ${className}`}>
      {seriesRecord && (
        <span className={`absolute ${recordPosition === 'bottom' ? 'bottom-0.5' : 'top-0.5'} ${mirrored ? 'left-1.5' : 'right-1.5'} text-[9px] font-semibold text-text-muted z-10`}>{seriesRecord}</span>
      )}
      {mirrored ? (
        <>
          {nameEl}
          {seedEl}
          {logoEl}
        </>
      ) : (
        <>
          {logoEl}
          {seedEl}
          {nameEl}
        </>
      )}
    </div>
  )
}

function MatchupCard({ matchup, pick, pickData, eliminated, eliminatedTeams, showPick, onTap, size = 'default', playInPickResults = {}, isBestOf7 = false, sportKey, mirrored = false }) {
  const topCorrect = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'top'
  const bottomCorrect = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'bottom'
  const topWrong = pick && matchup.status === 'completed' && pick === matchup.team_top && matchup.winner === 'bottom'
  const bottomWrong = pick && matchup.status === 'completed' && pick === matchup.team_bottom && matchup.winner === 'top'

  const hasSeriesRecord = isBestOf7 && matchup.status === 'completed' && matchup.series_wins_top != null && matchup.series_wins_bottom != null
  // Live series: series has started (at least 1 win) but not yet completed
  const hasLiveSeries = isBestOf7 && matchup.status !== 'completed' && (matchup.series_wins_top > 0 || matchup.series_wins_bottom > 0)
  // Only show tap affordance for matchups with series data (at least 1 game played)
  const hasCompletedScore = !isBestOf7 && matchup.status === 'completed' && matchup.score_top != null
  const canTap = !!onTap && (hasLiveSeries || hasSeriesRecord || hasCompletedScore)

  // Series length prediction color: white during series, green/orange/red after completion
  let predictionColor = 'text-text-primary'
  if (hasSeriesRecord && pickData?.series_length) {
    const actualLength = (matchup.series_wins_top || 0) + (matchup.series_wins_bottom || 0)
    const diff = Math.abs(pickData.series_length - actualLength)
    if (diff === 0) predictionColor = 'text-correct'
    else if (diff === 1) predictionColor = 'text-accent'
    else predictionColor = 'text-incorrect'
  }

  function handleClick() {
    if (canTap) return onTap(matchup)
  }

  const isClickable = canTap

  function teamClass(team, isTop) {
    if (!team) return 'text-text-muted'
    if (showPick && pick === team) {
      // If pick was eliminated in a previous round, always show gray strikethrough
      if (eliminated) return 'text-text-muted line-through'
      if (isTop ? topCorrect : bottomCorrect) return 'text-correct font-semibold'
      if (isTop ? topWrong : bottomWrong) return 'text-incorrect line-through'
      return 'text-accent font-semibold'
    }
    // Show resolved teams that are eliminated (picked in feeder but lost)
    if (showPick && eliminatedTeams?.has(team)) return 'text-text-muted line-through'
    // Show play-in pick result on Round 1 teams only
    if (showPick && matchup.round_number <= 1 && playInPickResults[team] === 'correct') return 'text-correct font-semibold'
    if (showPick && matchup.round_number <= 1 && playInPickResults[team] === 'incorrect') return 'text-incorrect line-through'
    if (matchup.status === 'completed') {
      const isWinner = (isTop && matchup.winner === 'top') || (!isTop && matchup.winner === 'bottom')
      return isWinner ? 'font-semibold text-text-primary' : 'text-text-muted'
    }
    return 'text-text-primary'
  }

  // City color follows the row's status (green/red/strikethrough/muted)
  function cityClassFor(team, isTop) {
    if (!team) return 'text-text-muted'
    if (showPick && pick === team) {
      if (eliminated) return 'text-text-muted line-through'
      if (isTop ? topCorrect : bottomCorrect) return 'text-correct'
      if (isTop ? topWrong : bottomWrong) return 'text-incorrect line-through'
      return 'text-text-muted'
    }
    if (showPick && eliminatedTeams?.has(team)) return 'text-text-muted line-through'
    if (showPick && matchup.round_number <= 1 && playInPickResults[team] === 'correct') return 'text-correct'
    if (showPick && matchup.round_number <= 1 && playInPickResults[team] === 'incorrect') return 'text-incorrect line-through'
    return 'text-text-muted'
  }

  // Series prediction badge that sits over the divider line between teams.
  // Only shown when the user has a pick on this best-of-7 matchup.
  const predictionLength = isBestOf7 && showPick && pickData?.series_length && (pick === matchup.team_top || pick === matchup.team_bottom)
    ? pickData.series_length
    : null

  return (
    <div
      className={`relative bg-bg-primary/80 backdrop-blur-sm border border-text-primary/20 rounded-lg ${size === 'xl' ? 'w-52 text-sm' : size === 'lg' ? 'w-44 text-xs' : 'w-40 text-xs'} overflow-hidden${isClickable ? ' cursor-pointer hover:border-accent/50 transition-colors' : ''}`}
      onClick={isClickable ? handleClick : undefined}
    >
      <TeamRow
        team={matchup.team_top}
        seed={matchup.seed_top}
        sportKey={sportKey}
        size={size}
        mirrored={mirrored}
        className={`border-b border-text-primary/10 ${teamClass(matchup.team_top, true)}`}
        cityClass={cityClassFor(matchup.team_top, true)}
        seriesRecord={hasSeriesRecord && matchup.winner === 'top' ? `${matchup.series_wins_top}-${matchup.series_wins_bottom}` : null}
        recordPosition="top"
      />
      <TeamRow
        team={matchup.team_bottom}
        seed={matchup.seed_bottom}
        sportKey={sportKey}
        size={size}
        mirrored={mirrored}
        className={teamClass(matchup.team_bottom, false)}
        cityClass={cityClassFor(matchup.team_bottom, false)}
        seriesRecord={hasSeriesRecord && matchup.winner === 'bottom' ? `${matchup.series_wins_bottom}-${matchup.series_wins_top}` : null}
        recordPosition="bottom"
      />
      {predictionLength && (
        <div
          className={`absolute ${mirrored ? 'left-1.5' : 'right-1.5'} ${pick === matchup.team_top ? 'top-1/2 -translate-y-full' : 'top-1/2'} z-20 pointer-events-none`}
        >
          <span className={`text-[9px] font-semibold ${predictionColor}`}>in {predictionLength}</span>
        </div>
      )}
    </div>
  )
}

export default forwardRef(function BracketDisplay({ matchups, picks, rounds, regions, onMatchupTap, initialRegion, seriesFormat, sportKey }, ref) {
  const isBestOf7 = seriesFormat === 'best_of_7'
  const [selectedRegion, setSelectedRegion] = useState(initialRegion ?? null)

  // Build pick lookup by template_matchup_id
  const pickMap = useMemo(() => {
    const map = {}
    for (const p of picks || []) {
      map[p.template_matchup_id] = { team: p.picked_team, eliminated: p.is_eliminated, points_earned: p.points_earned, is_correct: p.is_correct, series_length: p.series_length }
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

  // Build feeder map for resolving team names from picks
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

    // Build region order index for sorting cross-region feeders
    const regionOrder = {}
    if (regions) {
      for (let i = 0; i < regions.length; i++) regionOrder[regions[i]] = i
    }

    for (const m of all) {
      if (m.round_number <= 1) continue
      const prevRound = byRoundLocal[m.round_number - 1]
      if (!prevRound?.length) continue
      let prevMatchups
      if (m.region) {
        prevMatchups = prevRound.filter((p) => p.region === m.region)
      } else {
        // Cross-region: sort by regions array order so FF pairs match left/right sides
        prevMatchups = [...prevRound].sort((a, b) => (regionOrder[a.region] ?? 99) - (regionOrder[b.region] ?? 99))
      }
      const myRound = byRoundLocal[m.round_number]
      const sameGroup = m.region ? myRound.filter((p) => p.region === m.region) : myRound
      const myIdx = sameGroup.indexOf(m)
      map[m.id] = { top: prevMatchups[myIdx * 2] || null, bottom: prevMatchups[myIdx * 2 + 1] || null }
    }
    return map
  }, [matchups, regions])

  // Resolve team names from picks for matchups with null teams
  const resolvedMatchups = useMemo(() => {
    if (!picks?.length) return null

    function resolveFromFeeder(feeder) {
      if (!feeder) return null
      const pick = pickMap[feeder.template_matchup_id]?.team
      return pick || null
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
    // Always show the user's picked teams, not the actual advanced teams
    for (const m of matchups || []) {
      if (m.round_number <= 1) continue
      const feeders = feederMap[m.id]
      if (!feeders) continue
      const topResolved = resolveFromFeeder(feeders.top)
      const bottomResolved = resolveFromFeeder(feeders.bottom)
      // When viewing picks, don't fall back to actual matchup teams — show TBD for unpicked slots
      const topTeam = topResolved || (!picks?.length ? m.team_top : null)
      const bottomTeam = bottomResolved || (!picks?.length ? m.team_bottom : null)
      if (topTeam !== m.team_top || bottomTeam !== m.team_bottom) {
        resolved[m.id] = {
          team_top: topTeam,
          team_bottom: bottomTeam,
          seed_top: topTeam ? (teamSeedMap[topTeam] ?? m.seed_top ?? null) : null,
          seed_bottom: bottomTeam ? (teamSeedMap[bottomTeam] ?? m.seed_bottom ?? null) : null,
        }
      }
    }
    return resolved
  }, [matchups, picks, pickMap, feederMap, teamSeedMap])

  // Determine facing bracket layout (2+ regions, no specific region selected)
  const facingLayout = useMemo(() => {
    if (selectedRegion || !regions || regions.length < 2) return null

    // 2 regions: first region left, second region right (matches admin ordering)
    // 4 regions: first 2 left, last 2 right (NCAA-style)
    const left = regions.length === 2 ? [regions[0]] : [regions[0], regions[1]]
    const right = regions.length === 2 ? [regions[1]] : [regions[2], regions[3]]

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

    // 2-region brackets (NBA): no FF round, just championship in center
    if (!ffRound && champRound) {
      return {
        ffLeft: null,
        ffRight: null,
        championship: byRound[champRound]?.[0] || null,
        ffRound: null,
        champRound,
      }
    }

    if (!ffRound) return null

    const ffMatchups = [...(byRound[ffRound] || [])].sort((a, b) => a.position - b.position)

    // Determine which FF matchup goes on which side by checking which E8 regions feed into it
    // E8 matchups sorted by position pair into FF: [0,1] → FF[0], [2,3] → FF[1]
    const lastRegRound = facingLayout.regionalRounds[facingLayout.regionalRounds.length - 1]
    const e8 = [...(byRound[lastRegRound] || [])].sort((a, b) => a.position - b.position)
    const ff0Regions = [e8[0]?.region, e8[1]?.region].filter(Boolean)

    // Check if FF[0]'s feeder regions overlap with the left side
    const leftSet = new Set(facingLayout.left)
    const ff0IsLeft = ff0Regions.some((r) => leftSet.has(r))

    return {
      ffLeft: ff0IsLeft ? ffMatchups[0] : ffMatchups[1],
      ffRight: ff0IsLeft ? ffMatchups[1] : ffMatchups[0],
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

  // Gap-aware grid helpers for facing layout
  // 2 regions per side (NCAA): spacer row between the two regions
  // 1 region per side (NBA): no spacer needed
  const regionsPerSide = facingLayout ? facingLayout.left.length : 1
  const perRegionCount = regionsPerSide > 1 ? halfR1Count / regionsPerSide : halfR1Count
  const facingGridTemplate = regionsPerSide > 1
    ? `repeat(${perRegionCount}, minmax(100px, 1fr)) 20px repeat(${perRegionCount}, minmax(100px, 1fr))`
    : `repeat(${halfR1Count}, minmax(100px, 1fr))`

  function facingGridRow(idx, span) {
    if (regionsPerSide <= 1) {
      // No gap — simple grid row
      return `${idx * span + 1} / span ${span}`
    }
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

  // Build set of eliminated team names from picks
  // Includes teams from incorrect picks (lost their game) and explicitly eliminated downstream picks
  const eliminatedTeams = useMemo(() => {
    const set = new Set()
    for (const p of picks || []) {
      if (p.is_eliminated || p.is_correct === false) set.add(p.picked_team)
    }
    return set
  }, [picks])

  const hasPicks = picks && picks.length > 0
  const showRegionTabs = regions && regions.length >= 2

  // ── Helper: render a matchup card with resolved data ──

  function renderCard(matchup, size, mirrored = false) {
    const resolved = resolvedMatchups?.[matchup.id]
    const dm = resolved
      ? {
          ...matchup,
          team_top: 'team_top' in resolved ? resolved.team_top : matchup.team_top,
          team_bottom: 'team_bottom' in resolved ? resolved.team_bottom : matchup.team_bottom,
          seed_top: 'seed_top' in resolved ? resolved.seed_top : matchup.seed_top,
          seed_bottom: 'seed_bottom' in resolved ? resolved.seed_bottom : matchup.seed_bottom,
        }
      : matchup

    return (
      <MatchupCard
        matchup={dm}
        pick={pickMap[matchup.template_matchup_id]?.team}
        pickData={pickMap[matchup.template_matchup_id]}
        eliminated={pickMap[matchup.template_matchup_id]?.eliminated}
        eliminatedTeams={eliminatedTeams}
        showPick={hasPicks}
        onTap={onMatchupTap}
        size={size}
        playInPickResults={playInPickResults}
        isBestOf7={isBestOf7}
        sportKey={sportKey}
        mirrored={mirrored}
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
        <div className="grid gap-y-2" style={{ gridTemplateRows: gridTemplate }}>
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
          <table className="mb-3 mx-auto"><tbody>
            <tr><td className="text-center text-xs font-semibold text-text-secondary whitespace-nowrap">{getRoundName(roundNum)}</td></tr>
            <tr><td className="text-center text-xs text-text-muted whitespace-nowrap">{getRoundPoints(roundNum)} pts</td></tr>
          </tbody></table>
          <div
            className="grid gap-y-2"
            style={{ gridTemplateRows: facingGridTemplate }}
          >
            {matchupsList.map((matchup, idx) => (
              <div
                key={matchup.id}
                className="flex items-center"
                style={{ gridRow: facingGridRow(idx, span) }}
              >
                {renderCard(matchup, 'default', mirrored)}
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

    // Merge-to-center connector (last regional round → center)
    // If the last regional round has only 1 matchup per side (e.g. semifinals
    // in a 2-conference bracket), draw a straight line instead of a fork.
    const lastRegRound = regionalRounds[regionalRounds.length - 1]
    const lastRoundCount = (halfByRound[lastRegRound] || []).length
    const fullSpanRow = (_, __) => '1 / -1'

    if (lastRoundCount <= 1) {
      // Straight horizontal line
      const lineConn = (
        <div key={`${side}-merge`} className="flex flex-col">
          <div className="text-xs font-semibold mb-1 invisible">&nbsp;</div>
          <div className="text-[10px] mb-3 invisible">&nbsp;</div>
          <div className="grid gap-y-2" style={{ gridTemplateRows: facingGridTemplate }}>
            <div style={{ gridRow: '1 / -1' }} className="flex items-center">
              <div className="w-6 h-px bg-border/70" />
            </div>
          </div>
        </div>
      )
      if (mirrored) {
        elements.unshift(lineConn)
      } else {
        elements.push(lineConn)
      }
    } else {
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
          className="grid gap-y-2"
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
          className="grid gap-y-2"
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

      <div ref={ref} className="overflow-x-auto">
        {useFacing ? (
          /* ── Facing bracket layout ── */
          <div className="relative flex min-w-max py-2">
            {!isBestOf7 && (
              <img
                src="/ncaa-bracket-ball.png"
                alt=""
                className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[calc(100%+3rem)] w-[500px] h-auto opacity-50 pointer-events-none z-0"
              />
            )}
            <div className="relative z-10 flex min-w-max w-full">
              {renderBracketHalf(facingLayout.left, false, 'left')}
              {centerMatchups.ffLeft && renderCenterMatchup(centerMatchups.ffLeft, 'lg', centerMatchups.ffRound)}
              {centerMatchups.championship && renderCenterLine()}
              {centerMatchups.championship &&
                renderCenterMatchup(centerMatchups.championship, 'xl', centerMatchups.champRound)}
              {centerMatchups.championship && renderCenterLine()}
              {centerMatchups.ffRight && renderCenterMatchup(centerMatchups.ffRight, 'lg', centerMatchups.ffRound)}
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
                      className="grid gap-y-2"
                      style={{
                        gridTemplateRows: `repeat(${firstRoundCount}, minmax(100px, 1fr))`,
                      }}
                    >
                      {matchupsList.map((matchup, idx) => {
                        const resolved = resolvedMatchups?.[matchup.id]
                        const displayMatchup = resolved
                          ? {
                              ...matchup,
                              team_top: 'team_top' in resolved ? resolved.team_top : matchup.team_top,
                              team_bottom: 'team_bottom' in resolved ? resolved.team_bottom : matchup.team_bottom,
                              seed_top: 'seed_top' in resolved ? resolved.seed_top : matchup.seed_top,
                              seed_bottom: 'seed_bottom' in resolved ? resolved.seed_bottom : matchup.seed_bottom,
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
                              eliminatedTeams={eliminatedTeams}
                              showPick={hasPicks}
                              onTap={onMatchupTap}
                              size={cardSize}
                              playInPickResults={playInPickResults}
                              isBestOf7={isBestOf7}
                              sportKey={sportKey}
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
                        className="grid gap-y-2"
                        style={{
                          gridTemplateRows: `repeat(${firstRoundCount}, minmax(100px, 1fr))`,
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
})

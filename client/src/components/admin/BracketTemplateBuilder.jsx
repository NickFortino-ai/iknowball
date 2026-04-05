import { useState, useRef, useEffect } from 'react'
import {
  useBracketTemplate,
  useCreateBracketTemplate,
  useUpdateBracketTemplate,
  useSaveBracketTemplateMatchups,
  useTeamsForSport,
} from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'

function TeamAutocomplete({ value, onChange, placeholder, disabled, teams }) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const strip = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '')
  const filtered = (teams || []).filter((t) =>
    strip(t).includes(strip(filter || value || ''))
  )

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={value || ''}
        onChange={(e) => {
          onChange(e.target.value)
          setFilter(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
      />
      {open && !disabled && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-bg-card border border-border rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {filtered.slice(0, 20).map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(t)
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-text-primary hover:bg-bg-card-hover truncate"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SPORT_OPTIONS = [
  { value: 'americanfootball_nfl', label: 'NFL' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'baseball_mlb', label: 'MLB' },
  { value: 'basketball_ncaab', label: 'NCAAB' },
  { value: 'basketball_wncaab', label: 'WNCAAB' },
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
  { value: 'icehockey_nhl', label: 'NHL' },
]

const TEAM_COUNT_OPTIONS = [4, 8, 16, 32, 64, 68]

function generateRounds(teamCount) {
  if (teamCount === 68) {
    return [
      { round_number: 0, name: 'First Four', points_per_correct: 5 },
      { round_number: 1, name: 'Round of 64', points_per_correct: 10 },
      { round_number: 2, name: 'Round of 32', points_per_correct: 20 },
      { round_number: 3, name: 'Sweet 16', points_per_correct: 40 },
      { round_number: 4, name: 'Elite 8', points_per_correct: 80 },
      { round_number: 5, name: 'Final Four', points_per_correct: 160 },
      { round_number: 6, name: 'Championship', points_per_correct: 320 },
    ]
  }

  const numRounds = Math.log2(teamCount)
  const defaultNames = {
    1: 'Round 1',
    2: 'Round 2',
    3: 'Sweet 16',
    4: 'Elite 8',
    5: 'Final Four',
    6: 'Championship',
  }
  const rounds = []
  for (let i = 1; i <= numRounds; i++) {
    let name = defaultNames[numRounds - i + 1] || `Round ${i}`
    if (teamCount === 64) {
      if (i === 1) name = 'Round of 64'
      else if (i === 2) name = 'Round of 32'
      else if (i === 3) name = 'Sweet 16'
      else if (i === 4) name = 'Elite 8'
      else if (i === 5) name = 'Final Four'
      else if (i === 6) name = 'Championship'
    } else if (teamCount <= 16) {
      if (i === numRounds) name = 'Championship'
      else if (i === numRounds - 1) name = 'Semifinals'
      else name = `Round ${i}`
    }
    rounds.push({
      round_number: i,
      name,
      points_per_correct: Math.pow(2, i - 1) * 10,
    })
  }
  return rounds
}

// Official NCAA bracket seed order for 16-team regions (top to bottom):
// 1v16, 8v9, 5v12, 4v13, 6v11, 3v14, 7v10, 2v15
// This ensures correct convergence: (1/16 vs 8/9), (5/12 vs 4/13), etc.
const NCAA_BRACKET_SEEDS_16 = [
  [1, 16], [8, 9], [5, 12], [4, 13],
  [6, 11], [3, 14], [7, 10], [2, 15],
]

function generateMatchups(teamCount, regions, rounds) {
  const effectiveTeamCount = teamCount === 68 ? 64 : teamCount
  const matchups = []
  // For 68 teams, rounds includes round 0 (First Four) — only generate matchups for rounds 1+
  const matchupRounds = rounds.filter((r) => r.round_number >= 1)
  const numRounds = matchupRounds.length
  let position = 0

  // Matchups per region per round
  const hasRegions = regions && regions.length > 0
  const regionsToUse = hasRegions ? regions : [null]
  const teamsPerRegion = effectiveTeamCount / regionsToUse.length
  const matchupsPerRegionR1 = teamsPerRegion / 2

  // Generate round 1 matchups per region using NCAA bracket seed order
  const seedPairs = teamsPerRegion === 16
    ? NCAA_BRACKET_SEEDS_16
    : Array.from({ length: matchupsPerRegionR1 }, (_, m) => [m + 1, teamsPerRegion - m])

  for (const region of regionsToUse) {
    for (let m = 0; m < matchupsPerRegionR1; m++) {
      matchups.push({
        round_number: 1,
        position: position++,
        region,
        seed_top: seedPairs[m][0],
        seed_bottom: seedPairs[m][1],
        team_top: '',
        team_bottom: '',
        is_bye: false,
        feeds_into_round: 2,
        feeds_into_position: null, // calculated below
        feeds_into_slot: null,
      })
    }
  }

  // Generate subsequent rounds
  for (let r = 2; r <= numRounds; r++) {
    const prevRoundMatchups = matchups.filter((m) => m.round_number === r - 1)

    // If we're in the final rounds and had regions, matchups merge
    if (r <= Math.log2(teamsPerRegion)) {
      // Still within region rounds
      for (const region of regionsToUse) {
        const regionPrev = prevRoundMatchups.filter((m) => m.region === region)
        for (let m = 0; m < regionPrev.length / 2; m++) {
          const currentPos = position++
          matchups.push({
            round_number: r,
            position: currentPos,
            region,
            seed_top: null,
            seed_bottom: null,
            team_top: null,
            team_bottom: null,
            is_bye: false,
            feeds_into_round: r < numRounds ? r + 1 : null,
            feeds_into_position: null,
            feeds_into_slot: null,
          })
        }
      }
    } else {
      // Cross-region rounds
      const prevCount = prevRoundMatchups.length
      for (let m = 0; m < prevCount / 2; m++) {
        matchups.push({
          round_number: r,
          position: position++,
          region: null,
          seed_top: null,
          seed_bottom: null,
          team_top: null,
          team_bottom: null,
          is_bye: false,
          feeds_into_round: r < numRounds ? r + 1 : null,
          feeds_into_position: null,
          feeds_into_slot: null,
        })
      }
    }
  }

  // Calculate feeds_into links
  for (let r = 1; r < numRounds; r++) {
    const currentRound = matchups.filter((m) => m.round_number === r)
    const nextRound = matchups.filter((m) => m.round_number === r + 1)

    // Group current round by region for within-region progression
    if (r < Math.log2(teamsPerRegion) || !hasRegions) {
      // Simple pairing: matchup 0,1 -> next 0, matchup 2,3 -> next 1, etc.
      for (let i = 0; i < currentRound.length; i++) {
        const nextIdx = Math.floor(i / 2)
        if (nextIdx < nextRound.length) {
          currentRound[i].feeds_into_position = nextRound[nextIdx].position
          currentRound[i].feeds_into_round = r + 1
          currentRound[i].feeds_into_slot = i % 2 === 0 ? 'top' : 'bottom'
        }
      }
    } else {
      // Cross-region: pair regions up
      for (let i = 0; i < currentRound.length; i++) {
        const nextIdx = Math.floor(i / 2)
        if (nextIdx < nextRound.length) {
          currentRound[i].feeds_into_position = nextRound[nextIdx].position
          currentRound[i].feeds_into_round = r + 1
          currentRound[i].feeds_into_slot = i % 2 === 0 ? 'top' : 'bottom'
        }
      }
    }
  }

  return matchups
}

export default function BracketTemplateBuilder({ templateId, onClose }) {
  const { data: existing, isLoading } = useBracketTemplate(templateId)
  const createTemplate = useCreateBracketTemplate()
  const updateTemplate = useUpdateBracketTemplate()
  const saveMatchups = useSaveBracketTemplateMatchups()
  const [sport, setSport] = useState(existing?.sport || '')
  const { data: apiTeams } = useTeamsForSport(sport)

  const [step, setStep] = useState(1)
  const [name, setName] = useState(existing?.name || '')
  const [teamCount, setTeamCount] = useState(existing?.team_count || 64)
  const [description, setDescription] = useState(existing?.description || '')
  const [regions, setRegions] = useState(existing?.regions || [])
  const [picksAvailableAt, setPicksAvailableAt] = useState(() => {
    if (existing?.picks_available_at) {
      // Convert ISO to datetime-local format
      const d = new Date(existing.picks_available_at)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    return ''
  })
  const [seriesFormat, setSeriesFormat] = useState(existing?.series_format || 'single_elimination')
  const [regionInput, setRegionInput] = useState('')
  const [rounds, setRounds] = useState(() => {
    if (existing?.rounds?.length) return existing.rounds
    return generateRounds(64)
  })
  const [matchups, setMatchups] = useState(() => {
    if (existing?.matchups?.length) {
      const idLookup = {}
      for (const m of existing.matchups) idLookup[m.id] = { round_number: m.round_number, position: m.position }
      return existing.matchups.filter((m) => m.round_number >= 1).map((m) => {
        const target = m.feeds_into_matchup_id ? idLookup[m.feeds_into_matchup_id] : null
        return { ...m, feeds_into_round: target?.round_number ?? null, feeds_into_position: target?.position ?? null, feeds_into_slot: m.feeds_into_slot || null }
      })
    }
    return []
  })
  const [savedTemplateId, setSavedTemplateId] = useState(templateId)

  // Sync state when existing template data loads (useState initializers run before async fetch completes)
  useEffect(() => {
    if (!existing) return
    setSport(existing.sport || '')
    setSeriesFormat(existing.series_format || 'single_elimination')
    setName(existing.name || '')
    setTeamCount(existing.team_count || 64)
    setDescription(existing.description || '')
    setRegions(existing.regions || [])
    if (existing.picks_available_at) {
      const d = new Date(existing.picks_available_at)
      setPicksAvailableAt(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
    if (existing.rounds?.length) setRounds(existing.rounds)
    if (existing.matchups?.length) {
      const round0 = existing.matchups.filter((m) => m.round_number === 0)
      const rest = existing.matchups.filter((m) => m.round_number >= 1)

      // Build id→{round_number, position} lookup to convert feeds_into_matchup_id back to round/position
      const idLookup = {}
      for (const m of existing.matchups) {
        idLookup[m.id] = { round_number: m.round_number, position: m.position }
      }

      setMatchups(rest.map((m) => {
        const target = m.feeds_into_matchup_id ? idLookup[m.feeds_into_matchup_id] : null
        return {
          ...m,
          feeds_into_round: target?.round_number ?? null,
          feeds_into_position: target?.position ?? null,
          feeds_into_slot: m.feeds_into_slot || null,
        }
      }))

      // Restore play-in slots from round 0 matchups
      if (round0.length > 0) {
        const restored = {}
        for (const pi of round0) {
          // Find the round 1 matchup index this play-in feeds into (server returns feeds_into_matchup_id UUID)
          const r1Idx = rest.findIndex(
            (m) => m.id === pi.feeds_into_matchup_id
          )
          if (r1Idx >= 0 && pi.feeds_into_slot) {
            restored[`${r1Idx}-${pi.feeds_into_slot}`] = {
              team1: pi.team_top || '',
              team2: pi.team_bottom || '',
            }
          }
        }
        setPlayInSlots(restored)
      }
    }
    setStep(existing.matchups?.length ? 3 : 1)
  }, [existing])

  // Play-in slots for 68-team brackets: key = `${matchupIdx}-${'top'|'bottom'}`, value = { team1, team2 }
  const [playInSlots, setPlayInSlots] = useState({})
  const playInCount = Object.keys(playInSlots).length
  const [saved, setSaved] = useState(false)

  function togglePlayIn(idx, slot) {
    const key = `${idx}-${slot}`
    setSaved(false)
    setPlayInSlots((prev) => {
      const next = { ...prev }
      if (next[key]) {
        delete next[key]
      } else {
        next[key] = { team1: '', team2: '' }
        // Clear the team on the Round 1 matchup when toggling on
        const updated = [...matchups]
        updated[idx] = { ...updated[idx], [slot === 'top' ? 'team_top' : 'team_bottom']: '' }
        setMatchups(updated)
      }
      return next
    })
  }

  function updatePlayInTeam(key, field, value) {
    setSaved(false)
    setPlayInSlots((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  function handleAddRegion() {
    if (regionInput.trim() && !regions.includes(regionInput.trim())) {
      setRegions([...regions, regionInput.trim()])
      setRegionInput('')
    }
  }

  function handleRemoveRegion(idx) {
    setRegions(regions.filter((_, i) => i !== idx))
  }

  function handleGenerateMatchups() {
    // Build seed→team lookup from existing matchups so teams auto-fill after reorder
    const seedTeamMap = {}
    for (const m of matchups) {
      if (m.region && m.seed_top && m.team_top) {
        seedTeamMap[`${m.region}-${m.seed_top}`] = m.team_top
      }
      if (m.region && m.seed_bottom && m.team_bottom) {
        seedTeamMap[`${m.region}-${m.seed_bottom}`] = m.team_bottom
      }
    }

    const generated = generateMatchups(teamCount, regions, rounds)

    // Re-populate team names from seed mapping
    if (Object.keys(seedTeamMap).length > 0) {
      for (const m of generated) {
        if (m.region && m.seed_top && seedTeamMap[`${m.region}-${m.seed_top}`]) {
          m.team_top = seedTeamMap[`${m.region}-${m.seed_top}`]
        }
        if (m.region && m.seed_bottom && seedTeamMap[`${m.region}-${m.seed_bottom}`]) {
          m.team_bottom = seedTeamMap[`${m.region}-${m.seed_bottom}`]
        }
      }
    }

    setMatchups(generated)
    setPlayInSlots({})
    setStep(3)
  }

  function updateMatchupTeam(idx, field, value) {
    setSaved(false)
    const next = [...matchups]
    next[idx] = { ...next[idx], [field]: value }
    setMatchups(next)
  }

  function toggleBye(idx) {
    setSaved(false)
    const next = [...matchups]
    next[idx] = { ...next[idx], is_bye: !next[idx].is_bye }
    setMatchups(next)
  }

  async function handleSaveTemplate() {
    try {
      let id = savedTemplateId
      if (!id) {
        const template = await createTemplate.mutateAsync({
          name,
          sport,
          team_count: teamCount,
          description: description || undefined,
          rounds,
          regions: regions.length > 0 ? regions : undefined,
          picks_available_at: picksAvailableAt ? new Date(picksAvailableAt).toISOString() : null,
          series_format: seriesFormat,
        })
        id = template.id
        setSavedTemplateId(id)
      } else {
        await updateTemplate.mutateAsync({
          templateId: id,
          name,
          sport,
          team_count: teamCount,
          description: description || undefined,
          rounds,
          regions: regions.length > 0 ? regions : undefined,
          picks_available_at: picksAvailableAt ? new Date(picksAvailableAt).toISOString() : null,
          series_format: seriesFormat,
        })
      }
      toast('Template saved!', 'success')
      return id
    } catch (err) {
      toast(err.message || 'Failed to save template', 'error')
      return null
    }
  }

  async function handleSaveMatchups() {
    // Validate play-in count for 68-team brackets (only for new templates, not edits)
    const hasAnyTeams = matchups.some((m) => m.team_top || m.team_bottom)
    if (teamCount === 68 && hasAnyTeams && playInCount !== 4 && !savedTemplateId) {
      toast(`Must assign exactly 4 play-in games (currently ${playInCount})`, 'error')
      return
    }

    let id = savedTemplateId
    if (!id) {
      id = await handleSaveTemplate()
      if (!id) return
    }

    // Build final matchups array, injecting Round 0 play-in matchups
    let allMatchups = [...matchups]

    if (teamCount === 68) {
      let playInPosition = 0
      for (const [key, teams] of Object.entries(playInSlots)) {
        const [idxStr, slot] = key.split('-')
        const idx = parseInt(idxStr)
        const targetMatchup = allMatchups[idx]

        // Clear the play-in slot on the Round 1 matchup (will be filled by winner)
        targetMatchup[slot === 'top' ? 'team_top' : 'team_bottom'] = null

        // Create Round 0 matchup
        allMatchups.push({
          round_number: 0,
          position: playInPosition++,
          region: targetMatchup.region,
          seed_top: targetMatchup[slot === 'top' ? 'seed_top' : 'seed_bottom'],
          seed_bottom: targetMatchup[slot === 'top' ? 'seed_top' : 'seed_bottom'],
          team_top: teams.team1,
          team_bottom: teams.team2,
          is_bye: false,
          feeds_into_round: 1,
          feeds_into_position: targetMatchup.position,
          feeds_into_slot: slot,
        })
      }
    }

    try {
      await saveMatchups.mutateAsync({ templateId: id, matchups: allMatchups })
      toast('Matchups saved!', 'success')
      setSaved(true)
    } catch (err) {
      toast(err.message || 'Failed to save matchups', 'error')
    }
  }

  if (templateId && isLoading) return <LoadingSpinner />

  const round1Matchups = matchups.filter((m) => m.round_number === 1)
  const groupedByRegion = {}
  for (const m of round1Matchups) {
    const key = m.region || 'Main'
    if (!groupedByRegion[key]) groupedByRegion[key] = []
    groupedByRegion[key].push(m)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl">{templateId ? 'Edit Template' : 'New Template'}</h2>
        <button onClick={onClose} className="text-xs text-text-muted hover:text-text-secondary">
          Back to List
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1 mb-6">
        {[1, 2, 3].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              step === s ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {s === 1 ? 'Details' : s === 2 ? 'Rounds' : 'Teams'}
          </button>
        ))}
      </div>

      {/* Step 1: Basic details */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Template Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2026 March Madness"
              maxLength={100}
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Sport</label>
            <div className="flex gap-2 flex-wrap">
              {SPORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSport(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    sport === opt.value
                      ? 'bg-accent text-white'
                      : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Team Count</label>
            <div className="flex gap-2">
              {TEAM_COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => {
                    setTeamCount(n)
                    if (!templateId) setRounds(generateRounds(n))
                  }}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    teamCount === n
                      ? 'bg-accent text-white'
                      : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Description</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Series Format</label>
            <div className="flex gap-2">
              {[{ value: 'single_elimination', label: 'Single Elimination' }, { value: 'best_of_7', label: 'Best of 7' }].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSeriesFormat(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    seriesFormat === opt.value
                      ? 'bg-accent text-white'
                      : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {seriesFormat === 'best_of_7' && (
              <div className="text-[10px] text-text-muted mt-1">
                Users will predict series length (4-7 games) per matchup. Bonus: +2 exact, +1 one-off.
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">
              Picks Available At <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <input
              type="datetime-local"
              value={picksAvailableAt}
              onChange={(e) => setPicksAvailableAt(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
            />
            <div className="text-[10px] text-text-muted mt-1">
              When can users start making picks? Leave blank if picks should be available immediately.
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">
              Regions <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRegion())}
                placeholder="e.g. South"
                className="flex-1 bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
              <button
                onClick={handleAddRegion}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover"
              >
                Add
              </button>
            </div>
            <div className="flex gap-1 flex-wrap">
              {regions.map((r, i) => (
                <span
                  key={r}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData('text/plain', i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const from = parseInt(e.dataTransfer.getData('text/plain'))
                    if (isNaN(from) || from < 0 || from >= regions.length || from === i) return
                    const next = [...regions]
                    const [moved] = next.splice(from, 1)
                    next.splice(i, 0, moved)
                    setRegions(next)
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent/20 text-accent text-xs font-semibold cursor-grab active:cursor-grabbing select-none"
                >
                  {r}
                  <button onClick={() => handleRemoveRegion(i)} className="hover:text-incorrect">x</button>
                </span>
              ))}
            </div>
            {regions.length > 1 && (
              <div className="text-[10px] text-text-muted mt-1">
                Drag to reorder — regions 1 &amp; 2 pair in the Final Four, as do 3 &amp; 4
              </div>
            )}
          </div>

          <button
            onClick={() => setStep(2)}
            disabled={!name || !sport || !teamCount}
            className="w-full py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next: Rounds
          </button>
        </div>
      )}

      {/* Step 2: Rounds */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="text-sm text-text-muted mb-2">
            Configure round names and point values. Rounds auto-generated from {teamCount} teams.
          </div>
          {rounds.map((round, i) => (
            <div key={round.round_number} className="bg-bg-card rounded-xl border border-border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Round Name</label>
                  <input
                    type="text"
                    value={round.name}
                    onChange={(e) => {
                      const next = [...rounds]
                      next[i] = { ...next[i], name: e.target.value }
                      setRounds(next)
                    }}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-text-muted mb-1">Points per Correct</label>
                  <input
                    type="number"
                    value={round.points_per_correct}
                    onChange={(e) => {
                      const next = [...rounds]
                      next[i] = { ...next[i], points_per_correct: parseInt(e.target.value, 10) || 0 }
                      setRounds(next)
                    }}
                    min={0}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary text-center focus:outline-none focus:border-accent"
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleGenerateMatchups}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Next: Teams
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Teams & Seeds */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="text-sm text-text-muted mb-2">
            Enter Round 1 teams and seeds. Later rounds auto-populate from bracket structure.
          </div>

          {teamCount === 68 && (
            <div className={`text-sm font-semibold text-center py-2 rounded-lg ${
              playInCount === 4 ? 'bg-correct/20 text-correct' : 'bg-accent/20 text-accent'
            }`}>
              {playInCount}/4 play-in games assigned
            </div>
          )}

          {Object.entries(groupedByRegion).map(([regionName, regionMatchups]) => (
            <div key={regionName}>
              {regions.length > 0 && (
                <h3 className="font-display text-sm text-accent mb-2">{regionName}</h3>
              )}
              <div className="space-y-2">
                {regionMatchups.map((m) => {
                  const idx = matchups.indexOf(m)
                  const topPlayInKey = `${idx}-top`
                  const bottomPlayInKey = `${idx}-bottom`
                  const topIsPlayIn = !!playInSlots[topPlayInKey]
                  const bottomIsPlayIn = !!playInSlots[bottomPlayInKey]

                  return (
                    <div key={idx} className="bg-bg-card rounded-xl border border-border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <label className="flex items-center gap-1 text-[10px] text-text-muted">
                          <input
                            type="checkbox"
                            checked={m.is_bye}
                            onChange={() => toggleBye(idx)}
                            className="rounded"
                          />
                          Bye
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {/* Top team slot */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] text-text-muted">#{m.seed_top} seed</span>
                            {teamCount === 68 && !m.is_bye && (
                              <button
                                type="button"
                                onClick={() => togglePlayIn(idx, 'top')}
                                className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${
                                  topIsPlayIn
                                    ? 'bg-accent text-white'
                                    : 'bg-bg-input text-text-muted hover:text-text-secondary'
                                }`}
                              >
                                Play-in
                              </button>
                            )}
                          </div>
                          {topIsPlayIn ? (
                            <div className="space-y-1">
                              <TeamAutocomplete
                                value={playInSlots[topPlayInKey]?.team1 || ''}
                                onChange={(val) => updatePlayInTeam(topPlayInKey, 'team1', val)}
                                placeholder="Play-in team 1"
                                teams={apiTeams}
                              />
                              <div className="text-[9px] text-text-muted text-center">vs</div>
                              <TeamAutocomplete
                                value={playInSlots[topPlayInKey]?.team2 || ''}
                                onChange={(val) => updatePlayInTeam(topPlayInKey, 'team2', val)}
                                placeholder="Play-in team 2"
                                teams={apiTeams}
                              />
                            </div>
                          ) : (
                            <TeamAutocomplete
                              value={m.team_top || ''}
                              onChange={(val) => updateMatchupTeam(idx, 'team_top', val)}
                              placeholder="Team name"
                              teams={apiTeams}
                            />
                          )}
                        </div>
                        {/* Bottom team slot */}
                        <div>
                          <div className="flex items-center gap-1 mb-1">
                            <span className="text-[10px] text-text-muted">#{m.seed_bottom} seed</span>
                            {teamCount === 68 && !m.is_bye && (
                              <button
                                type="button"
                                onClick={() => togglePlayIn(idx, 'bottom')}
                                className={`ml-auto text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${
                                  bottomIsPlayIn
                                    ? 'bg-accent text-white'
                                    : 'bg-bg-input text-text-muted hover:text-text-secondary'
                                }`}
                              >
                                Play-in
                              </button>
                            )}
                          </div>
                          {bottomIsPlayIn ? (
                            <div className="space-y-1">
                              <TeamAutocomplete
                                value={playInSlots[bottomPlayInKey]?.team1 || ''}
                                onChange={(val) => updatePlayInTeam(bottomPlayInKey, 'team1', val)}
                                placeholder="Play-in team 1"
                                teams={apiTeams}
                              />
                              <div className="text-[9px] text-text-muted text-center">vs</div>
                              <TeamAutocomplete
                                value={playInSlots[bottomPlayInKey]?.team2 || ''}
                                onChange={(val) => updatePlayInTeam(bottomPlayInKey, 'team2', val)}
                                placeholder="Play-in team 2"
                                teams={apiTeams}
                              />
                            </div>
                          ) : (
                            <TeamAutocomplete
                              value={m.team_bottom || ''}
                              onChange={(val) => updateMatchupTeam(idx, 'team_bottom', val)}
                              placeholder={m.is_bye ? '(bye)' : 'Team name'}
                              disabled={m.is_bye}
                              teams={apiTeams}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="space-y-2">
            <button
              onClick={handleGenerateMatchups}
              className="w-full py-2 rounded-xl text-sm bg-bg-card text-text-secondary hover:bg-bg-card-hover border border-border transition-colors"
            >
              Regenerate Bracket (NCAA seed order)
            </button>
            <div className="flex gap-2">
              <button
                onClick={() => setStep(2)}
                className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleSaveMatchups}
                disabled={saved || saveMatchups.isPending || createTemplate.isPending}
                className={`flex-1 py-3 rounded-xl font-display text-lg transition-colors disabled:opacity-50 ${
                  saved ? 'bg-correct text-white' : 'bg-accent text-white hover:bg-accent-hover'
                }`}
              >
                {saveMatchups.isPending ? 'Saving...' : saved ? 'Saved \u2713' : 'Save Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

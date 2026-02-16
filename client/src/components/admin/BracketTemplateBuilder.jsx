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

  const filtered = (teams || []).filter((t) =>
    t.toLowerCase().includes((filter || value || '').toLowerCase())
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
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
]

const TEAM_COUNT_OPTIONS = [4, 8, 16, 32, 64]

function generateRounds(teamCount) {
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

function generateMatchups(teamCount, regions, rounds) {
  const matchups = []
  const numRounds = rounds.length
  let position = 0

  // Matchups per region per round
  const hasRegions = regions && regions.length > 0
  const regionsToUse = hasRegions ? regions : [null]
  const teamsPerRegion = teamCount / regionsToUse.length
  const matchupsPerRegionR1 = teamsPerRegion / 2

  // Generate round 1 matchups per region
  for (const region of regionsToUse) {
    for (let m = 0; m < matchupsPerRegionR1; m++) {
      const seedTop = m + 1
      const seedBottom = teamsPerRegion - m
      matchups.push({
        round_number: 1,
        position: position++,
        region,
        seed_top: seedTop,
        seed_bottom: seedBottom,
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
  const [regionInput, setRegionInput] = useState('')
  const [rounds, setRounds] = useState(() => {
    if (existing?.rounds?.length) return existing.rounds
    return generateRounds(64)
  })
  const [matchups, setMatchups] = useState(() => {
    if (existing?.matchups?.length) {
      return existing.matchups.map((m) => ({
        ...m,
        feeds_into_round: null,
        feeds_into_position: null,
        feeds_into_slot: null,
      }))
    }
    return []
  })
  const [savedTemplateId, setSavedTemplateId] = useState(templateId)

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
    const generated = generateMatchups(teamCount, regions, rounds)
    setMatchups(generated)
    setStep(3)
  }

  function updateMatchupTeam(idx, field, value) {
    const next = [...matchups]
    next[idx] = { ...next[idx], [field]: value }
    setMatchups(next)
  }

  function toggleBye(idx) {
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
    let id = savedTemplateId
    if (!id) {
      id = await handleSaveTemplate()
      if (!id) return
    }

    try {
      await saveMatchups.mutateAsync({ templateId: id, matchups })
      toast('Matchups saved!', 'success')
      onClose()
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
                  key={i}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-accent/20 text-accent text-xs font-semibold"
                >
                  {r}
                  <button onClick={() => handleRemoveRegion(i)} className="hover:text-incorrect">x</button>
                </span>
              ))}
            </div>
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

          {Object.entries(groupedByRegion).map(([regionName, regionMatchups]) => (
            <div key={regionName}>
              {regions.length > 0 && (
                <h3 className="font-display text-sm text-accent mb-2">{regionName}</h3>
              )}
              <div className="space-y-2">
                {regionMatchups.map((m) => {
                  const idx = matchups.indexOf(m)
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
                        <div>
                          <div className="text-[10px] text-text-muted mb-1">
                            #{m.seed_top} seed
                          </div>
                          <TeamAutocomplete
                            value={m.team_top || ''}
                            onChange={(val) => updateMatchupTeam(idx, 'team_top', val)}
                            placeholder="Team name"
                            teams={apiTeams}
                          />
                        </div>
                        <div>
                          <div className="text-[10px] text-text-muted mb-1">
                            #{m.seed_bottom} seed
                          </div>
                          <TeamAutocomplete
                            value={m.team_bottom || ''}
                            onChange={(val) => updateMatchupTeam(idx, 'team_bottom', val)}
                            placeholder={m.is_bye ? '(bye)' : 'Team name'}
                            disabled={m.is_bye}
                            teams={apiTeams}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSaveMatchups}
              disabled={saveMatchups.isPending || createTemplate.isPending}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {saveMatchups.isPending ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

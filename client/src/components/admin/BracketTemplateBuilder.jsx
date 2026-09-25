import { useState, useRef, useEffect, useMemo } from 'react'
import {
  useBracketTemplate,
  useCreateBracketTemplate,
  useUpdateBracketTemplate,
  useSaveBracketTemplateMatchups,
  useTeamsForSport,
} from '../../hooks/useAdmin'
import LoadingSpinner from '../ui/LoadingSpinner'
import { toast } from '../ui/Toast'
import { supabase } from '../../lib/supabase'
import BracketDisplay from '../leagues/BracketDisplay'
import { isKnownCountry } from '../../lib/countryFlag'

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
  { value: 'soccer_usa_mls', label: 'MLS' },
  { value: 'soccer_world_cup', label: 'World Cup' },
  { value: 'americanfootball_ufl', label: 'UFL' },
]


// What each league's postseason actually looks like, so picking a sport fills
// in the shape instead of the admin having to know that MLB is 12 teams with
// two byes per league or that the NCAA tournament is 68.
//
// Applied ONLY when creating a new template and only until the admin touches
// a field — never when editing an existing one, where these values are
// already whatever was chosen and must not be reset underneath them.
//
// `seriesFormat` here is just the fallback for rounds that declare no
// best_of; generateRounds fills per-round lengths where they differ (MLB).
const SPORT_BRACKET_PRESETS = {
  // Region ORDER matters — it decides which half of the bracket renders on
  // which side — so these mirror the templates that actually shipped rather
  // than being retyped from memory. Verified against bracket_templates
  // 2026-09-23.
  basketball_nba:    { teamCount: 16, seriesFormat: 'best_of_7',          regions: ['Western Conference', 'Eastern Conference'] },
  icehockey_nhl:     { teamCount: 16, seriesFormat: 'best_of_7',          regions: ['Western', 'Eastern'] },
  basketball_ncaab:  { teamCount: 68, seriesFormat: 'single_elimination', regions: ['East', 'South', 'West', 'Midwest'] },
  basketball_wncaab: { teamCount: 68, seriesFormat: 'single_elimination', regions: ['Regional 1', 'Regional 4', 'Regional 2', 'Regional 3'] },
  // College Football Playoff: 12 teams, byes for the top FOUR on overall
  // ranking (not on being a conference champion), and NO reseeding — teams
  // advance along fixed paths. Confirmed 2026-09-23.
  americanfootball_ncaaf: {
    teamCount: 12,
    seriesFormat: 'single_elimination',
    regions: [],
    rounds: [
      { round_number: 1, name: 'First Round', points_per_correct: 10 },
      { round_number: 2, name: 'Quarterfinals', points_per_correct: 20 },
      { round_number: 3, name: 'Semifinals', points_per_correct: 40 },
      { round_number: 4, name: 'National Championship', points_per_correct: 80 },
    ],
    buildMatchups: generateNcaaf12Matchups,
  },
  soccer_world_cup:  { teamCount: 32, seriesFormat: 'single_elimination', regions: ['Side 1', 'Side 2'] },
  americanfootball_ufl: { teamCount: 4, seriesFormat: 'single_elimination', regions: [] },
  // MLB is the one new entry. Verified against MLB.com's format page: 12
  // teams, byes for the 1 and 2 seeds, 3v6 and 4v5, no reseeding.
  // generateRounds(12) supplies the per-round best_of (3/5/7/7).
  // Rounds live on the preset rather than only inside generateRounds(12), so
  // the tile can say "best of 3/5/7" instead of falling back to the
  // template-level flag and claiming best-of-7 throughout — which is the
  // exact misconception the per-round work exists to prevent.
  baseball_mlb: {
    teamCount: 12,
    seriesFormat: 'best_of_7',
    regions: ['American League', 'National League'],
    rounds: [
      { round_number: 1, name: 'Wild Card', best_of: 3, points_per_correct: 10 },
      { round_number: 2, name: 'Division Series', best_of: 5, points_per_correct: 20 },
      { round_number: 3, name: 'League Championship Series', best_of: 7, points_per_correct: 40 },
      { round_number: 4, name: 'World Series', best_of: 7, points_per_correct: 80 },
    ],
    buildMatchups: generateMlb12Matchups,
  },
  // WNBA: eight teams seeded 1-8 LEAGUE-WIDE, not by conference, so no
  // regions. No byes, and a plain power-of-two bracket — BRACKET_SEEDS_8
  // already pairs it 1/8, 4/5, 3/6, 2/7. The only thing that isn't generic
  // is the round lengths, which climb 3 -> 5 -> 7. Confirmed against the
  // WNBA postseason format page 2026-09-23.
  basketball_wnba: {
    teamCount: 8,
    seriesFormat: 'best_of_7',
    regions: [],
    rounds: [
      { round_number: 1, name: 'First Round', best_of: 3, points_per_correct: 10 },
      { round_number: 2, name: 'Semifinals', best_of: 5, points_per_correct: 20 },
      { round_number: 3, name: 'WNBA Finals', best_of: 7, points_per_correct: 40 },
    ],
  },

  // NFL: 14 teams, 7 per conference, only the 1 seed on a bye. Round 2
  // carries `reseed` — the 1 seed plays the lowest remaining seed, which no
  // static wire can express. See docs/nfl-bracket-reseeding-design.md.
  americanfootball_nfl: {
    teamCount: 14,
    seriesFormat: 'single_elimination',
    regions: ['AFC', 'NFC'],
    rounds: [
      { round_number: 1, name: 'Wild Card', points_per_correct: 10 },
      { round_number: 2, name: 'Divisional', points_per_correct: 20, reseed: true },
      { round_number: 3, name: 'Conference Championship', points_per_correct: 40 },
      { round_number: 4, name: 'Super Bowl', points_per_correct: 80 },
    ],
    buildMatchups: generateNfl14Matchups,
  },

  //
  // It falls through to the generic generator, which is the existing
  // behaviour. Added once the format is confirmed.
}

const TEAM_COUNT_OPTIONS = [4, 8, 12, 14, 16, 32, 64, 68]

function generateRounds(teamCount) {
  // 12 is MLB's postseason and it is not a power of two: two byes per league,
  // and four rounds of three different series lengths. Math.log2(12) is 3.58,
  // so the generic path below would build THREE rounds and drop one entirely.
  // best_of is filled in here so the per-round lengths are right without
  // anyone having to know them.
  if (teamCount === 12) {
    return [
      { round_number: 1, name: 'Wild Card', best_of: 3, points_per_correct: 10 },
      { round_number: 2, name: 'Division Series', best_of: 5, points_per_correct: 20 },
      { round_number: 3, name: 'League Championship Series', best_of: 7, points_per_correct: 40 },
      { round_number: 4, name: 'World Series', best_of: 7, points_per_correct: 80 },
    ]
  }
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

// Standard bracket seed order for 8-team conferences (NHL, NBA):
// 1v8, 4v5, 3v6, 2v7
// Top half: 1v8 winner meets 4v5 winner. Bottom half: 3v6 winner meets 2v7 winner.
// Seeds 1 and 2 are on opposite sides, meeting only in the conference finals.
const BRACKET_SEEDS_8 = [
  [1, 8], [4, 5], [3, 6], [2, 7],
]

// Standard bracket seed order for 4-team brackets:
// 1v4, 2v3 — seeds 1 and 2 on opposite sides
const BRACKET_SEEDS_4 = [
  [1, 4], [2, 3],
]

// MLB's 12-team bracket, wired explicitly.
//
// The generic generator halves a power of two each round, which cannot express
// byes — and MLB's whole shape is the 1 and 2 seeds skipping the Wild Card.
// MLB also does NOT reseed, so the wiring is fixed from the start and can be
// written down rather than recomputed as rounds resolve.
//
// The pairing that matters: the 4/5 winner meets the 1 seed and the 3/6 winner
// meets the 2 seed. That is what keeps the 1 seed from drawing another
// division winner in the Division Series. Backwards here would not surface
// until teams started advancing into the wrong slots.
function generateMlb12Matchups(regions) {
  const [al, nl] = regions?.length >= 2 ? regions : ['American League', 'National League']
  const m = (round_number, position, region, seed_top, seed_bottom, feeds_into_position, feeds_into_slot) => ({
    round_number, position, region,
    seed_top, seed_bottom,
    team_top: '', team_bottom: '',
    is_bye: false,
    feeds_into_round: round_number + 1,
    feeds_into_position,
    feeds_into_slot,
  })
  return [
    // Wild Card — only seeds 3-6 play
    m(1, 0, al, 3, 6, 1, 'bottom'),   // -> AL 2 seed
    m(1, 1, al, 4, 5, 0, 'bottom'),   // -> AL 1 seed
    m(1, 2, nl, 3, 6, 3, 'bottom'),   // -> NL 2 seed
    m(1, 3, nl, 4, 5, 2, 'bottom'),   // -> NL 1 seed
    // Division Series — the bye seeds sit on top, the Wild Card winner fills below
    m(2, 0, al, 1, null, 0, 'top'),
    m(2, 1, al, 2, null, 0, 'bottom'),
    m(2, 2, nl, 1, null, 1, 'top'),
    m(2, 3, nl, 2, null, 1, 'bottom'),
    // LCS
    m(3, 0, al, null, null, 0, 'top'),
    m(3, 1, nl, null, null, 0, 'bottom'),
    // World Series
    { round_number: 4, position: 0, region: null, seed_top: null, seed_bottom: null,
      team_top: '', team_bottom: '', is_bye: false,
      feeds_into_round: null, feeds_into_position: null, feeds_into_slot: null },
  ]
}


// The NFL's 14-team bracket. 13 matchups, one bye per conference.
//
// Only the 1 seed rests — that changed in 2020 when the field went to seven
// per conference. Wild Card is 2v7, 3v6, 4v5.
//
// Round 2 carries `reseed`, and that is the whole reason this can't be a
// generic bracket: the NFL reseeds, so the 1 seed plays the LOWEST remaining
// seed. The Wild Card matchups therefore have NO feeds_into wiring — there is
// no fixed answer to where their winner goes. The server and the picker both
// pair that round from the survivor set instead.
//
// From the Divisional round on there is no choice left (two teams per
// conference), so those wires are static again.
function generateNfl14Matchups(regions) {
  const [afc, nfc] = regions?.length >= 2 ? regions : ['AFC', 'NFC']
  const out = []
  let position = 0
  const conf = [afc, nfc]

  // Wild Card — seeds 2-7 play, 3 per conference. No feeds_into: reseeded.
  for (const region of conf) {
    for (const [st, sb] of [[2, 7], [3, 6], [4, 5]]) {
      out.push({
        round_number: 1, position: position++, region,
        seed_top: st, seed_bottom: sb, team_top: '', team_bottom: '',
        is_bye: false, feeds_into_round: null, feeds_into_position: null, feeds_into_slot: null,
      })
    }
  }

  // Divisional — 2 per conference. The 1 seed is seated here from the start;
  // his opponent, and the other pairing, are filled by the reseed.
  position = 0
  for (let c = 0; c < conf.length; c++) {
    // matchup 0 of each conference holds the bye seed
    out.push({
      round_number: 2, position: position++, region: conf[c],
      seed_top: 1, seed_bottom: null, team_top: '', team_bottom: '',
      is_bye: false, feeds_into_round: 3, feeds_into_position: c, feeds_into_slot: 'top',
    })
    out.push({
      round_number: 2, position: position++, region: conf[c],
      seed_top: null, seed_bottom: null, team_top: '', team_bottom: '',
      is_bye: false, feeds_into_round: 3, feeds_into_position: c, feeds_into_slot: 'bottom',
    })
  }

  // Conference Championships
  position = 0
  for (let c = 0; c < conf.length; c++) {
    out.push({
      round_number: 3, position: position++, region: conf[c],
      seed_top: null, seed_bottom: null, team_top: '', team_bottom: '',
      is_bye: false, feeds_into_round: 4, feeds_into_position: 0,
      feeds_into_slot: c === 0 ? 'top' : 'bottom',
    })
  }

  // Super Bowl
  out.push({
    round_number: 4, position: 0, region: null,
    seed_top: null, seed_bottom: null, team_top: '', team_bottom: '',
    is_bye: false, feeds_into_round: null, feeds_into_position: null, feeds_into_slot: null,
  })
  return out
}


// The College Football Playoff. 12 teams, single elimination, byes for the
// top FOUR — awarded on overall ranking, not on being a conference champion.
//
// Also 12 teams with 4 byes, exactly like MLB, which is why the generator
// cannot be keyed on team count. It is chosen by SPORT via the preset's
// buildMatchups.
//
// No reseeding: teams advance along fixed paths, so every wire is static.
// One national bracket, no regions.
//
//   R1   5v12  6v11  7v10  8v9
//   QF   1 v (8/9)   2 v (7/10)   3 v (6/11)   4 v (5/12)
//   SF   QF(1) v QF(4)   and   QF(2) v QF(3)   — so 1 and 2 can only meet
//        in the final, which is what the bracket is for.
function generateNcaaf12Matchups() {
  const m = (round_number, position, seed_top, seed_bottom, feeds_into_position, feeds_into_slot) => ({
    round_number, position, region: null,
    seed_top, seed_bottom, team_top: '', team_bottom: '',
    is_bye: false,
    feeds_into_round: feeds_into_position == null ? null : round_number + 1,
    feeds_into_position, feeds_into_slot,
  })
  return [
    // First round — the four byes sit out
    m(1, 0, 8, 9, 0, 'bottom'),    // -> faces the 1 seed
    m(1, 1, 7, 10, 1, 'bottom'),   // -> faces the 2 seed
    m(1, 2, 6, 11, 2, 'bottom'),   // -> faces the 3 seed
    m(1, 3, 5, 12, 3, 'bottom'),   // -> faces the 4 seed
    // Quarterfinals — bye seeds seated on top
    m(2, 0, 1, null, 0, 'top'),
    m(2, 1, 2, null, 1, 'top'),
    m(2, 2, 3, null, 1, 'bottom'),
    m(2, 3, 4, null, 0, 'bottom'),
    // Semifinals
    m(3, 0, null, null, 0, 'top'),
    m(3, 1, null, null, 0, 'bottom'),
    // National Championship
    m(4, 0, null, null, null, null),
  ]
}

function generateMatchups(teamCount, regions, rounds, sport) {
  // By SPORT first. MLB and the College Football Playoff are BOTH 12 teams
  // with four byes, so the team count cannot tell them apart.
  const build = SPORT_BRACKET_PRESETS[sport]?.buildMatchups
  if (build) return build(regions)
  if (teamCount === 14) return generateNfl14Matchups(regions)
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

  // Generate round 1 matchups per region using correct bracket seed order
  const seedPairs = teamsPerRegion === 16
    ? NCAA_BRACKET_SEEDS_16
    : teamsPerRegion === 8
      ? BRACKET_SEEDS_8
      : teamsPerRegion === 4
        ? BRACKET_SEEDS_4
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


// Reuses the props tiles' artwork in client/public/backdrops/props/. Only
// six exist; the rest fall back to a plain tile, which is what PropsSection
// does too.
//
// MLS is deliberately null: PropsSection references mls.jpg, which is NOT in
// that folder, so that tile's background is already broken. No sense
// repeating it here.
const SPORT_BACKDROPS = {
  americanfootball_nfl: 'nfl.jpg',
  basketball_nba: 'nba.webp',
  baseball_mlb: 'mlb.jpg',
  basketball_ncaab: 'ncaab.webp',
  americanfootball_ncaaf: 'ncaaf.jpg',
  basketball_wnba: 'wnba.jpg',
}


// Mirrors the bonus scaling in roundSeriesConfig (bracketService.js). The two
// must agree — this is what the admin is promised, that is what gets awarded.
//
// The bonus tracks how many outcomes are possible, because "exact" is a coin
// flip in a best-of-3 and a one-in-four call in a best-of-7. No consolation
// on a best-of-3: with two answers, "one off" IS the other answer.
function seriesBonus(bestOf) {
  if (!bestOf || bestOf <= 1) return { outcomes: 0, exact: 0, oneOff: 0 }
  const outcomes = bestOf - Math.ceil(bestOf / 2) + 1
  return { outcomes, exact: outcomes, oneOff: outcomes >= 3 ? Math.floor(outcomes / 2) : 0 }
}

// Big picture-led tile for choosing a sport, matching the props grid.
function SportTile({ option, onSelect }) {
  const backdrop = SPORT_BACKDROPS[option.value]
  const preset = SPORT_BRACKET_PRESETS[option.value]
  return (
    <button
      onClick={onSelect}
      className="relative overflow-hidden bg-bg-primary border border-text-primary/20 hover:border-accent rounded-2xl px-6 py-10 transition-all hover:scale-[1.02] hover:shadow-lg"
      style={backdrop ? {
        backgroundImage: `url(/backdrops/props/${backdrop})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      } : undefined}
    >
      {backdrop && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20 pointer-events-none" />
      )}
      <div className={`relative font-display text-3xl ${backdrop ? 'text-white drop-shadow-lg' : 'text-text-primary'}`}>
        {option.label}
      </div>
      {/* The shape that will be filled in, so the choice is informed rather
          than something to discover two steps later. */}
      {preset && (
        <div className={`relative mt-1 text-[11px] font-semibold ${backdrop ? 'text-white/80 drop-shadow' : 'text-text-muted'}`}>
          {preset.teamCount} teams
          {preset.rounds?.some((r) => r.best_of)
            ? ` · best of ${[...new Set(preset.rounds.filter((r) => r.best_of).map((r) => r.best_of))].join('/')}`
            : preset.seriesFormat === 'best_of_7' ? ' · best of 7' : ' · single elimination'}
        </div>
      )}
    </button>
  )
}

export default function BracketTemplateBuilder({ templateId, onClose }) {
  const { data: existing, isLoading } = useBracketTemplate(templateId)
  const createTemplate = useCreateBracketTemplate()
  const updateTemplate = useUpdateBracketTemplate()
  const saveMatchups = useSaveBracketTemplateMatchups()
  const [sport, setSport] = useState(existing?.sport || '')
  // Edits lock the sport since changing it would invalidate matchups +
  // teams. New templates always show the picker — the manager list
  // filter is a separate viewing concern and doesn't predict create intent.
  const sportLocked = !!templateId
  // Soccer World Cup halves don't have FIFA-issued names (unlike NBA
  // conferences or NCAA regions). Suppress the admin region-picker UI
  // and the user-facing region tabs. The bracket layout itself
  // communicates the two-half structure. See memory:
  // feedback_world_cup_no_half_names.
  const isWorldCup = sport === 'soccer_world_cup'
  const { data: apiTeams } = useTeamsForSport(sport)

  const [step, setStep] = useState(1)
  // Escape hatch: a preset states the sport's real shape, but nothing should
  // be unreachable if a one-off template needs a different one.
  const [customizeShape, setCustomizeShape] = useState(false)
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
  const [endsAt, setEndsAt] = useState(() => {
    if (existing?.ends_at) {
      const d = new Date(existing.ends_at)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    }
    return ''
  })
  const [seriesFormat, setSeriesFormat] = useState(existing?.series_format || 'single_elimination')
  const [bracketImage, setBracketImage] = useState(existing?.bracket_image || '')
  const [bracketImageX, setBracketImageX] = useState(existing?.bracket_image_x ?? 50)
  const [bracketImageY, setBracketImageY] = useState(existing?.bracket_image_y ?? 50)
  const [bracketImageScale, setBracketImageScale] = useState(existing?.bracket_image_scale ?? 1.0)
  const [bracketImageOpacity, setBracketImageOpacity] = useState(existing?.bracket_image_opacity ?? 0.4)
  const [bracketImagePosition, setBracketImagePosition] = useState(existing?.bracket_image_position || 'behind')
  const [uploadingImage, setUploadingImage] = useState(false)
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

  // World Cup auto-fills two unnamed halves so the matchup generator and
  // the facing left/right layout in BracketDisplay still work, but admin
  // never has to invent labels. Internal placeholders only — suppressed
  // in user UI by `isWorldCup` checks downstream.
  useEffect(() => {
    if (isWorldCup && regions.length === 0) {
      setRegions(['Side 1', 'Side 2'])
    }
  }, [isWorldCup])

  // Only when CREATING — an existing template's shape is whatever was saved.
  const activePreset = !templateId ? SPORT_BRACKET_PRESETS[sport] : null

  // Selecting a sport fills in that league's postseason shape. Extracted
  // because the tile grid and the inline sport list both do it.
  function chooseSport(value) {
    setSport(value)
    // Guarded on templateId, not on `existing` — a New Template has no id,
    // and that is the honest test for "am I creating". Editing a saved
    // template must never have its team count or regions reset underneath it.
    if (templateId) return
    const preset = SPORT_BRACKET_PRESETS[value]
    if (!preset) return
    setTeamCount(preset.teamCount)
    setSeriesFormat(preset.seriesFormat)
    setRegions(preset.regions)
    setRounds(preset.rounds ? preset.rounds.map((r) => ({ ...r })) : generateRounds(preset.teamCount))
  }

  // Set when the form has just been repopulated from the server, so the
  // "Saved" capture below knows the next render's values ARE what is stored.
  const justHydratedRef = useRef(false)

  // Sync state when existing template data loads (useState initializers run before async fetch completes)
  useEffect(() => {
    if (!existing) return
    justHydratedRef.current = true
    setSport(existing.sport || '')
    setSeriesFormat(existing.series_format || 'single_elimination')
    setName(existing.name || '')
    setTeamCount(existing.team_count || 64)
    setDescription(existing.description || '')
    setRegions(existing.regions || [])
    setBracketImage(existing.bracket_image || '')
    setBracketImageX(existing.bracket_image_x ?? 50)
    setBracketImageY(existing.bracket_image_y ?? 50)
    setBracketImageScale(existing.bracket_image_scale ?? 1.0)
    setBracketImageOpacity(existing.bracket_image_opacity ?? 0.4)
    setBracketImagePosition(existing.bracket_image_position || 'behind')
    if (existing.picks_available_at) {
      const d = new Date(existing.picks_available_at)
      setPicksAvailableAt(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
    }
    if (existing.ends_at) {
      const d = new Date(existing.ends_at)
      setEndsAt(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
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
  // "Saved ✓" must mean the form matches what is stored, so it is DERIVED
  // rather than a boolean each edit path has to remember to clear. The flag
  // it replaces was cleared in four places and missed two — Regenerate
  // Bracket, and every field on the Details/Rounds/Image steps (which this
  // same button persists via handleSaveTemplate). It only ever read honestly
  // because it started false on mount and nothing could turn it on early, so
  // opening an already-saved template showed a bright Save Template button.
  //
  // One signature over everything a save persists. It is captured at
  // hydration (what is on screen IS what is stored) and after each successful
  // save; any later edit changes the signature and the button lights back up.
  const signatureParts = [
    name, description, teamCount, regions, rounds, seriesFormat,
    picksAvailableAt, endsAt, bracketImage, bracketImageX, bracketImageY,
    bracketImageScale, bracketImageOpacity, bracketImagePosition,
    matchups, playInSlots,
  ]
  const formSignature = useMemo(() => JSON.stringify(signatureParts), signatureParts)

  const [savedSignature, setSavedSignature] = useState(null)
  const saved = savedSignature !== null && savedSignature === formSignature

  // The hydration effect sets a dozen pieces of state at once, and the
  // signature they produce is only observable on the NEXT render — so the
  // capture waits here rather than reading stale values inside that effect.
  useEffect(() => {
    if (!justHydratedRef.current) return
    justHydratedRef.current = false
    setSavedSignature(formSignature)
  }, [formSignature])

  function togglePlayIn(idx, slot) {
    const key = `${idx}-${slot}`
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
    setPlayInSlots((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: value },
    }))
  }

  async function handleImageUpload(file) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast('Please select an image file', 'error')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast('Image must be under 5 MB', 'error')
      return
    }
    setUploadingImage(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `${savedTemplateId || 'new'}-${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('bracket-images')
        .upload(path, file, { upsert: true, contentType: file.type })
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('bracket-images').getPublicUrl(path)
      setBracketImage(publicUrl)
      // Reset positioning to defaults on new upload
      setBracketImageX(50)
      setBracketImageY(50)
      setBracketImageScale(1.0)
      setBracketImageOpacity(0.4)
      toast('Image uploaded', 'success')
    } catch (err) {
      toast(err.message || 'Failed to upload image', 'error')
    } finally {
      setUploadingImage(false)
    }
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

    const generated = generateMatchups(teamCount, regions, rounds, sport)

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
          picks_available_at: picksAvailableAt ? new Date(picksAvailableAt).toISOString() : null,
          ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
          series_format: seriesFormat,
          bracket_image: bracketImage || null,
          bracket_image_x: bracketImageX,
          bracket_image_y: bracketImageY,
          bracket_image_scale: bracketImageScale,
          bracket_image_opacity: bracketImageOpacity,
          bracket_image_position: bracketImagePosition,
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
          ends_at: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
          series_format: seriesFormat,
          bracket_image: bracketImage || null,
          bracket_image_x: bracketImageX,
          bracket_image_y: bracketImageY,
          bracket_image_scale: bracketImageScale,
          bracket_image_opacity: bracketImageOpacity,
          bracket_image_position: bracketImagePosition,
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

    // World Cup country-name typo guard: flag fallback resolution + ESPN
    // team matching both depend on canonical FIFA names (e.g. "United States"
    // not "USA"). Block save if any team isn't in our recognized list — the
    // admin can fix the typo or hit Cancel to override if it's a legit name
    // we don't have mapped yet.
    if (sport === 'soccer_world_cup') {
      const round1 = matchups.filter((m) => m.round_number === 1)
      const unknowns = []
      for (const m of round1) {
        if (m.team_top && !isKnownCountry(m.team_top)) unknowns.push(m.team_top)
        if (m.team_bottom && !isKnownCountry(m.team_bottom)) unknowns.push(m.team_bottom)
      }
      if (unknowns.length > 0) {
        const proceed = confirm(`Unrecognized country name(s): ${unknowns.join(', ')}.\n\nThis will break flag rendering and may break ESPN scoring. Save anyway?`)
        if (!proceed) return
      }
    }

    // Always save template metadata first so any in-flight Details edits
    // (e.g. a renamed template) get persisted alongside the matchup save.
    // Without this, edit-mode users would have to use a separate button to
    // save the name and could lose changes when navigating away.
    const id = await handleSaveTemplate()
    if (!id) return

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
      // Recomputed here rather than reusing the memo: the 68-team play-in
      // branch above mutates matchup objects in place, and those objects are
      // shared with `matchups` state, so the memo from this render is already
      // stale. Stringifying now captures what was actually sent.
      setSavedSignature(JSON.stringify(signatureParts))
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
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-colors ${
              step === s ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {s === 1 ? 'Details' : s === 2 ? 'Rounds' : s === 3 ? 'Teams' : s === 4 ? 'Image' : 'Finalize'}
          </button>
        ))}
      </div>

      {/* Choosing the sport comes FIRST when creating. It decides team count,
          series format, regions and round lengths, so asking for a name and a
          description before it is asking about a shape that doesn't exist
          yet. Editing skips this — the sport is already set and locked. */}
      {step === 1 && !templateId && !sport && (
        <div>
          <h3 className="font-display text-xl text-text-primary mb-1">Which sport?</h3>
          <p className="text-sm text-text-muted mb-4">
            Picks the postseason shape for you — teams, rounds and series lengths.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {SPORT_OPTIONS.map((opt) => (
              <SportTile key={opt.value} option={opt} onSelect={() => chooseSport(opt.value)} />
            ))}
          </div>
        </div>
      )}

      {/* Step 1: Basic details */}
      {step === 1 && (templateId || sport) && (
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
            <label className="block text-sm font-semibold text-text-secondary mb-2">
              Sport{sportLocked && sport && (
                <span className="ml-2 text-xs font-normal text-text-muted">
                  · {SPORT_OPTIONS.find((o) => o.value === sport)?.label || sport}
                </span>
              )}
            </label>
            {sportLocked ? (
              <p className="text-xs text-text-muted">
                Sport is set from the filter you came in on. Cancel and switch the filter to change.
              </p>
            ) : (
              <div className="flex gap-2 flex-wrap">
                {SPORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      chooseSport(opt.value)
                    }}
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
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Team Count</label>
            {/* A sport with a preset has ONE right answer — MLB's postseason is
                12 teams, not a choice between 4 and 68. Offering the full grid
                invites a wrong pick and implies the others are valid. Shown as
                a fact, with Customize for anything unusual. */}
            {activePreset && !customizeShape ? (
              <div className="flex items-baseline gap-3">
                <span className="text-lg font-semibold text-text-primary">{teamCount} teams</span>
                <button
                  type="button"
                  onClick={() => setCustomizeShape(true)}
                  className="text-xs text-accent hover:underline"
                >
                  Customize
                </button>
              </div>
            ) : (
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
            )}
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
            {/* "Best of 7" is a lie for MLB — its rounds are 3, 5, 7, 7 — and
                this is the label someone reads before trusting the template.
                With a preset, describe the rounds as they actually are. */}
            {activePreset && !customizeShape ? (
              <div className="space-y-0.5">
                {(rounds || []).map((r) => {
                  const bo = r.best_of ?? (activePreset.seriesFormat === 'best_of_7' ? 7 : 1)
                  const b = seriesBonus(bo)
                  return (
                    <div key={r.round_number} className="text-sm text-text-primary">
                      {r.name}
                      <span className="text-text-muted">
                        {' · '}{bo > 1 ? `best of ${bo}` : 'single game'}
                        {b.exact > 0 && ` · length bonus +${b.exact}${b.oneOff ? ` / +${b.oneOff}` : ''}`}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
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
            )}
            {/* Length options differ per round once best_of does, so a flat
                "4-7 games" understates a best-of-3 round. */}
            {(activePreset ? (rounds || []).some((r) => (r.best_of ?? 0) > 1 || activePreset.seriesFormat === 'best_of_7') : seriesFormat === 'best_of_7') && (
              <div className="text-[10px] text-text-muted mt-1">
                Users predict how many games each series goes. The bonus scales with
                how many outcomes are possible — exact / one game off — so a best-of-3
                coin flip is worth less than calling a best-of-7.
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

          {/* Tournament Ends removed. It only ever defaulted leagues.ends_at
              so a card could show a run window — it never gated anything, and
              completeLeagues.js deliberately finishes bracket leagues on the
              championship result regardless of it. Bracket cards now read
              "Runs through the playoffs", which is both honest (a best-of-
              seven can end four days apart) and needs no date. endsAt is
              still SENT as null so existing templates that carry one are not
              silently rewritten on save. */}

          {/* Hidden entirely when the sport has no regions. The WNBA seeds
              1-8 LEAGUE-WIDE, so asking an admin to name conferences invites
              a wrong answer — filling in two would split an 8-team field into
              two groups of four and produce the wrong pairings. Same
              reasoning as team count and series format: the sport already
              answers it. Customize brings the editor back. */}
          {activePreset && !customizeShape && activePreset.regions.length === 0 ? null : (
          <div className={isWorldCup ? 'hidden' : ''}>
            <label className="block text-sm font-semibold text-text-secondary mb-2">
              Conferences/Regions <span className="text-text-muted font-normal">(optional)</span>
            </label>
            {activePreset && !customizeShape && activePreset.regions.length > 0 && (
              <div className="text-xs text-text-muted -mt-1 mb-2">
                Set from the {SPORT_OPTIONS.find((o) => o.value === sport)?.label || sport} postseason. Order decides which half renders on which side.
              </div>
            )}
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
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-accent text-sm font-semibold cursor-grab active:cursor-grabbing select-none"
                >
                  {r}
                  <button onClick={() => handleRemoveRegion(i)} className="hover:text-incorrect">x</button>
                </span>
              ))}
            </div>
            {regions.length > 1 && (
              <div className="text-[10px] text-text-muted mt-1">
                Drag to reorder — regions 1 &amp; 2 pair in the semifinals, as do 3 &amp; 4
              </div>
            )}
          </div>
          )}

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
              <div className="grid grid-cols-3 gap-3">
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
                <div>
                  {/* Per-round series length. Needed because MLB is not one
                      length throughout: best-of-3 Wild Card, best-of-5
                      Division Series, best-of-7 from the LCS. Blank falls back
                      to the template-level format, which is what every
                      existing NBA / NHL / World Cup template relies on. */}
                  <label className="block text-[10px] text-text-muted mb-1">
                    Best of <span className="opacity-60">· blank = template default</span>
                  </label>
                  <select
                    value={round.best_of ?? ''}
                    onChange={(e) => {
                      const next = [...rounds]
                      const v = e.target.value
                      if (v === '') delete next[i].best_of
                      else next[i] = { ...next[i], best_of: parseInt(v, 10) }
                      setRounds([...next])
                    }}
                    className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
                  >
                    <option value="">Default</option>
                    <option value="1">1 — single game</option>
                    <option value="3">3 — clinch at 2</option>
                    <option value="5">5 — clinch at 3</option>
                    <option value="7">7 — clinch at 4</option>
                  </select>
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
      {step === 3 && (() => {
        // Detect if matchups are stale relative to the configured regions
        // (e.g. user added regions after the matchups were first generated).
        const matchupRegions = new Set(matchups.map((m) => m.region).filter(Boolean))
        const configuredRegions = new Set(regions)
        const regionsMismatch = (
          matchupRegions.size !== configuredRegions.size ||
          [...configuredRegions].some((r) => !matchupRegions.has(r))
        )
        return (
        <div className="space-y-4">
          <div className="text-sm text-text-muted mb-2">
            Enter Round 1 teams and seeds. Later rounds auto-populate from bracket structure.
          </div>

          {regionsMismatch && regions.length > 0 && (
            <div className="rounded-lg border border-yellow-500/40 bg-yellow-500/10 p-3 text-sm text-yellow-300 flex items-center justify-between gap-3">
              <span>Regions changed — regenerate to apply <b>{regions.join(', ')}</b> seeding.</span>
              <button
                type="button"
                onClick={handleGenerateMatchups}
                className="px-3 py-1.5 rounded-lg bg-yellow-500 text-bg-primary text-xs font-semibold hover:bg-yellow-400 transition-colors shrink-0"
              >
                Regenerate
              </button>
            </div>
          )}

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
                            {m.seed_top != null && (
                              <span className="text-[10px] text-text-muted">#{m.seed_top} seed</span>
                            )}
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
                            {m.seed_bottom != null && (
                              <span className="text-[10px] text-text-muted">#{m.seed_bottom} seed</span>
                            )}
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
              Regenerate Bracket (standard seed order)
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
              <button
                onClick={() => setStep(4)}
                className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
              >
                Next: Image
              </button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Step 4: Bracket Image (optional centerpiece) */}
      {step === 4 && (
        <div className="space-y-4">
          <div className="text-sm text-text-muted mb-2">
            Optional: upload a centerpiece image that appears on the bracket. Drag it inside the preview to position, and use the sliders to scale and adjust opacity.
          </div>

          {/* Upload */}
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Bracket Image</label>
            <div className="flex gap-2 items-center">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload(e.target.files?.[0])}
                disabled={uploadingImage}
                className="flex-1 text-xs text-text-muted file:mr-3 file:px-3 file:py-2 file:rounded-lg file:border-0 file:bg-accent file:text-white file:font-semibold file:cursor-pointer file:hover:bg-accent-hover"
              />
              {bracketImage && (
                <button
                  type="button"
                  onClick={() => setBracketImage('')}
                  className="px-3 py-2 rounded-lg text-xs font-semibold bg-bg-card text-text-secondary hover:bg-incorrect/20 hover:text-incorrect transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
            {uploadingImage && <div className="text-xs text-text-muted mt-1">Uploading…</div>}
          </div>

          {/* Position toggle */}
          {bracketImage && (
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Layer</label>
              <div className="flex gap-2">
                {[
                  { value: 'behind', label: 'Behind bracket' },
                  { value: 'above_finals', label: 'Above championship slot' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setBracketImagePosition(opt.value)}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      bracketImagePosition === opt.value
                        ? 'bg-accent text-white'
                        : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live preview with drag-to-position */}
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Preview</label>
            <BracketImagePreview
              imageUrl={bracketImage}
              x={bracketImageX}
              y={bracketImageY}
              scale={bracketImageScale}
              opacity={bracketImageOpacity}
              position={bracketImagePosition}
              onPositionChange={(x, y) => { setBracketImageX(x); setBracketImageY(y) }}
            />
          </div>

          {bracketImage && (
            <>
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-2">
                  Scale <span className="text-text-muted font-normal">{bracketImageScale.toFixed(2)}x</span>
                </label>
                <input
                  type="range"
                  min={0.3}
                  max={3}
                  step={0.05}
                  value={bracketImageScale}
                  onChange={(e) => setBracketImageScale(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-2">
                  Opacity <span className="text-text-muted font-normal">{Math.round(bracketImageOpacity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={bracketImageOpacity}
                  onChange={(e) => setBracketImageOpacity(parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            </>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(3)}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={() => setStep(5)}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              Next: Finalize
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Preview — visual verification of the full bracket graph
          before saving. Reuses the user-facing BracketDisplay component so
          the admin sees exactly what users will see. */}
      {step === 5 && (
        <div className="space-y-4">
          <div className="text-xs text-text-muted mb-2">
            Verify the bracket structure looks right — matchup placement,
            team assignments, seeds, and round connections — then save. After
            saving, any league using this template will see the same layout.
          </div>
          {matchups.length === 0 ? (
            <div className="text-center text-text-muted text-sm py-12 border border-text-primary/10 rounded-lg">
              No matchups yet. Go back to Step 3 (Teams) and fill them in.
            </div>
          ) : (
            <div className="relative border border-text-primary/10 rounded-lg p-2">
              {/* The image is passed THROUGH to BracketDisplay rather than
                  overlaid here, matching what BracketView now does. It has to
                  stay that way: x/y are anchored to the bracket's own scroll
                  width, so an overlay positioned against this panel instead
                  would put the centerpiece somewhere the live page won't, and
                  the admin would be tuning against a lie. */}
              <BracketDisplay
                matchups={matchups}
                picks={[]}
                rounds={rounds}
                regions={regions}
                seriesFormat={seriesFormat}
                sportKey={sport}
                backdrop={bracketImage ? {
                  url: bracketImage,
                  x: bracketImageX,
                  y: bracketImageY,
                  scale: bracketImageScale,
                  opacity: bracketImageOpacity,
                  position: bracketImagePosition,
                } : null}
                containerized
              />
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(4)}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-bg-card text-text-secondary hover:bg-bg-card-hover transition-colors"
            >
              Back
            </button>
            <button
              onClick={handleSaveTemplate}
              disabled={createTemplate.isPending || updateTemplate.isPending}
              className="flex-1 py-3 rounded-xl font-display text-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
            >
              {createTemplate.isPending || updateTemplate.isPending ? 'Saving...' : 'Save Template'}
            </button>
          </div>

          {/* Publish Now — sets picks_available_at to current time. Server's
              existing publish-detection logic in updateTemplate fans out
              push notifications to every league member of every league
              using this template when the boundary is crossed. Idempotent
              against double-click: a second flip with an already-past
              picks_available_at won't refire the notification. */}
          {(() => {
            const isAlreadyPublished = existing?.picks_available_at &&
              new Date(existing.picks_available_at) <= new Date()
            return (
              <div className="pt-3 border-t border-text-primary/10">
                <button
                  onClick={async () => {
                    if (!savedTemplateId) return
                    if (!confirm('Publish bracket now and notify every league member using this template? This cannot be undone.')) return
                    try {
                      await updateTemplate.mutateAsync({
                        templateId: savedTemplateId,
                        picks_available_at: new Date().toISOString(),
                      })
                      toast('Bracket published — notifications sent', 'success')
                    } catch (err) {
                      toast(err.message || 'Failed to publish', 'error')
                    }
                  }}
                  disabled={!savedTemplateId || isAlreadyPublished || updateTemplate.isPending}
                  className="w-full py-3 rounded-xl font-display text-lg bg-correct text-white hover:bg-correct/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isAlreadyPublished ? 'Already Published' : updateTemplate.isPending ? 'Publishing...' : 'Publish Now & Notify Members'}
                </button>
                {!savedTemplateId && (
                  <div className="text-[10px] text-text-muted text-center mt-1.5">
                    Save the template first to enable publish.
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      )}
    </div>
  )
}

function BracketImagePreview({ imageUrl, x, y, scale, opacity, position, onPositionChange }) {
  const containerRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handlePointerDown(e) {
    if (!imageUrl) return
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function handlePointerMove(e) {
    if (!dragging || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const newX = ((e.clientX - rect.left) / rect.width) * 100
    const newY = ((e.clientY - rect.top) / rect.height) * 100
    onPositionChange(Math.max(0, Math.min(100, newX)), Math.max(0, Math.min(100, newY)))
  }
  function handlePointerUp(e) {
    setDragging(false)
    e.currentTarget.releasePointerCapture(e.pointerId)
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className={`relative w-full aspect-[16/10] rounded-xl border border-border bg-bg-primary overflow-hidden ${imageUrl ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      {/* Mock bracket layout — sits at z-10 so the image toggle is
          meaningful (image z=1 sits behind, image z=20 sits above). */}
      <div className="absolute inset-0 p-3 flex items-center justify-between" style={{ zIndex: 10 }}>
        <div className="space-y-2">
          {[1,2,3,4].map((i) => <div key={i} className="w-16 h-3 rounded bg-bg-card border border-border" />)}
        </div>
        <div className="space-y-2">
          {[1,2].map((i) => <div key={i} className="w-16 h-3 rounded bg-bg-card border border-border" />)}
        </div>
        <div className="w-20 h-4 rounded bg-accent/30 border border-accent" />
        <div className="space-y-2">
          {[1,2].map((i) => <div key={i} className="w-16 h-3 rounded bg-bg-card border border-border" />)}
        </div>
        <div className="space-y-2">
          {[1,2,3,4].map((i) => <div key={i} className="w-16 h-3 rounded bg-bg-card border border-border" />)}
        </div>
      </div>

      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          draggable={false}
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: `${y}%`,
            transform: `translate(-50%, -50%) scale(${scale})`,
            opacity,
            maxWidth: '60%',
            maxHeight: '80%',
            zIndex: position === 'above_finals' ? 20 : 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        />
      )}

      {!imageUrl && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-text-muted">
          Upload an image to preview it on the bracket
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useCreateLeague, useBracketTemplatesActive, useLeagueBackdrops, useNflSeasonOpener } from '../hooks/useLeagues'
import { useTeamsForSport } from '../hooks/useHotTakes'
import { api } from '../lib/api'
import { getBackdropUrl } from '../lib/backdropUrl'
import { useGames } from '../hooks/useGames'
import { toast } from '../components/ui/Toast'
import ScoringRulesEditor from '../components/leagues/ScoringRulesEditor'
import RosterSettingsEditor, { DEFAULT_ROSTER_SLOTS } from '../components/leagues/RosterSettingsEditor'
import { getSeasonEndDate, isSeasonUnderway, getNflWeekEnd, arePlayoffsUnderway, getFullSeasonLeagueEndDate, getPlayoffsButtonLabel, getPlayoffsHelperText } from '../lib/seasonDates'
import { todaySportsDay, tomorrowSportsDay } from '../lib/sportsDay'

// Winner-only tiered bonus (scaledWinnerBonus on server) — shared across
// NBA DFS, MLB DFS, HR Derby, TD Pass, Bracket, and Survivor.
const WINNER_BONUS_COLUMNS = [
  { key: 'size', label: 'League Size', align: 'left' },
  { key: 'winner', label: 'Winner Bonus', align: 'center', color: 'text-correct' },
]
const WINNER_BONUS_ROWS = [
  { size: '5 or fewer', winner: '+20' },
  { size: '6–10', winner: '+30' },
  { size: '11–15', winner: '+40' },
  { size: '16–30', winner: '+60' },
  { size: '31–40', winner: '+85' },
  { size: '41+', winner: '+110' },
]

// Survivor pools resolve in a few weeks (never a full NBA/MLB season worth
// of nightly attention), so they use the original pre-bump tiers.
const SURVIVOR_BONUS_ROWS = [
  { size: '5 or fewer', winner: '+10' },
  { size: '6–10', winner: '+20' },
  { size: '11–15', winner: '+30' },
  { size: '16–30', winner: '+50' },
  { size: '31–40', winner: '+75' },
  { size: '41+', winner: '+100' },
]

const FORMAT_OPTIONS = [
  {
    value: 'fantasy',
    label: 'Fantasy Football',
    description: 'Traditional draft leagues or weekly salary cap — set lineups and compete head-to-head',
    details: `Two flavors: Traditional season-long with a snake draft, head-to-head matchups, waivers, trades, and an end-of-season playoff bracket — or Weekly Salary Cap, where you build a fresh lineup every week under a budget with no draft and no roster carryover. There's also a single-week mode for one-and-done contests.

When the season ends, your final position converts to global IKB points using the position formula on top of a top-3 bonus structure.

Salary cap leagues generate a League Report at the end with most played player, pick of the year, best value plays, worst investments, and league-wide awards.

Commissioner controls: scoring format (PPR, half-PPR, standard, or fully custom per-stat), roster configuration (or salary cap amount), team count, draft date and pick timer, waiver system (priority, rolling, or FAAB with starting budget), trade review method, playoff team count, playoff start week, and championship week. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Traditional Fantasy Bonus Structure',
      intro: `Traditional fantasy leagues require effort and intelligence to win. We honor that with an appropriate point-bonus structure for winning leagues. Traditional fantasy football with people who pay attention, try, and have a deep understanding of the sport, is a serious competition of strategy and knowledge. Winning a league is genuinely respectable as a life achievement — I know that may sound silly... but only to people who have never won a serious league. It's a legitimate brain test, doused in dramatic unpredictability and luck of course. But to be in the mix year in and year out, and to win championships against serious fantasy football players bestows major credibility upon a person. I can only win a serious league if and only if I KNOW BALL. To honor the feat of winning a fantasy football league, we offer the following bonus structure.`,
      rows: [
        { size: '6 teams', first: '+50', second: '+20', third: '+10' },
        { size: '8 teams', first: '+75', second: '+30', third: '+15' },
        { size: '10 teams', first: '+90', second: '+36', third: '+18' },
        { size: '12 teams', first: '+120', second: '+48', third: '+24' },
        { size: '14 teams', first: '+165', second: '+66', third: '+33' },
        { size: '16 teams', first: '+195', second: '+78', third: '+39' },
        { size: '20 teams', first: '+225', second: '+90', third: '+45' },
      ],
    },
    bonusTable2: {
      title: 'Salary Cap Bonus Structure (Full Season, Week 1 Start)',
      rows: [
        { size: '6 members', first: '+35', second: '+14', third: '+7' },
        { size: '8 members', first: '+60', second: '+24', third: '+12' },
        { size: '10 members', first: '+75', second: '+30', third: '+15' },
        { size: '12 members', first: '+90', second: '+36', third: '+18' },
        { size: '14 members', first: '+105', second: '+42', third: '+21' },
        { size: '16 members', first: '+120', second: '+48', third: '+24' },
        { size: '20 members', first: '+150', second: '+60', third: '+30' },
      ],
      footnote: 'Salary cap leagues that start mid-season use the same shape but prorated by weeks played. Single-week leagues (one-and-done) use position-ranked scoring with a winner bonus — the winner takes home members × 2, the bottom half earns negative points.',
    },
  },
  {
    value: 'nba_dfs',
    label: 'NBA Daily Fantasy',
    description: 'Build a nightly NBA lineup under a salary cap and compete for the highest score',
    details: `Build a nightly 9-man NBA lineup (PG, PG, SG, SG, SF, SF, PF, PF, C) under a salary cap. Players are priced using a weighted algorithm that factors in recent performance and opponent defensive strength — so salaries shift nightly based on matchups and form. Scoring follows DraftKings-style NBA rules. Your league tracks wins across every night of the duration.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~180-night NBA regular season.

At the end of the season, the league generates a League Report — a full breakdown of every member's season including most played player, pick of the year, best value plays, worst investments, and league-wide awards for top scorer, most rostered player, and the most contrarian hit of the season.

Commissioner controls: salary cap, team count, league duration, and lineup lock time. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'NBA DFS Winner Bonus (Full Season, ~180 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~180 in a full NBA season). A 90-night league earns 50% of the bonus; a 30-night league earns about 17%. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'wnba_dfs',
    label: 'WNBA Daily Fantasy',
    description: 'Build a nightly WNBA lineup under a salary cap and compete for the highest score',
    details: `Build a nightly 9-player WNBA lineup (G, G, F, F, C, UTIL, UTIL, UTIL, UTIL) under a salary cap. Players are priced using a weighted algorithm that factors in recent performance and opponent defensive strength — so salaries shift nightly based on matchups and form. Scoring follows DraftKings-style WNBA rules. Your league tracks wins across every night of the duration.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~120-night WNBA regular season.

At the end of the season, the league generates a League Report — a full breakdown of every member's season including most played player, pick of the year, best value plays, worst investments, and league-wide awards for top scorer, most rostered player, and the most contrarian hit of the season.

Commissioner controls: salary cap, team count, league duration, and lineup lock time. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'WNBA DFS Winner Bonus (Full Season, ~120 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~120 in a full WNBA season). A 60-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'mlb_dfs',
    label: 'MLB Daily Fantasy',
    description: 'Build a daily MLB lineup under a salary cap — scored on hits, HRs, RBIs, runs, and more',
    details: `Build a daily 10-man MLB lineup (SP, C, 1B, 2B, SS, 3B, OF, OF, OF, UTIL) under a salary cap. Scored on hits, home runs, RBIs, runs, stolen bases, and walks. Player pricing uses recent game logs and opponent pitching and defensive strength. Compete each night with your league across the full slate.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~180-night MLB regular season.

At the end of the season, the league generates a League Report — a full breakdown of every member's season including most played player, pick of the year, best value plays, worst investments, and league-wide awards for top scorer, most rostered player, and the most contrarian hit of the season.

Commissioner controls: salary cap, team count, league duration, lineup lock time. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'MLB DFS Winner Bonus (Full Season, ~180 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~180 in a full MLB season). A 90-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'strikeouts',
    label: 'Strikeouts Contest',
    description: 'Pick 3 pitchers per day — score points for every strikeout they throw',
    details: `Pick up to 3 MLB pitchers each day you think will rack up strikeouts. By default, each pitcher can only be used once per week — commissioners can flip that to unlimited. Total strikeouts determine standings; ties share rank. Just like HR Derby — no salaries, no lineups. Just: who's gonna deal tonight?

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~180-night MLB regular season.

Commissioner controls: league length, player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Strikeouts Contest Winner Bonus (Full Season, ~180 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~180 in a full MLB season). A 90-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'hr_derby',
    label: 'Home Run Derby',
    description: 'Pick 3 hitters per day — score points for every HR they hit',
    details: `Pick up to 3 hitters per day who you think will go yard. By default, each player can only be used once per week — commissioners can flip that to unlimited. Total home runs determine standings; ties share rank. No salaries, no lineups, no optimization required. Just: will this guy hit one tonight?

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~180-night MLB regular season.

Commissioner controls: league length, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'HR Derby Winner Bonus (Full Season, ~180 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~180 in a full MLB season). A 90-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'three_point',
    label: 'NBA 3-Point Contest',
    description: 'Pick 3 NBA shooters per night — score points for every made 3-pointer',
    details: `Pick up to 3 NBA players per night you think will drain threes. By default, each player can only be used once per week — commissioners can flip that to unlimited. Total made 3-pointers determine standings; ties share rank. No salaries, no lineups — just pick the shooters.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~180-night NBA regular season.

Commissioner controls: league length, player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'NBA 3-Point Contest Winner Bonus (Full Season, ~180 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~180 in a full NBA season). A 90-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'wnba_three_point',
    label: 'WNBA 3-Point Contest',
    description: 'Pick 3 WNBA shooters per night — score points for every made 3-pointer',
    details: `Pick up to 3 WNBA players per night you think will drain threes. By default, each player can only be used once per week — commissioners can flip that to unlimited. Total made 3-pointers determine standings; ties share rank. No salaries, no lineups — just pick the shooters.

When the league ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how long the league actually ran out of a ~120-night WNBA regular season.

Commissioner controls: league length, player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'WNBA 3-Point Contest Winner Bonus (Full Season, ~120 game nights)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many nights your league runs (out of ~120 in a full WNBA season). A 60-night league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'ints',
    label: 'Interceptions Contest',
    description: 'Pick 3 NFL defenders per week — score points for every interception they record',
    details: `Pick 3 NFL defenders each week — DBs, LBs, anyone who can pick off a pass. Every interception each pick records adds to your league total. By default, each defender can only be used once per season — commissioners can flip that to unlimited.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by NFL weeks played out of 18.

Commissioner controls: league length (defaults to full NFL season), player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Interceptions Contest Winner Bonus (Full Season, 18 weeks)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many weeks your league runs (out of 18 in a full NFL regular season). A 9-week league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'sacks',
    label: 'Sacks Contest',
    description: 'Pick 3 NFL defenders per week — score points for every sack they record',
    details: `Pick 3 NFL defenders each week — anyone who can rush the passer (DEs, DTs, edge rushers, blitzing LBs, even DBs). Every sack each pick records adds to your league total. By default, each defender can only be used once per season — commissioners can flip that to unlimited.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by NFL weeks played out of 18.

Commissioner controls: league length (defaults to full NFL season), player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Sacks Contest Winner Bonus (Full Season, 18 weeks)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many weeks your league runs (out of 18 in a full NFL regular season). A 9-week league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'tackles',
    label: 'Tackles Contest',
    description: 'Pick 3 NFL defenders per week — score points for every tackle they record',
    details: `Pick 3 NFL defenders each week — LBs, safeties, corners, anyone on defense. Every tackle each pick records adds to your league total. By default, each defender can only be used once per season — commissioners can flip that to twice, three times, or unlimited.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by NFL weeks played out of 18.

Commissioner controls: league length (defaults to full NFL season), player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Tackles Contest Winner Bonus (Full Season, 18 weeks)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many weeks your league runs (out of 18 in a full NFL regular season). A 9-week league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'receptions',
    label: 'Receptions Contest',
    description: 'Pick 3 NFL pass catchers per week — score points for every reception they record',
    details: `Pick 3 NFL pass catchers each week — WRs, TEs, and pass-catching RBs. Every reception each pick records adds to your league total. By default, each player can only be used once per season — commissioners can flip that to twice, three times, or unlimited.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by NFL weeks played out of 18.

Commissioner controls: league length (defaults to full NFL season), player reuse rule, team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Receptions Contest Winner Bonus (Full Season, 18 weeks)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many weeks your league runs (out of 18 in a full NFL regular season). A 9-week league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'td_pass',
    label: 'TD Pass Competition',
    description: 'Pick one QB per week — never repeat a QB. Most passing TDs across the season wins',
    details: `Season-long NFL league where you pick one quarterback per week — and you can never pick the same QB twice all season. Standings rank by total passing touchdowns accumulated across all your picks. Most TDs by season's end wins. Rushing TDs don't count. Ties split the bonus.

When the season ends, your final position converts to global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below, prorated by how many NFL weeks the league ran out of 18.

Commissioner controls: league length (defaults to full NFL season), team count. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'TD Pass Winner Bonus (Full Season, 18 weeks)',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Bonus scales with how many weeks your league runs (out of 18 in a full NFL regular season). A 9-week league earns 50% of the bonus. Position points (n+1−2×rank) are added on top.',
    },
  },
  {
    value: 'pickem',
    label: "Pick'em",
    description: 'Pick the winners of the games. Most points at the end wins.',
    details: `A pick-the-winners league. The commissioner sets the slate — a single sport or all sports, a single week or a full season — and every member picks who they think will win each game. Earn points for the picks you get right, lose points for the ones you don't. Most points at the end of the league's run wins.

When the league ends, the points you earned during play transfer to your global IKB score. The winner also earns a bonus equal to the number of members in the league.

Commissioner controls: sport (single or all), duration (this week, custom range, or full season), pick frequency (daily or weekly), games per period, lock time (game start or submission), and open vs invite-only. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: "Pick'em Winner Bonus",
      columns: WINNER_BONUS_COLUMNS,
      rows: [
        { size: '6 members', winner: '+6' },
        { size: '10 members', winner: '+10' },
        { size: '15 members', winner: '+15' },
        { size: '25 members', winner: '+25' },
        { size: '50 members', winner: '+50' },
        { size: '100 members', winner: '+100' },
      ],
      footnote: 'Winner bonus = number of members in the league. Pick points earned during play also transfer to your global score.',
    },
  },
  {
    value: 'survivor',
    label: 'Survivor',
    description: 'Pick one team per period. If they win, you survive. Last one standing wins',
    details: `Pick one team to win each period. Win and you survive. Lose and you burn a life. The catch: you can never pick the same team twice. Use all your lives and you're out. Last one standing wins.

When the league ends, only survivors earn global IKB points — the size-tiered survivor bonus shown below. If multiple players survive to the end, the bonus is split evenly.

NFL leagues can also be set up as a Touchdown Survivor Pool — instead of picking a team, pick one player you think will score a non-passing TD (rush, reception, return, or fumble recovery). Same survivor engine, same global scoring. Comes with the TD Legends backdrop set (Jerry, Emmitt, LaDainian).

Commissioner controls: sport, period frequency (daily or weekly), lives per player, what happens if everyone gets eliminated in the same period (all-survive or reset), and league length. Custom backdrop from a curated library or upload your own.`,
    bonusTable: {
      title: 'Survivor Bonus',
      columns: [
        { key: 'size', label: 'League Size', align: 'left' },
        { key: 'winner', label: 'Survivor Bonus', align: 'center', color: 'text-correct' },
      ],
      rows: SURVIVOR_BONUS_ROWS,
      footnote: 'Eliminated players earn nothing. If multiple players survive to the end, the bonus is split evenly among them.',
    },
  },
  {
    value: 'bracket',
    label: 'Bracket',
    description: 'Fill out a tournament bracket with escalating points per round',
    details: `Tournament-style competition. The commissioner selects a template — NCAA Tournament, NBA Playoffs, NHL Playoffs, NFL Playoffs, and more — members fill out their bracket before the lock, and points scale dramatically by round. A correct championship pick is worth multiples of a first-round call. NBA and NHL playoff brackets include a series length prediction for each matchup — nail the exact number of games for bonus points.

When the bracket completes, your finishing position determines your global IKB points using the position formula (N+1−2×rank) — top half earns positive points, bottom half negative. The winner also earns a size-tiered bonus shown below.

Commissioner controls: bracket template, lock time, and visibility. Custom backdrop or upload your own, plus a centerpiece image behind the bracket.`,
    bonusTable: {
      title: 'Bracket Winner Bonus',
      columns: WINNER_BONUS_COLUMNS,
      rows: WINNER_BONUS_ROWS,
      footnote: 'Position points (n+1−2×rank) are added on top of the winner bonus. Ties split the bonus.',
    },
  },
  {
    value: 'squares',
    label: 'Squares',
    description: '10x10 grid tied to a single game with quarter-by-quarter scoring',
    details: `The classic 10×10 grid game tied to a real game. Claim your squares, numbers get randomly assigned to the axes, and every quarter the owner of the square matching the last digit of each team's score wins points. Squares transforms any watch party into a shared experience — suddenly everyone in the room has a stake in every score, every quarter, every last-second field goal. No sports knowledge required.

Squares is pure side action — it does not affect your global IKB score. What happens in the grid stays in the grid.

Commissioner controls: which game, max squares per user, points per quarter, and whether numbers are auto-assigned when the board fills or commissioner-triggered. Custom backdrop from a curated library or upload your own.`,
  },
]

// Lookup so cards can inherit details + bonusTable from the canonical
// FORMAT_OPTIONS entry without duplication.
export const FORMAT_BY_VALUE = Object.fromEntries(FORMAT_OPTIONS.map((o) => [o.value, o]))

// Sport-tab navigation for the Create flow. "All Sports" lists the formats
// that aren't tied to one sport (Survivor, Pick'em, Squares, Bracket); the
// per-sport tabs include those generic formats again with sport pre-selected
// (e.g., NFL Pick'em jumps straight to the Pick'em config with sport=NFL).
export const CATEGORIES = [
  { key: 'football', label: 'Football' },
  { key: 'basketball', label: 'Basketball' },
  { key: 'baseball', label: 'Baseball' },
  { key: 'soccer', label: 'Soccer' },
  { key: 'all_sports', label: 'All Sports' },
]

// Cards per category. Only formats that exist today are listed; new formats
// (Sacks Contest, INT Contest, MLB Strikeouts, Salary Cap Defense) get added
// here when they ship. Each card resolves to a `format` slug; an optional
// `preset` applies sport / fantasyFormat / survivorMode on click.
export const CATEGORY_CARDS = {
  all_sports: [
    { key: 'survivor-generic', format: 'survivor', preset: { sport: 'all' } },
    { key: 'bracket', format: 'bracket' },
    { key: 'pickem-generic', format: 'pickem', preset: { sport: 'all' } },
    { key: 'squares', format: 'squares' },
  ],
  football: [
    {
      key: 'fantasy-traditional',
      format: 'fantasy',
      label: 'Traditional Fantasy Football',
      description: 'Snake draft, weekly head-to-head matchups, waivers, trades, and a playoff bracket',
      details: `Snake draft, weekly head-to-head matchups, waivers, trades, and an end-of-season playoff bracket. Set your lineup each week, work the waiver wire, make trades, and battle league mates for the championship.

Commissioner controls: scoring format (PPR, half-PPR, standard, or fully custom per-stat), roster configuration, team count, draft date and pick timer, waiver system (priority, rolling, or FAAB with starting budget), trade review method, playoff team count, playoff start week, and championship week. Custom backdrop from a curated library or upload your own.`,
      bonusTable: {
        title: 'Traditional Fantasy Bonus Structure',
        intro: `Traditional fantasy leagues require effort and intelligence to win. We honor that with an appropriate point-bonus structure for winning leagues. Traditional fantasy football with people who pay attention, try, and have a deep understanding of the sport, is a serious competition of strategy and knowledge. Winning a league is genuinely respectable as a life achievement — I know that may sound silly... but only to people who have never won a serious league. It's a legitimate brain test, doused in dramatic unpredictability and luck of course. But to be in the mix year in and year out, and to win championships against serious fantasy football players bestows major credibility upon a person. I can only win a serious league if and only if I KNOW BALL. To honor the feat of winning a fantasy football league, we offer the following bonus structure.`,
        rows: [
          { size: '6 teams', first: '+50', second: '+20', third: '+10' },
          { size: '8 teams', first: '+75', second: '+30', third: '+15' },
          { size: '10 teams', first: '+90', second: '+36', third: '+18' },
          { size: '12 teams', first: '+120', second: '+48', third: '+24' },
          { size: '14 teams', first: '+165', second: '+66', third: '+33' },
          { size: '16 teams', first: '+195', second: '+78', third: '+39' },
          { size: '20 teams', first: '+225', second: '+90', third: '+45' },
        ],
      },
      preset: { fantasyFormat: 'traditional', sport: 'americanfootball_nfl' },
    },
    {
      key: 'fantasy-salary',
      format: 'fantasy',
      label: 'Salary Cap Fantasy Football',
      description: 'Build a fresh weekly NFL lineup under a salary cap — no draft, no carryover',
      details: `Build a fresh weekly NFL lineup under a salary cap — no draft, no trades, no roster carryover. Player prices shift weekly based on recent performance and matchups, so the value plays change every week. Single-week mode is also available for one-and-done contests.

Salary cap leagues generate a League Report at the end of the season — most-played player, pick of the year, best value plays, worst investments, and league-wide awards.

Commissioner controls: salary cap, season type (full season or single week), team count, and lineup lock time. Custom backdrop from a curated library or upload your own.`,
      bonusTable: {
        title: 'Salary Cap Bonus Structure (Full Season, Week 1 Start)',
        rows: [
          { size: '6 members', first: '+35', second: '+14', third: '+7' },
          { size: '8 members', first: '+60', second: '+24', third: '+12' },
          { size: '10 members', first: '+75', second: '+30', third: '+15' },
          { size: '12 members', first: '+90', second: '+36', third: '+18' },
          { size: '14 members', first: '+105', second: '+42', third: '+21' },
          { size: '16 members', first: '+120', second: '+48', third: '+24' },
          { size: '20 members', first: '+150', second: '+60', third: '+30' },
        ],
        footnote: 'Salary cap leagues that start mid-season use the same shape but prorated by weeks played. Single-week leagues (one-and-done) use position-ranked scoring with a winner bonus — the winner takes home members × 2, the bottom half earns negative points.',
      },
      preset: { fantasyFormat: 'salary_cap', sport: 'americanfootball_nfl' },
    },
    {
      key: 'nfl-survivor',
      format: 'survivor',
      label: 'NFL Survivor',
      description: 'Pick a single NFL team to win each week. Last one standing wins',
      preset: { sport: 'americanfootball_nfl', survivorMode: 'standard' },
    },
    {
      key: 'td-survivor',
      format: 'survivor',
      label: 'TD Survivor',
      description: 'Pick a single NFL player each week to score a TD. Survive or be eliminated',
      preset: { sport: 'americanfootball_nfl', survivorMode: 'touchdown' },
    },
    { key: 'td-pass', format: 'td_pass' },
    { key: 'sacks', format: 'sacks', preset: { sport: 'americanfootball_nfl' } },
    { key: 'ints', format: 'ints', preset: { sport: 'americanfootball_nfl' } },
    { key: 'tackles', format: 'tackles', preset: { sport: 'americanfootball_nfl' } },
    { key: 'receptions', format: 'receptions', preset: { sport: 'americanfootball_nfl' } },
    {
      key: 'nfl-pickem',
      format: 'pickem',
      label: "NFL Pick'em",
      description: 'Pick the winners of NFL games. Most points at the end wins.',
      preset: { sport: 'americanfootball_nfl' },
    },
    {
      key: 'ncaaf-survivor',
      format: 'survivor',
      label: 'NCAAF Survivor',
      description: 'Pick a single college football team to win each week. Last one standing wins',
      preset: { sport: 'americanfootball_ncaaf', survivorMode: 'standard' },
    },
    {
      key: 'ncaaf-pickem',
      format: 'pickem',
      label: "NCAAF Pick'em",
      description: 'Pick the winners of college football games. Most points at the end wins.',
      preset: { sport: 'americanfootball_ncaaf' },
    },
    {
      key: 'nfl-playoff-bracket',
      format: 'bracket',
      label: 'NFL Playoff Bracket',
      description: "Pick every NFL playoff game from Wild Card through the Super Bowl. Most points across all rounds wins.",
      preset: { sport: 'americanfootball_nfl' },
    },
    {
      key: 'ncaaf-playoff-bracket',
      format: 'bracket',
      label: 'NCAAF Playoff Bracket',
      description: 'Pick every College Football Playoff game from the opening round through the National Championship.',
      preset: { sport: 'americanfootball_ncaaf' },
    },
  ],
  basketball: [
    {
      key: 'nba-dfs',
      format: 'nba_dfs',
      preset: { sport: 'basketball_nba' },
    },
    {
      key: 'wnba-dfs',
      format: 'wnba_dfs',
      preset: { sport: 'basketball_wnba' },
    },
    { key: 'three-point', format: 'three_point' },
    { key: 'wnba-three-point', format: 'wnba_three_point', preset: { sport: 'basketball_wnba' } },
    {
      key: 'nba-survivor',
      format: 'survivor',
      label: 'NBA Survivor',
      description: 'Pick a single NBA team to win each period. Last one standing wins',
      preset: { sport: 'basketball_nba', survivorMode: 'standard' },
    },
    {
      key: 'wnba-survivor',
      format: 'survivor',
      label: 'WNBA Survivor',
      description: 'Pick a single WNBA team to win each period. Last one standing wins',
      preset: { sport: 'basketball_wnba', survivorMode: 'standard' },
    },
    {
      key: 'nba-pickem',
      format: 'pickem',
      label: "NBA Pick'em",
      description: 'Pick the winners of NBA games. Most points at the end wins.',
      preset: { sport: 'basketball_nba' },
    },
    {
      key: 'wnba-pickem',
      format: 'pickem',
      label: "WNBA Pick'em",
      description: 'Pick the winners of WNBA games. Most points at the end wins.',
      preset: { sport: 'basketball_wnba' },
    },
    {
      key: 'nba-playoff-bracket',
      format: 'bracket',
      label: 'NBA Playoff Bracket',
      description: 'Pick every NBA playoff series from Round 1 through the Finals. Most points across all rounds wins.',
      preset: { sport: 'basketball_nba' },
    },
    {
      key: 'wnba-playoff-bracket',
      format: 'bracket',
      label: 'WNBA Playoff Bracket',
      description: 'Pick every WNBA playoff series from Round 1 through the Finals. Most points across all rounds wins.',
      preset: { sport: 'basketball_wnba' },
    },
    {
      key: 'march-madness-bracket',
      format: 'bracket',
      label: 'March Madness Bracket',
      description: 'Fill out the full NCAA Tournament from the Round of 64 through the Final Four and National Championship.',
      preset: { sport: 'basketball_ncaab' },
    },
    {
      key: 'wncaab-bracket',
      format: 'bracket',
      label: "Women's March Madness Bracket",
      description: "Fill out the full NCAA Women's Tournament from the Round of 64 through the Final Four and National Championship.",
      preset: { sport: 'basketball_wncaab' },
    },
  ],
  baseball: [
    { key: 'mlb-dfs', format: 'mlb_dfs' },
    { key: 'hr-derby', format: 'hr_derby' },
    { key: 'strikeouts', format: 'strikeouts' },
    {
      key: 'mlb-survivor',
      format: 'survivor',
      label: 'MLB Survivor',
      description: 'Pick a single MLB team to win each period. Last one standing wins',
      preset: { sport: 'baseball_mlb', survivorMode: 'standard' },
    },
    {
      key: 'mlb-pickem',
      format: 'pickem',
      label: "MLB Pick'em",
      description: 'Pick the winners of MLB games. Most points at the end wins.',
      preset: { sport: 'baseball_mlb' },
    },
    {
      key: 'mlb-playoff-bracket',
      format: 'bracket',
      label: 'MLB Playoff Bracket',
      description: 'Pick every MLB playoff series from the Wild Card round through the World Series. Most points across all rounds wins.',
      preset: { sport: 'baseball_mlb' },
    },
  ],
  soccer: [
    {
      key: 'world-cup-bracket',
      format: 'bracket',
      label: 'World Cup Bracket',
      description: 'Pick the knockout-stage winners. Round of 32 → Final, plus a goals-in-the-final tiebreaker.',
      details: `A 32-team single-elimination bracket for the 2026 FIFA World Cup, starting with the Round of 32. Pick each matchup all the way through to the Champion, plus a tiebreaker: total goals scored in the Final match.

The bracket is published the moment the group stage concludes — June 27, 2026 (evening PT) — and locks at the first R32 kickoff on June 28. Partial picks are saved automatically; you can come back later to finish.

Penalty-shootout winners advance in the bracket (no need to predict the shootout itself).`,
      bonusTable: {
        title: 'World Cup Bracket Points',
        intro: 'Points double per round. Maximum base score = 80 from picks alone; champion bonus scales with league size on top.',
        rows: [
          { size: 'Round of 32 (16 matchups)', first: '+1 each', second: '—', third: '—' },
          { size: 'Round of 16 (8 matchups)', first: '+2 each', second: '—', third: '—' },
          { size: 'Quarterfinals (4 matchups)', first: '+4 each', second: '—', third: '—' },
          { size: 'Semifinals (2 matchups)', first: '+8 each', second: '—', third: '—' },
          { size: 'Final (1 matchup)', first: '+16', second: '—', third: '—' },
        ],
        footnote: 'Champion bonus: position-based, scales with league size — mirrors the NBA Playoffs Bracket structure. Tiebreaker: closest guess to the actual total goals scored in the Final match.',
      },
      preset: { sport: 'soccer_world_cup' },
    },
  ],
}

const SPORT_OPTIONS = [
  { value: 'americanfootball_nfl', label: 'NFL' },
  { value: 'basketball_nba', label: 'NBA' },
  { value: 'baseball_mlb', label: 'MLB' },
  { value: 'basketball_ncaab', label: 'NCAAB' },
  { value: 'basketball_wncaab', label: 'WNCAAB' },
  { value: 'americanfootball_ufl', label: 'UFL' },
  { value: 'americanfootball_ncaaf', label: 'NCAAF' },
  { value: 'basketball_wnba', label: 'WNBA' },
  { value: 'icehockey_nhl', label: 'NHL' },
  { value: 'all', label: 'All Sports' },
]

// Sports where daily picks make sense (games happen most days during season)
const DAILY_ELIGIBLE_SPORTS = new Set(['basketball_nba', 'basketball_ncaab', 'basketball_wncaab', 'basketball_wnba', 'baseball_mlb', 'icehockey_nhl', 'all'])
// Weekly picks are valid for every sport — even daily-cadence ones (NBA, MLB,
// etc.) can run "pick once per Mon–Sun" if the commissioner prefers it.
// Daily eligibility above governs whether the "Daily" pill is enabled.
const WEEKLY_ELIGIBLE_SPORTS = new Set(['americanfootball_nfl', 'americanfootball_ncaaf', 'americanfootball_ufl', 'basketball_nba', 'basketball_ncaab', 'basketball_wncaab', 'basketball_wnba', 'baseball_mlb', 'icehockey_nhl', 'all'])

function allowedFrequencies(sport) {
  const allowed = []
  if (WEEKLY_ELIGIBLE_SPORTS.has(sport)) allowed.push('weekly')
  if (DAILY_ELIGIBLE_SPORTS.has(sport)) allowed.push('daily')
  return allowed
}

// Inline team-name input with a suggestion dropdown. Used by Squares so
// commissioners scheduling a future game (before it's in the schedule API)
// can pick from canonical team names — the eventually-synced game matches
// cleanly without near-miss typos like "49ers" vs "Niners".
function TeamNameAutocomplete({ value, onChange, placeholder, teams }) {
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const q = (value || '').trim().toLowerCase()
  const matches = q.length > 0 && Array.isArray(teams)
    ? teams.filter((t) => t.toLowerCase().includes(q) && t.toLowerCase() !== q).slice(0, 6)
    : []
  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        maxLength={50}
        className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
      />
      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 bg-bg-primary border border-text-primary/20 rounded-lg max-h-48 overflow-y-auto shadow-lg">
          {matches.map((t) => (
            <button
              key={t}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(t); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm text-text-primary hover:bg-text-primary/5"
            >
              {t}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const DURATION_OPTIONS = [
  { value: 'this_week', label: 'This Week Only' },
  { value: 'custom_range', label: 'Custom Date Range' },
  { value: 'full_season', label: 'Full Season' },
  // 'playoffs_only' intentionally removed — picking it outside the actual
  // playoff window started leagues immediately on regular-season /
  // preseason games and ran them for 3 months, missing real playoffs
  // entirely. Playoff-specific competition is handled by the bracket
  // format. Server-side handlers for the value are kept defensively for
  // any legacy leagues already created with this duration.
]

// Season start/end helpers moved to lib/seasonDates.js so the league-edit
// page can share the same source of truth.

export default function CreateLeaguePage() {
  const navigate = useNavigate()
  const createLeague = useCreateLeague()
  // Admin-controlled list of league-format CARD KEYS that should not appear
  // in the picker (e.g. hide NBA Pick'em in summer without also hiding NFL
  // Pick'em). Stored in app_settings under key `disabled_format_cards` as a
  // JSON array. Refetches whenever the page mounts so toggle flips take
  // effect without a client release.
  const { data: disabledCardsSetting } = useQuery({
    queryKey: ['app-settings', 'disabled_format_cards'],
    queryFn: () => api.get('/app-settings/disabled_format_cards'),
    staleTime: 60_000,
  })
  const disabledCardKeys = useMemo(() => {
    const raw = disabledCardsSetting?.value
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.keys) ? raw.keys : []
    return new Set(list)
  }, [disabledCardsSetting])
  // ?format=X[&sport=Y] from the landing page card-tap flow. Used once
  // on mount to pre-select the format and (optionally) sport so the user
  // lands directly on the right configuration step.
  const [searchParams] = useSearchParams()
  const initialFormat = searchParams.get('format') || ''
  const initialSport = searchParams.get('sport') || ''

  const [name, setName] = useState('')
  const [format, setFormat] = useState(initialFormat)
  const [expandedCardKey, setExpandedCardKey] = useState(null)
  const [selectedCardKey, setSelectedCardKey] = useState(null)
  // True only when the card the user picked locks sport to a specific value
  // (e.g. "NFL Survivor", "NBA Pick'em"). Generic cards ("Survivor",
  // "Pick'em") leave sport unlocked so the picker should stay visible
  // for the user to pick + change a sport mid-create.
  const [sportPresetLocked, setSportPresetLocked] = useState(false)
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set())
  const settingsRef = useRef(null)
  const [sport, setSport] = useState(initialSport)
  const [duration, setDuration] = useState('')
  const [maxMembers, setMaxMembers] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')

  // Squares game picker
  const [gameId, setGameId] = useState('')
  const [squaresDate, setSquaresDate] = useState('')
  const squaresSport = format === 'squares' && sport && sport !== 'all' ? sport : undefined
  const { data: allSquaresGames } = useGames(squaresSport, 'upcoming', 90)
  // Canonical team-name list for the chosen squares sport — feeds the
  // row/col autocomplete so a commissioner setting up a future game
  // (before the schedule API has it) picks the same name the eventual
  // synced game will use.
  const { data: squaresTeams } = useTeamsForSport(squaresSport || null)
  const squaresGames = squaresDate
    ? (allSquaresGames || []).filter((g) => {
        const d = new Date(g.starts_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        return key === squaresDate
      })
    : []

  // Bracket settings
  const [templateId, setTemplateId] = useState('')
  const [locksAt, setLocksAt] = useState('')
  const { data: bracketTemplates } = useBracketTemplatesActive(sport !== 'all' ? sport : undefined)

  // Separately fetch World Cup bracket templates so we can show/hide the
  // entire Soccer category tab dynamically. Auto-hide when there's no
  // active (non-finalized) WC bracket — keeps the tab from cluttering the
  // 4-year gap between tournaments without requiring a new app build.
  const { data: worldCupTemplates } = useBracketTemplatesActive('soccer_world_cup')
  const hasActiveSoccerBracket = (worldCupTemplates || []).some((t) => !t.championship_score_set)

  // Format-specific settings
  const [lockOddsAt, setLockOddsAt] = useState('game_start')
  const [gamesPerWeek, setGamesPerWeek] = useState('')
  const [lives, setLives] = useState(1)
  // Default to daily — fits multi-sport ('all') survivor leagues + NBA /
  // MLB / NHL where games happen every day. When commissioner picks a
  // football sport, the form auto-snaps this to 'weekly' (the only
  // allowed frequency for football) via the sport-change handler below.
  const [pickFrequency, setPickFrequency] = useState('daily')
  const [allEliminatedSurvive, setAllEliminatedSurvive] = useState(true)
  const [survivorMode, setSurvivorMode] = useState('standard')
  const [assignmentMethod, setAssignmentMethod] = useState('self_select')
  const [pointsPerQuarter, setPointsPerQuarter] = useState([25, 25, 25, 50])
  const [maxSquaresPerUser, setMaxSquaresPerUser] = useState('')
  const [rowTeamName, setRowTeamName] = useState('')
  const [colTeamName, setColTeamName] = useState('')

  // Fantasy settings
  const [fantasyFormat, setFantasyFormat] = useState('traditional')
  // Traditional fantasy can only be created BEFORE the NFL season opener
  // kicks off. Once the first Week 1 game starts, only Salary Cap is
  // available.
  const { data: openerData } = useNflSeasonOpener()
  const traditionalLocked = !!(
    openerData?.opener && new Date(openerData.opener).getTime() <= Date.now()
  )
  // Auto-flip the toggle to salary cap once we know the season has started
  useEffect(() => {
    if (traditionalLocked && fantasyFormat === 'traditional') {
      setFantasyFormat('salary_cap')
    }
  }, [traditionalLocked, fantasyFormat])

  // Auto-select sport for specific formats
  useEffect(() => {
    if (format === 'fantasy' && fantasyFormat === 'traditional') setSport('americanfootball_nfl')
    if (format === 'mlb_dfs' || format === 'hr_derby' || format === 'strikeouts') setSport('baseball_mlb')
    if (format === 'three_point') setSport('basketball_nba')
    if (format === 'wnba_three_point') setSport('basketball_wnba')
    if (format === 'wnba_dfs') setSport('basketball_wnba')
    if (format === 'td_pass') setSport('americanfootball_nfl')
    if (format === 'sacks') setSport('americanfootball_nfl')
    if (format === 'ints') setSport('americanfootball_nfl')
    if (format === 'tackles') setSport('americanfootball_nfl')
    if (format === 'receptions') setSport('americanfootball_nfl')
    // Squares needs a specific game — bump 'all' off so the picker isn't stuck.
    if (format === 'squares' && sport === 'all') setSport('americanfootball_nfl')
    // Per-format salary cap default — MLB pricing settles lower than NBA,
    // so MLB defaults to $45k (middle of the 40/45/50 options).
    if (format === 'mlb_dfs') setSalaryCap(45000)
    else if (format === 'nba_dfs' || format === 'wnba_dfs' || (format === 'fantasy' && fantasyFormat === 'salary_cap')) setSalaryCap(60000)
    // HR Derby + 3-Point Contest + Strikeouts share the daily-pick pattern:
    // tomorrow start (gives players a day to join), full season unless
    // commissioner picks custom range. Always snap to full_season on entry
    // so the picker has the "Full Season" pill highlighted by default
    // regardless of what the user had selected on a prior format.
    if (format === 'hr_derby' || format === 'three_point' || format === 'wnba_three_point' || format === 'strikeouts') {
      setDfsStartOption('tomorrow')
      setSeasonType('full_season')
    }
    // Sacks + Interceptions + Tackles + Receptions Contests share NFL
    // weekly cadence. Default reuse is 2x — strict enough to keep variety
    // but generous enough that users aren't locked out of obvious favorites
    // (Micah Parsons in sacks, Jefferson in receptions) after a single use.
    if (format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') {
      setPickReuse('2')
    } else if (format === 'td_pass') {
      // TD Pass auto-starts at next NFL kickoff and runs the full season
      // by default; user can pick a custom end date instead.
      if (seasonType === 'single_week') setSeasonType('full_season')
    } else if (format === 'three_point' || format === 'wnba_three_point' || format === 'hr_derby' || format === 'strikeouts') {
      setPickReuse('weekly')
    }
  }, [format, fantasyFormat])

  // NBA / MLB / All-Sports survivor and pick'em default to daily (games run
  // every day, not just on weekends). NFL stays on the weekly default.
  // Weekly remains selectable in all cases — this is just the default.
  useEffect(() => {
    if ((format === 'survivor' || format === 'pickem')
      && (sport === 'basketball_nba' || sport === 'baseball_mlb' || sport === 'all')) {
      const allowed = allowedFrequencies(sport)
      if (allowed.includes('daily')) setPickFrequency('daily')
    }
  }, [format, sport])

  // Snap pickFrequency to whatever the current sport allows. The sport
  // <button> handlers do this inline, but card presets (e.g. clicking
  // 'NCAAF Survivor') just call setSport — without this effect, the
  // form would still show 'daily' selected even though football sports
  // only support 'weekly'.
  useEffect(() => {
    if (!sport) return
    const allowed = allowedFrequencies(sport)
    if (allowed.length && !allowed.includes(pickFrequency)) {
      setPickFrequency(allowed[0])
    }
  }, [sport])
  const [scoringFormat, setScoringFormat] = useState('ppr')
  const [scoringRules, setScoringRules] = useState(null) // null = use preset
  const [numTeams, setNumTeams] = useState(10)
  const [draftMode, setDraftMode] = useState('live') // 'live' or 'offline'
  const [draftPickTimer, setDraftPickTimer] = useState(60)
  const [draftDate, setDraftDate] = useState('') // datetime-local string in user's local TZ
  const [draftLocation, setDraftLocation] = useState('')
  const [rosterSlots, setRosterSlots] = useState(DEFAULT_ROSTER_SLOTS)
  const [waiverType, setWaiverType] = useState('priority')
  const [faabStartingBudget, setFaabStartingBudget] = useState(100)
  const [tradeReview, setTradeReview] = useState('commissioner')
  const [playoffTeams, setPlayoffTeams] = useState(4)
  // Tracks whether the commissioner has hit a playoff-teams button. Until
  // they do, the default mirrors numTeams (4 for <14 team leagues, 6 for
  // 14+ since deep leagues conventionally play out 6-team brackets).
  const [playoffTeamsManuallySet, setPlayoffTeamsManuallySet] = useState(false)
  const [championshipWeek, setChampionshipWeek] = useState(17)
  // Playoff start is derived from teams + championship week — no need for
  // a separate picker. Standard bracket sizing:
  //   2 teams → 1 round (championship only)
  //   3-4 teams → 2 rounds (semis + championship)
  //   5-8 teams → 3 rounds (QF + semis + championship; 5-7 with byes)
  const playoffRounds = playoffTeams <= 2 ? 1 : playoffTeams <= 4 ? 2 : 3
  const playoffStartWeek = championshipWeek - (playoffRounds - 1)
  const [salaryCap, setSalaryCap] = useState(60000)
  const [seasonType, setSeasonType] = useState('full_season')

  // Clamp playoff team count down if the user shrinks the league past it
  // (e.g. picked Top 8 then dropped league size to 6 → forces back to 6).
  // Also follow the numTeams-driven default (4 for <14, 6 for 14+) until
  // the commissioner explicitly picks a playoff-teams option.
  // Placed AFTER playoffTeams/numTeams declarations to avoid the TDZ.
  useEffect(() => {
    if (playoffTeams > numTeams) setPlayoffTeams(numTeams >= 6 ? 6 : 4)
    else if (!playoffTeamsManuallySet) setPlayoffTeams(numTeams >= 14 ? 6 : 4)
  }, [numTeams, playoffTeams, playoffTeamsManuallySet])

  const [championMetric, setChampionMetric] = useState('total_points')
  const [singleWeek, setSingleWeek] = useState(1)

  // Visibility settings
  const [visibility, setVisibility] = useState('open')
  const [backdropImage, setBackdropImage] = useState('')
  const [customBackdropFile, setCustomBackdropFile] = useState(null)
  const [customBackdropPreview, setCustomBackdropPreview] = useState(null)
  const fileInputRef = useRef(null)
  const backdropSport = format === 'nba_dfs' ? 'basketball_nba' : format === 'wnba_dfs' ? 'wnba_dfs_contest' : format === 'hr_derby' ? 'hr_derby_contest' : format === 'mlb_dfs' ? 'baseball_mlb' : (format === 'survivor' && survivorMode === 'touchdown') ? 'touchdown_survivor' : format === 'td_pass' ? 'td_pass_competition' : format === 'three_point' ? 'three_point_contest' : format === 'wnba_three_point' ? 'wnba_three_point_contest' : format === 'sacks' ? 'sacks_contest' : format === 'ints' ? 'ints_contest' : format === 'tackles' ? 'tackles_contest' : format === 'receptions' ? 'receptions_contest' : format === 'strikeouts' ? 'strikeouts_contest' : sport || undefined
  const { data: availableBackdrops } = useLeagueBackdrops(backdropSport)

  // NBA DFS start date
  const [dfsStartOption, setDfsStartOption] = useState('today')
  const [dfsStartCustom, setDfsStartCustom] = useState('')
  // HR Derby + 3-Point Contest custom end date — used when seasonType === 'custom_range'
  const [hrDerbyEndDate, setHrDerbyEndDate] = useState('')
  // NFL contests (sacks / ints / tackles / receptions / td_pass) custom start date.
  // Daily contests already pick start via the Today/Tomorrow/Custom row above, so
  // this is NFL-only. Empty string means "start immediately."
  const [nflContestStartDate, setNflContestStartDate] = useState('')
  // 3-Point Contest player reuse rule: 'weekly' (default — once per Mon-Sun)
  // or 'unlimited' (commissioner override). Stored on fantasy_settings.pick_reuse.
  const [pickReuse, setPickReuse] = useState('weekly')

  function getDfsStartDate() {
    const today = todaySportsDay()
    if (dfsStartOption === 'today') return today
    if (dfsStartOption === 'tomorrow') return tomorrowSportsDay()
    return dfsStartCustom || today
  }

  async function handleSubmit(e) {
    e.preventDefault()

    if ((format === 'hr_derby' || format === 'three_point' || format === 'wnba_three_point' || format === 'strikeouts' || format === 'td_pass' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') && seasonType === 'custom_range') {
      if (!hrDerbyEndDate) { toast('Pick an end date for your custom range', 'error'); return }
      if (hrDerbyEndDate < getDfsStartDate()) { toast('End date must be after the start date', 'error'); return }
    }

    if (endsAt && endsAt !== 'end_of_season' && sport && sport !== 'all') {
      const seasonEnd = getSeasonEndDate(sport)
      if (endsAt > seasonEnd) {
        toast(`End date can't be later than the ${sport.split('_').pop().toUpperCase()} regular-season end (${new Date(seasonEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}).`, 'error')
        return
      }
    }

    const settings = {}
    if (format === 'pickem') {
      if (gamesPerWeek) settings.games_per_week = parseInt(gamesPerWeek, 10)
      if (lockOddsAt !== 'game_start') settings.lock_odds_at = lockOddsAt
      settings.pick_frequency = pickFrequency
    }
    if (format === 'survivor') {
      settings.lives = lives
      settings.pick_frequency = pickFrequency
      settings.all_eliminated_survive = allEliminatedSurvive
      settings.survivor_mode = survivorMode // 'standard' or 'touchdown'
    }
    if (format === 'squares') {
      settings.game_id = gameId
      settings.assignment_method = assignmentMethod
      settings.points_per_quarter = pointsPerQuarter
      if (maxSquaresPerUser) settings.max_squares_per_user = parseInt(maxSquaresPerUser, 10)
      if (rowTeamName) settings.row_team_name = rowTeamName
      if (colTeamName) settings.col_team_name = colTeamName
    }
    if (format === 'bracket') {
      settings.template_id = templateId
      settings.locks_at = locksAt ? new Date(locksAt).toISOString() : undefined
    }

    // Fantasy settings passed separately
    const isFantasyFormat = ['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions'].includes(format)
    const fantasySettings = isFantasyFormat ? {
      format: (format === 'nba_dfs' || format === 'wnba_dfs' || format === 'mlb_dfs') ? 'salary_cap' : format === 'hr_derby' ? 'hr_derby' : format === 'strikeouts' ? 'strikeouts' : format === 'three_point' ? 'three_point' : format === 'wnba_three_point' ? 'wnba_three_point' : format === 'sacks' ? 'sacks' : format === 'ints' ? 'ints' : format === 'tackles' ? 'tackles' : format === 'receptions' ? 'receptions' : fantasyFormat,
      pick_reuse: (format === 'hr_derby' || format === 'three_point' || format === 'wnba_three_point' || format === 'strikeouts' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') ? pickReuse : undefined,
      // NFL salary cap (DFS) leagues use half-PPR — that's what FanDuel
      // uses and what the salary algorithm is calibrated against. Keeping
      // them on full PPR while salaries assume half-PPR systematically
      // underprices high-target pass-catchers (they get 50% more receiving
      // credit at scoring time than their salary anticipates).
      // NBA/MLB DFS use 'ppr' as a placeholder — their scoring is computed
      // in their own services (nbaDfsService / mlbDfsService) and ignores
      // this column.
      scoring_format: fantasyFormat === 'salary_cap'
        ? 'half_ppr'
        : (format === 'nba_dfs' || format === 'wnba_dfs' || format === 'mlb_dfs')
          ? 'ppr'
          : scoringFormat,
      // Salary cap has no fixed team count — leave num_teams null so the
      // global-rankings job correctly skips it when grouping leagues by shape.
      num_teams: format === 'fantasy' && fantasyFormat === 'salary_cap' ? null : numTeams,
      draft_mode: format === 'fantasy' && fantasyFormat === 'traditional' ? draftMode : undefined,
      draft_pick_timer: format === 'fantasy' && fantasyFormat === 'traditional' && draftMode === 'live' ? draftPickTimer : undefined,
      draft_location: format === 'fantasy' && fantasyFormat === 'traditional' && draftLocation ? draftLocation : undefined,
      // datetime-local returns a naive string in the user's local timezone.
      // new Date() interprets it as local time and .toISOString() converts to
      // UTC for storage. Every other member's browser converts it back to
      // their own local timezone on display.
      draft_date: format === 'fantasy' && fantasyFormat === 'traditional' && draftDate
        ? new Date(draftDate).toISOString()
        : undefined,
      roster_slots: format === 'fantasy' && fantasyFormat === 'traditional'
        ? rosterSlots
        : undefined,
      waiver_type: format === 'fantasy' && fantasyFormat === 'traditional' ? waiverType : undefined,
      faab_starting_budget: format === 'fantasy' && fantasyFormat === 'traditional' && waiverType === 'faab' ? faabStartingBudget : undefined,
      trade_review: format === 'fantasy' && fantasyFormat === 'traditional' ? tradeReview : undefined,
      playoff_teams: format === 'fantasy' && fantasyFormat === 'traditional' ? playoffTeams : undefined,
      playoff_start_week: format === 'fantasy' && fantasyFormat === 'traditional' ? playoffStartWeek : undefined,
      championship_week: format === 'fantasy' && fantasyFormat === 'traditional' ? championshipWeek : undefined,
      scoring_rules: format === 'fantasy' && fantasyFormat === 'traditional' && scoringRules ? scoringRules : undefined,
      salary_cap: (format === 'nba_dfs' || format === 'wnba_dfs' || format === 'mlb_dfs' || fantasyFormat === 'salary_cap') ? salaryCap : undefined,
      season_type: (format === 'nba_dfs' || format === 'wnba_dfs' || fantasyFormat === 'salary_cap') ? seasonType : undefined,
      champion_metric: (format === 'nba_dfs' || format === 'wnba_dfs' || fantasyFormat === 'salary_cap') && seasonType === 'full_season' ? championMetric : undefined,
      // Salary cap "This Week" = always the current NFL week; server fills
      // it in at creation time so the user doesn't have to pick. NBA/WNBA
      // single-night still uses the chosen game date.
      single_week: (format === 'nba_dfs' || format === 'wnba_dfs') && seasonType === 'single_week' ? singleWeek
        : (fantasyFormat === 'salary_cap' && seasonType === 'single_week') ? null
        : undefined,
    } : undefined

    try {
      const league = await createLeague.mutateAsync({
        name,
        format,
        sport: (format === 'nba_dfs' || format === 'three_point') ? 'basketball_nba' : (format === 'wnba_dfs' || format === 'wnba_three_point') ? 'basketball_wnba' : (format === 'mlb_dfs' || format === 'hr_derby' || format === 'strikeouts') ? 'baseball_mlb' : (format === 'fantasy' || format === 'td_pass' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') ? 'americanfootball_nfl' : sport,
        duration: (format === 'nba_dfs' || format === 'wnba_dfs' || format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'custom_range' ? 'custom_range'
          : (format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'single_week' ? 'single_week'
          : isFantasyFormat ? 'full_season' : format === 'td_pass' ? 'full_season' : format === 'survivor' ? 'full_season' : format === 'squares' ? 'custom_range' : format === 'bracket' ? 'custom_range' : (endsAt === 'end_of_season' ? 'custom_range' : duration),
        max_members: (format === 'nba_dfs' || format === 'wnba_dfs')
          ? (maxMembers ? parseInt(maxMembers, 10) : undefined)
          // Traditional fantasy uses numTeams as the hard cap (H2H schedule
          // needs it). Salary cap accepts an optional max from maxMembers,
          // empty = unlimited.
          : format === 'fantasy' && fantasyFormat === 'traditional' ? numTeams
          : format === 'fantasy' && fantasyFormat === 'salary_cap' ? (maxMembers ? parseInt(maxMembers, 10) : undefined)
          : maxMembers ? parseInt(maxMembers, 10) : undefined,
        starts_at: ['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point'].includes(format) ? getDfsStartDate()
          : (format === 'td_pass' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') && seasonType === 'custom_range' && nflContestStartDate ? new Date(`${nflContestStartDate}T00:00:00`).toISOString()
          : (format === 'td_pass' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') ? new Date().toISOString()
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : format === 'bracket' ? (locksAt ? new Date(locksAt).toISOString() : undefined)
          : startsAt || undefined,
        ends_at: (format === 'nba_dfs' || format === 'wnba_dfs' || format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'custom_range' ? (hrDerbyEndDate || undefined)
          : (format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'single_week' ? getNflWeekEnd()
          : (format === 'td_pass' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') ? getSeasonEndDate('americanfootball_nfl')
          : format === 'survivor' ? getSeasonEndDate(sport)
          : format === 'squares' && gameId ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : endsAt === 'end_of_season' ? getSeasonEndDate((format === 'nba_dfs' || format === 'three_point') ? 'basketball_nba' : (format === 'wnba_dfs' || format === 'wnba_three_point') ? 'basketball_wnba' : (format === 'mlb_dfs' || format === 'hr_derby' || format === 'strikeouts') ? 'baseball_mlb' : sport)
          // DFS and contest leagues with full_season auto-set ends_at to the
          // regular-season end. During NBA/MLB/etc. playoffs, extend through
          // the championship round so a mid-May "Full Season" pick means
          // "through the Finals", not "ended last month".
          : (isFantasyFormat && seasonType === 'full_season')
            ? getFullSeasonLeagueEndDate(
                (format === 'nba_dfs' || format === 'three_point') ? 'basketball_nba'
                : (format === 'wnba_dfs' || format === 'wnba_three_point') ? 'basketball_wnba'
                : (format === 'mlb_dfs' || format === 'hr_derby' || format === 'strikeouts') ? 'baseball_mlb'
                : 'americanfootball_nfl'
              )
          : endsAt || undefined,
        settings,
        fantasy_settings: fantasySettings,
        visibility,
        // Squares always locks at first pitch/tip-off. DFS-style formats
        // auto-lock at the league start so leagues don't stay joinable
        // after the contest begins. Other formats stay open until the
        // league starts; commissioners gate participation via max_members
        // rather than a separate close-to-joins time.
        joins_locked_at: format === 'squares' && gameId
          ? squaresGames?.find((g) => g.id === gameId)?.starts_at || undefined
          : ['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point'].includes(format)
            ? getDfsStartDate()
            : undefined,
        backdrop_image: backdropImage || undefined,
      })
      // Upload custom backdrop if selected
      if (customBackdropFile) {
        try {
          const formData = new FormData()
          formData.append('image', customBackdropFile)
          formData.append('league_id', league.id)
          await api.postForm('/backdrops/submit', formData)
          toast('League created! Backdrop submitted for review.', 'success')
        } catch {
          toast('League created! Backdrop upload failed — you can try again later.', 'success')
        }
      } else {
        toast('League created!', 'success')
      }
      navigate(`/leagues/${league.id}?invite=1`)
    } catch (err) {
      toast(err.message || 'Failed to create league', 'error')
    }
  }

  const autoSportFormats = ['nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'td_pass']
  const noDurationFormats = ['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'squares', 'bracket', 'td_pass', 'survivor']
  const canSubmit = name && format && (sport || autoSportFormats.includes(format)) && (noDurationFormats.includes(format) || duration)
    && (format !== 'bracket' || (templateId && locksAt))
    && (format !== 'squares' || gameId)

  // Surface the specific missing field so users aren't stuck staring at a
  // disabled Create button wondering why.
  function missingFieldHint() {
    if (!format) return 'Pick a format above.'
    if (!name) return 'Add a league name above.'
    if (!sport && !autoSportFormats.includes(format)) return 'Pick a sport above.'
    if (!noDurationFormats.includes(format) && !duration) return 'Pick a duration above.'
    if (format === 'bracket' && !templateId) return 'Pick a bracket template above.'
    if (format === 'bracket' && !locksAt) return 'Set the bracket lock date above.'
    if (format === 'squares' && !gameId) return 'Pick a game for your squares board above.'
    return null
  }

  return (
    <div className="max-w-2xl md:max-w-3xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-6">Create a League</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Format — grouped by sport category, top to bottom */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Format</label>

          <div className="space-y-8">
            {CATEGORIES
              .filter((cat) => cat.key !== 'soccer' || hasActiveSoccerBracket)
              // Hide entire category headers when every format inside has
              // been disabled by admin — avoids dangling empty sections.
              .filter((cat) => (CATEGORY_CARDS[cat.key] || []).some((c) => !disabledCardKeys.has(c.key)))
              .map((cat) => {
              const isCollapsed = collapsedCategories.has(cat.key)
              return (
              <div key={cat.key}>
                <button
                  type="button"
                  onClick={() => {
                    setCollapsedCategories((prev) => {
                      const next = new Set(prev)
                      if (next.has(cat.key)) next.delete(cat.key)
                      else next.add(cat.key)
                      return next
                    })
                  }}
                  className="flex items-center gap-2 mb-3 text-text-primary hover:text-accent transition-colors"
                  aria-expanded={!isCollapsed}
                >
                  <h2 className="font-display text-2xl md:text-3xl">{cat.label}</h2>
                  <svg
                    className={`w-4 h-4 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {!isCollapsed && (
                <div className="space-y-2">
                  {(CATEGORY_CARDS[cat.key] || []).filter((card) => !disabledCardKeys.has(card.key)).map((card) => {
                    const base = FORMAT_BY_VALUE[card.format] || {}
                    const label = card.label || base.label
                    const description = card.description || base.description
                    const details = card.details || base.details
                    // Per-card bonus tables override the base ones (used by
                    // fantasy: each fantasy card now has its own table).
                    const bonusTables = card.bonusTable
                      ? [card.bonusTable, card.bonusTable2].filter(Boolean)
                      : [base.bonusTable, base.bonusTable2].filter(Boolean)
                    const isExpanded = expandedCardKey === card.key
                    const isSelected = selectedCardKey === card.key
                    return (
                      <div
                        key={card.key}
                        className={`rounded-xl border transition-colors ${
                          isSelected
                            ? 'border-accent bg-accent/10'
                            : 'border-text-primary/20 hover:border-text-primary/40'
                        }`}
                      >
                  <div className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCardKey(card.key)
                        setFormat(card.format)
                        // A specific (non-'all') sport preset means the card
                        // locks the sport — hide the picker on the next render.
                        setSportPresetLocked(!!(card.preset?.sport && card.preset.sport !== 'all'))
                        if (card.preset?.sport !== undefined) setSport(card.preset.sport)
                        if (card.preset?.fantasyFormat) setFantasyFormat(card.preset.fantasyFormat)
                        if (card.preset?.survivorMode !== undefined) {
                          setSurvivorMode(card.preset.survivorMode)
                        } else if (card.format === 'survivor') {
                          // Generic Survivor (All Sports tab) defaults to standard mode.
                          setSurvivorMode('standard')
                        }
                        // Settings panel mounts on the next render once
                        // `format` is set — wait a frame, then scroll to it.
                        requestAnimationFrame(() => {
                          settingsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        })
                      }}
                      className="flex-1 text-left p-4 md:p-5 min-w-0"
                    >
                      <div className="font-semibold text-base md:text-lg text-text-primary">{label}</div>
                      <div className="text-sm md:text-base text-text-primary mt-1">{description}</div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setExpandedCardKey(isExpanded ? null : card.key)
                      }}
                      className="px-4 flex items-center text-text-muted hover:text-text-primary border-l border-text-primary/10 transition-colors"
                      aria-label={isExpanded ? 'Hide details' : 'Show details'}
                      aria-expanded={isExpanded}
                    >
                      <svg
                        className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="px-4 md:px-5 pb-4 md:pb-5 pt-3 text-sm md:text-base leading-relaxed text-text-primary border-t border-text-primary/10">
                      <div className="whitespace-pre-line">{details}</div>
                      {bonusTables.map((tbl) => {
                        const cols = tbl.columns || [
                          { key: 'size', label: 'League Size', align: 'left' },
                          { key: 'first', label: '1st', align: 'center', color: 'text-correct' },
                          { key: 'second', label: '2nd', align: 'center' },
                          { key: 'third', label: '3rd', align: 'center' },
                        ]
                        const gridStyle = { gridTemplateColumns: `repeat(${cols.length}, minmax(0, 1fr))` }
                        return (
                          <div key={tbl.title} className="mt-4 rounded-xl bg-bg-primary border border-text-primary/20 overflow-hidden">
                            <div className="px-4 py-3 border-b border-text-primary/20 text-sm md:text-base font-display text-text-primary">
                              {tbl.title}
                            </div>
                            {tbl.intro && (
                              <div className="px-4 py-3 text-sm md:text-base leading-7 text-text-primary border-b border-text-primary/20">
                                {tbl.intro}
                              </div>
                            )}
                            <div className="grid text-sm md:text-base" style={gridStyle}>
                              {cols.map((c) => (
                                <div key={c.key} className={`px-4 py-2 font-semibold text-text-primary ${c.align === 'center' ? 'text-center' : ''}`}>{c.label}</div>
                              ))}
                              {tbl.rows.map((r) => (
                                <div key={r.size} className="contents">
                                  {cols.map((c) => {
                                    const isFirstCol = c === cols[0]
                                    return (
                                      <div
                                        key={c.key}
                                        className={`px-4 py-2 border-t border-text-primary/10 ${c.align === 'center' ? 'text-center' : ''} ${c.color || 'text-text-primary'} ${!isFirstCol ? 'font-semibold tabular-nums' : ''}`}
                                      >
                                        {r[c.key]}
                                      </div>
                                    )
                                  })}
                                </div>
                              ))}
                            </div>
                            <div className="px-4 py-2 text-xs md:text-sm text-text-primary/70 border-t border-text-primary/10">
                              {tbl.footnote || 'Position points (n+1−2×rank) are still applied on top of these bonuses. Non-standard team counts use the closest configured size.'}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
          </div>
        </div>

        {/* Everything below the format picker only renders once a format is
            selected — no point asking for sport/duration/visibility before
            the user has decided what they're creating. */}
        {format && <>
        <div ref={settingsRef} aria-hidden="true" />

        {/* League Name */}
        <div>
          <label className="block text-base font-semibold text-text-primary mb-2">League Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Awesome League"
            maxLength={50}
            className="w-full bg-transparent border border-text-primary/20 rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>

        {/* Sport (hidden for format-locked sports + sport-locked survivor/pickem/bracket presets) */}
        {!['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'td_pass'].includes(format)
          && !((format === 'survivor' || format === 'pickem' || format === 'bracket') && sportPresetLocked) && <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Sport</label>
          <div className="flex gap-2 flex-wrap">
            {SPORT_OPTIONS.map((opt) => {
              // The 'fantasy' format (Traditional + Salary Cap Fantasy Football)
              // is NFL-only. NBA "fantasy" lives under format='nba_dfs', which
              // hides the sport picker entirely.
              const isFantasyLocked = format === 'fantasy' && opt.value !== 'americanfootball_nfl'
              // TD Survivor only works with NFL — gate every other sport out.
              const isTouchdownLocked = format === 'survivor' && survivorMode === 'touchdown' && opt.value !== 'americanfootball_nfl'
              // Squares needs a specific game, so the "All Sports" pill makes
              // no sense — gate it out when squares is selected.
              const isSquaresAllLocked = format === 'squares' && opt.value === 'all'
              const isLocked = isFantasyLocked || isTouchdownLocked || isSquaresAllLocked
              return (
              <button
                key={opt.value}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  setSport(opt.value)
                  // Snap pick_frequency to whatever this sport actually allows
                  const allowed = allowedFrequencies(opt.value)
                  if (allowed.length === 1) {
                    setPickFrequency(allowed[0])
                  } else if (allowed.length === 0) {
                    setPickFrequency('weekly')
                  } else if (!allowed.includes(pickFrequency)) {
                    setPickFrequency(allowed[0])
                  }
                }}
                className={`flex-shrink-0 px-4 py-2 rounded-lg border text-sm font-semibold transition-colors ${
                  sport === opt.value
                    ? 'bg-accent text-white border-accent'
                    : isLocked
                    ? 'border-text-primary/10 text-text-muted/30 cursor-not-allowed'
                    : 'border-text-primary/20 text-text-primary hover:border-text-primary/40'
                }`}
              >
                {opt.label}
              </button>
              )
            })}
          </div>
        </div>}

        {/* Duration (not for fantasy/DFS/squares/bracket — bracket runs from picks lock to championship game) */}
        {!['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'squares', 'bracket', 'td_pass', 'survivor'].includes(format) && <>
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">Duration</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {DURATION_OPTIONS.map((opt) => {
              // Auto-relabel "Full Season" to "Remainder of Regular Season"
              // once the sport's season is underway, so a mid-season league
              // create reads accurately.
              const label = opt.value === 'full_season' && isSeasonUnderway(sport)
                ? 'Remainder of Regular Season'
                : opt.label
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDuration(opt.value)}
                  className={`px-3 py-2.5 rounded-lg border text-xs sm:text-sm font-semibold transition-colors ${
                    duration === opt.value
                      ? 'bg-accent text-white border-accent'
                      : 'border-text-primary/20 text-text-primary hover:border-text-primary/40'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Custom date range */}
        {duration === 'custom_range' && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">Start Date</label>
              <input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-text-secondary mb-2">End Date</label>
              <div className="flex gap-2 mb-2">
                <button
                  type="button"
                  onClick={() => setEndsAt('end_of_season')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    endsAt === 'end_of_season' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  {isSeasonUnderway(sport) ? 'Remainder of Regular Season' : 'Full Season'}
                </button>
                <button
                  type="button"
                  onClick={() => setEndsAt('')}
                  className={`flex-1 py-2.5 rounded-lg text-xs font-semibold transition-colors ${
                    endsAt !== 'end_of_season' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  Custom Date
                </button>
              </div>
              {endsAt !== 'end_of_season' && (
                <>
                  <input
                    type="date"
                    value={endsAt}
                    max={sport && sport !== 'all' ? getSeasonEndDate(sport) : undefined}
                    onChange={(e) => setEndsAt(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                  />
                  {sport && sport !== 'all' && (
                    <p className="text-xs text-text-muted mt-1">Capped at the {sport.split('_').pop().toUpperCase()} regular-season end ({new Date(getSeasonEndDate(sport)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}).</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Start date for non-custom durations (this_week, full_season, playoffs_only) */}
        {duration && duration !== 'custom_range' && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">Start Date</label>
            <input
              type="date"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
            />
            <p className="text-xs text-text-muted mt-1">When members can start making picks. Leave blank to start today.</p>
          </div>
        )}
        </>}

        {/* Max Members — only standalone for formats without their own settings section */}
        {!['fantasy', 'nba_dfs', 'wnba_dfs', 'mlb_dfs', 'hr_derby', 'strikeouts', 'three_point', 'wnba_three_point', 'sacks', 'ints', 'tackles', 'receptions', 'pickem', 'survivor', 'squares', 'td_pass'].includes(format) && <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">
            Max Members <span className="text-text-muted font-normal">(optional)</span>
          </label>
          <input
            type="number"
            value={maxMembers}
            onChange={(e) => setMaxMembers(e.target.value)}
            placeholder="No limit"
            min={2}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
          />
        </div>}

        {/* Format-specific settings */}
        {format === 'pickem' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Pick'em Settings</h3>
            {/* NFL is always weekly — skip the picker since it'd be a single
                disabled option. Other sports (NBA / MLB / all-sports) keep
                the choice. */}
            {sport !== 'americanfootball_nfl' && (
              <div>
                <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
                <div className="flex gap-2">
                  {['daily', 'weekly'].map((value) => {
                    const isAllowed = allowedFrequencies(sport).includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!isAllowed}
                        onClick={() => setPickFrequency(value)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          pickFrequency === value
                            ? 'bg-accent text-white'
                            : isAllowed
                              ? 'bg-bg-input text-text-secondary'
                              : 'bg-bg-input/50 text-text-muted opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {value === 'weekly' ? 'Weekly' : 'Daily'}
                      </button>
                    )
                  })}
                </div>
                {pickFrequency === 'daily' && (
                  <div className="text-[10px] text-text-muted mt-1">Periods are days instead of weeks</div>
                )}
                {allowedFrequencies(sport).length === 1 && (
                  <div className="text-[10px] text-text-muted mt-1">
                    This sport only supports {allowedFrequencies(sport)[0]} picks.
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Games per {pickFrequency === 'daily' ? 'day' : 'week'} <span className="text-text-muted">(leave empty for all games)</span>
              </label>
              <input
                type="number"
                value={gamesPerWeek}
                onChange={(e) => setGamesPerWeek(e.target.value)}
                placeholder="All games"
                min={1}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">Lock Odds</label>
              <div className="flex gap-2">
                {[
                  { value: 'game_start', label: 'At Game Start' },
                  { value: 'submission', label: 'At Submission' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLockOddsAt(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      lockOddsAt === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-text-muted mt-1">
                {lockOddsAt === 'submission'
                  ? 'Standings use odds from when each pick was submitted'
                  : 'Standings use odds from when the game starts (default)'}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members <span className="text-text-muted">(optional)</span></label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'fantasy' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">
              {fantasyFormat === 'salary_cap' ? 'Salary Cap Fantasy Settings' : 'Traditional Fantasy Settings'}
            </h3>

            {/* If user picked Traditional but the season is already underway,
                we silently auto-flipped them to salary_cap above — surface a
                note so they understand why the panel below is the salary
                cap configuration, not the traditional one they selected. */}
            {selectedCardKey === 'fantasy-traditional' && traditionalLocked && fantasyFormat === 'salary_cap' && (
              <p className="text-[11px] text-yellow-500 leading-relaxed">
                Traditional fantasy can only be created before the NFL season opens. The season is already underway — switched to Salary Cap automatically.
              </p>
            )}

            {/* Traditional: fixed team count drives the H2H schedule, so it's
                a pill picker. Salary cap is points-based and has no schedule,
                so we only ask for an optional cap. */}
            {fantasyFormat === 'traditional' ? (
              <div>
                <label className="text-xs text-text-muted block mb-1">Number of Teams</label>
                <div className="flex gap-2 flex-wrap">
                  {[6, 8, 10, 12, 14, 16, 20].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNumTeams(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        numTeams === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-text-muted block mb-1">
                  Max Teams <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  type="number"
                  value={maxMembers}
                  onChange={(e) => setMaxMembers(e.target.value)}
                  placeholder="No limit"
                  min={2}
                  className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
                />
                <p className="text-[10px] text-text-muted mt-1">Leave blank to allow unlimited members.</p>
              </div>
            )}

            {/* Salary Cap specific settings */}
            {fantasyFormat === 'salary_cap' && (
              <>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
                  <div className="flex gap-2">
                    {[50000, 60000, 75000].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setSalaryCap(n)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                        }`}
                      >
                        ${n.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-text-muted block mb-1">Season Type</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'full_season', label: isSeasonUnderway(sport) ? 'Remainder of Regular Season' : 'Full Season' },
                      // Salary cap single-week leagues are always "this NFL week" —
                      // server resolves to the current NFL week at creation, no
                      // user picker. NBA / WNBA single night still uses a date picker.
                      { value: 'single_week', label: sport === 'basketball_nba' ? 'Single Night' : (fantasyFormat === 'salary_cap' ? 'This Week' : 'Single Week') },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setSeasonType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                {seasonType === 'single_week' && fantasyFormat !== 'salary_cap' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">{sport === 'basketball_nba' ? 'Game Date' : 'NFL Week'}</label>
                    <div className="flex gap-1 flex-wrap">
                      {Array.from({ length: 18 }, (_, i) => i + 1).map((w) => (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setSingleWeek(w)}
                          className={`w-9 h-9 rounded-lg text-xs font-semibold transition-colors ${
                            singleWeek === w ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {w}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {seasonType === 'full_season' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Champion Determined By</label>
                    <div className="flex gap-2">
                      {[
                        { value: 'total_points', label: 'Most Total Points' },
                        { value: 'most_wins', label: 'Most Weekly Wins' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setChampionMetric(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            championMetric === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Roster Settings (traditional only — salary cap doesn't draft) */}
            {fantasyFormat === 'traditional' && (
              <div>
                <label className="text-sm font-bold uppercase tracking-wider text-text-primary block mb-2">Roster Settings</label>
                <RosterSettingsEditor value={rosterSlots} onChange={setRosterSlots} />
              </div>
            )}

            {/* Scoring */}
            {fantasyFormat === 'traditional' ? (
              // Traditional: ScoringRulesEditor is the single source of truth.
              // It has its own preset picker (PPR/Half/Std/Custom), so the
              // outer Scoring Format buttons would be redundant.
              <div>
                <label className="text-sm font-bold uppercase tracking-wider text-text-primary block mb-2">Scoring Settings</label>
                <ScoringRulesEditor
                  value={scoringRules}
                  onChange={setScoringRules}
                  defenseMode={
                    ((rosterSlots.dl || 0) + (rosterSlots.lb || 0) + (rosterSlots.db || 0) + (rosterSlots.s || 0)) > 0
                      ? 'idp'
                      : 'def'
                  }
                />
              </div>
            ) : (
              // Salary Cap is locked to Half PPR because the salary algorithm
              // is calibrated against it — full PPR would systematically
              // underprice high-target pass catchers.
              <div>
                <label className="text-xs text-text-muted block mb-1">Scoring</label>
                <div className="rounded-lg bg-bg-secondary px-3 py-2 text-xs text-text-secondary">
                  Half PPR (locked) — used by the salary cap algorithm
                </div>
              </div>
            )}
            {/* Traditional-only settings */}
            {fantasyFormat === 'traditional' && <>
            <div>
              <label className="text-sm font-bold uppercase tracking-wider text-text-primary block mb-2">Draft</label>
              <div className="space-y-3 rounded-xl border border-text-primary/20 p-4 bg-bg-primary/40">
                <div>
                  <label className="text-xs text-text-muted block mb-1">Type</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'live', label: 'Online Draft' },
                      { value: 'offline', label: 'Offline Draft' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setDraftMode(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                          draftMode === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-text-muted mt-1">
                    {draftMode === 'live'
                      ? 'Everyone drafts in real time with a pick timer. Auto-pick fills in if the clock runs out.'
                      : 'Draft in person, then the commissioner enters the results. No timers or auto-pick.'}
                  </p>
                </div>
                {draftMode === 'live' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Pick Timer</label>
                    <div className="flex gap-2">
                      {[
                        { value: 60, label: '60s' },
                        { value: 90, label: '90s' },
                        { value: 120, label: '2min' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setDraftPickTimer(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            draftPickTimer === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div>
                  <label className="text-xs text-text-muted block mb-1">Date and Time</label>
                  <input
                    type="datetime-local"
                    value={draftDate}
                    onChange={(e) => setDraftDate(e.target.value)}
                    className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent appearance-none [-webkit-appearance:none]"
                  />
                  <p className="text-[10px] text-text-muted mt-1">
                    {draftMode === 'live'
                      ? 'Pick the moment you want the draft to start. Every member sees this in their own local timezone. Leave blank to start the draft manually.'
                      : 'When is the in-person draft? This is displayed to your league members.'}
                  </p>
                </div>
                {draftMode === 'offline' && (
                  <div>
                    <label className="text-xs text-text-muted block mb-1">Location (optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Mike's house, Buffalo Wild Wings"
                      value={draftLocation}
                      onChange={(e) => setDraftLocation(e.target.value)}
                      className="w-full bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Waiver System</label>
              <div className="flex gap-2">
                {[
                  { value: 'priority', label: 'Priority' },
                  { value: 'rolling', label: 'Rolling' },
                  { value: 'faab', label: 'FAAB' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setWaiverType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      waiverType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {waiverType === 'faab' && (
                <div className="mt-2">
                  <label className="text-[10px] text-text-muted block mb-1">Starting FAAB Budget</label>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={faabStartingBudget}
                    onChange={(e) => setFaabStartingBudget(parseInt(e.target.value, 10) || 100)}
                    className="w-32 bg-bg-secondary border border-text-primary/20 rounded-lg px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Trade Review</label>
              <div className="flex gap-2">
                {[
                  { value: 'commissioner', label: 'Commissioner' },
                  { value: 'none', label: 'None' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTradeReview(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      tradeReview === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Playoff Teams</label>
              <div className="flex gap-2">
                {[4, 6, 8].map((n) => {
                  // Can't have more playoff teams than total teams in the league.
                  const isDisabled = n > numTeams
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => { setPlayoffTeams(n); setPlayoffTeamsManuallySet(true) }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        isDisabled
                          ? 'bg-bg-secondary/40 text-text-muted/40 cursor-not-allowed'
                          : playoffTeams === n
                            ? 'bg-accent text-white'
                            : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      Top {n}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Championship Week</label>
              <div className="flex gap-2">
                {[17, 18].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setChampionshipWeek(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      championshipWeek === w ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    Wk {w}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-text-muted mt-1">
                Playoffs start Week {playoffStartWeek}. Week 17 championship dodges the Week 18 starter-rest lottery.
              </p>
            </div>
            </>}
          </div>
        )}

        {format === 'nba_dfs' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">NBA Daily Fantasy Settings</h3>
            <div>
              <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
              <div className="flex gap-2">
                {[50000, 60000, 75000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSalaryCap(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    ${n.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">League Starts</label>
              <div className="flex gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: 'custom', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDfsStartOption(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      dfsStartOption === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dfsStartOption === 'custom' && (
                <input
                  type="date"
                  value={dfsStartCustom}
                  onChange={(e) => setDfsStartCustom(e.target.value)}
                  min={todaySportsDay()}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {visibility === 'open'
                  ? 'League is open until the first game on this date. Rosters lock at first tip-off each day.'
                  : 'Members cannot join after this date. Rosters lock at first tip-off each day.'}
              </p>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">League Length</label>
              <div className="flex gap-2">
                {[
                  {
                    value: 'full_season',
                    label: arePlayoffsUnderway('basketball_nba')
                      ? getPlayoffsButtonLabel('basketball_nba')
                      : isSeasonUnderway('basketball_nba')
                        ? 'Remainder of Regular Season'
                        : 'Full Season',
                  },
                  { value: 'custom_range', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeasonType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {seasonType === 'custom_range' && (
                <input
                  type="date"
                  value={hrDerbyEndDate}
                  onChange={(e) => setHrDerbyEndDate(e.target.value)}
                  min={getDfsStartDate()}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {seasonType === 'custom_range'
                  ? 'Pick the date your league wraps up.'
                  : arePlayoffsUnderway('basketball_nba')
                    ? getPlayoffsHelperText('basketball_nba')
                    : 'Runs through end of NBA regular season.'}
              </p>
            </div>
            {seasonType === 'full_season' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Champion Determined By</label>
                <div className="flex gap-2">
                  {[
                    { value: 'total_points', label: 'Most Total Points' },
                    { value: 'most_wins', label: 'Most Nightly Wins' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChampionMetric(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        championMetric === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'wnba_dfs' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">WNBA Daily Fantasy Settings</h3>
            <div>
              <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
              <div className="flex gap-2">
                {[50000, 60000, 75000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSalaryCap(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    ${n.toLocaleString()}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">League Starts</label>
              <div className="flex gap-2">
                {[
                  { value: 'today', label: 'Today' },
                  { value: 'tomorrow', label: 'Tomorrow' },
                  { value: 'custom', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setDfsStartOption(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      dfsStartOption === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {dfsStartOption === 'custom' && (
                <input
                  type="date"
                  value={dfsStartCustom}
                  onChange={(e) => setDfsStartCustom(e.target.value)}
                  min={todaySportsDay()}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {visibility === 'open'
                  ? 'League is open until the first game on this date. Rosters lock at first tip-off each day.'
                  : 'Members cannot join after this date. Rosters lock at first tip-off each day.'}
              </p>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">League Length</label>
              <div className="flex gap-2">
                {[
                  {
                    value: 'full_season',
                    label: arePlayoffsUnderway('basketball_wnba')
                      ? getPlayoffsButtonLabel('basketball_wnba')
                      : isSeasonUnderway('basketball_wnba')
                        ? 'Remainder of Regular Season'
                        : 'Full Season',
                  },
                  { value: 'custom_range', label: 'Select Date' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeasonType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {seasonType === 'custom_range' && (
                <input
                  type="date"
                  value={hrDerbyEndDate}
                  onChange={(e) => setHrDerbyEndDate(e.target.value)}
                  min={getDfsStartDate()}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {seasonType === 'custom_range'
                  ? 'Pick the date your league wraps up.'
                  : arePlayoffsUnderway('basketball_wnba')
                    ? getPlayoffsHelperText('basketball_wnba')
                    : 'Runs through end of WNBA regular season.'}
              </p>
            </div>
            {seasonType === 'full_season' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Champion Determined By</label>
                <div className="flex gap-2">
                  {[
                    { value: 'total_points', label: 'Most Total Points' },
                    { value: 'most_wins', label: 'Most Nightly Wins' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChampionMetric(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        championMetric === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {(format === 'mlb_dfs' || format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">
              {format === 'mlb_dfs' ? 'MLB Daily Fantasy Settings'
                : format === 'three_point' ? 'NBA 3-Point Contest Settings'
                : format === 'wnba_three_point' ? 'WNBA 3-Point Contest Settings'
                : format === 'sacks' ? 'Sacks Contest Settings'
                : format === 'ints' ? 'Interceptions Contest Settings'
                : format === 'tackles' ? 'Tackles Contest Settings'
                : format === 'receptions' ? 'Receptions Contest Settings'
                : format === 'strikeouts' ? 'Strikeouts Contest Settings'
                : format === 'td_pass' ? 'TD Pass Competition Settings'
                : 'Home Run Derby Settings'}
            </h3>
            {format === 'mlb_dfs' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">Salary Cap</label>
                <div className="flex gap-2">
                  {[40000, 45000, 50000].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setSalaryCap(n)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        salaryCap === n ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      ${n.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {format !== 'sacks' && format !== 'ints' && format !== 'tackles' && format !== 'receptions' && format !== 'td_pass' && (
              <div>
                <label className="text-xs text-text-muted block mb-1">League Starts</label>
                {/* note: HR Derby / 3-Point Contest / Strikeouts / MLB DFS all use this picker */}
                <div className="flex gap-2">
                  {[
                    { value: 'today', label: 'Today' },
                    { value: 'tomorrow', label: 'Tomorrow' },
                    { value: 'custom', label: 'Select Date' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDfsStartOption(opt.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        dfsStartOption === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {dfsStartOption === 'custom' && (
                  <input
                    type="date"
                    value={dfsStartCustom}
                    onChange={(e) => setDfsStartCustom(e.target.value)}
                    min={todaySportsDay()}
                    className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                  />
                )}
              </div>
            )}
            <div>
              <label className="text-xs text-text-muted block mb-1">
                {(format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') ? 'League Length' : 'Season Type'}
              </label>
              <div className="flex gap-2">
                {(() => {
                  // Label morphs across three states: preseason ("Full Season"),
                  // regular season ("Remainder of Regular Season"), and playoffs
                  // ("Through the Finals" / "Through the World Series" / etc.)
                  //
                  // NFL contest formats (td_pass / sacks / ints / tackles /
                  // receptions) END at regular-season end — see ends_at logic
                  // above (line 991). They can't extend through playoffs
                  // because you can't repeat players (the qb / sack / int /
                  // tackle / reception pool shrinks every week). So they
                  // NEVER show the "Through the Super Bowl" playoff label —
                  // would be misleading since the contest actually ends Jan 5.
                  const isNflContest = format === 'td_pass' || format === 'sacks'
                    || format === 'ints' || format === 'tackles' || format === 'receptions'
                  // NFL contests only care about regular season — never
                  // playoffs. Also intentionally ignore arePlayoffsUnderway
                  // here because that helper currently returns true during
                  // the entire offseason (bug: only checks now <= playoffEnd,
                  // not now >= regular-season-end), which would flip the
                  // preseason label from "Full Season" to "Remainder of
                  // Regular Season" incorrectly.
                  const fullSeasonLabel = isNflContest
                    ? (isSeasonUnderway(sport)
                        ? 'Remainder of Regular Season'
                        : 'Full Season')
                    : arePlayoffsUnderway(sport)
                      ? getPlayoffsButtonLabel(sport)
                      : isSeasonUnderway(sport)
                        ? 'Remainder of Regular Season'
                        : 'Full Season'
                  if (format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') {
                    // NFL weekly contests get a "This Week Only" middle option;
                    // daily contests (hr_derby / strikeouts / 3-point) don't.
                    if (format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') {
                      return [
                        { value: 'full_season', label: fullSeasonLabel },
                        { value: 'single_week', label: 'This Week Only' },
                        { value: 'custom_range', label: 'Select Date' },
                      ]
                    }
                    return [
                      { value: 'full_season', label: fullSeasonLabel },
                      { value: 'custom_range', label: 'Select Date' },
                    ]
                  }
                  return [
                    { value: 'full_season', label: fullSeasonLabel },
                    { value: 'single_week', label: 'Single Night' },
                  ]
                })().map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSeasonType(opt.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                      seasonType === opt.value ? 'bg-accent text-white' : 'bg-bg-secondary text-text-secondary hover:bg-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {(format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'custom_range' && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1">Starts</label>
                    <input
                      type="date"
                      value={nflContestStartDate}
                      onChange={(e) => setNflContestStartDate(e.target.value)}
                      min={todaySportsDay()}
                      className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-text-muted block mb-1">Ends</label>
                    <input
                      type="date"
                      value={hrDerbyEndDate}
                      onChange={(e) => setHrDerbyEndDate(e.target.value)}
                      min={nflContestStartDate || todaySportsDay()}
                      className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              )}
              {(format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point') && seasonType === 'custom_range' && (
                <input
                  type="date"
                  value={hrDerbyEndDate}
                  onChange={(e) => setHrDerbyEndDate(e.target.value)}
                  min={getDfsStartDate()}
                  className="mt-2 w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary focus:outline-none focus:border-accent"
                />
              )}
              <p className="text-xs text-text-muted mt-1.5">
                {(() => {
                  if ((format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'custom_range') {
                    return 'Pick a start date (optional) and the date your league wraps up.'
                  }
                  if ((format === 'hr_derby' || format === 'strikeouts' || format === 'three_point' || format === 'wnba_three_point') && seasonType === 'custom_range') {
                    return 'Pick the date your league wraps up.'
                  }
                  if ((format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') && seasonType === 'single_week') {
                    return 'Runs through this week’s Monday Night Football.'
                  }
                  if (seasonType === 'full_season') {
                    // Map format → implied sport so playoff-state copy stays
                    // accurate. NFL contests are NFL-implied, NBA 3-point is
                    // NBA-implied, etc.
                    const impliedSport = format === 'three_point' ? 'basketball_nba'
                      : format === 'wnba_three_point' ? 'basketball_wnba'
                      : (format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions' || format === 'td_pass') ? 'americanfootball_nfl'
                      : 'baseball_mlb' // mlb_dfs / hr_derby / strikeouts
                    if (arePlayoffsUnderway(impliedSport)) {
                      return getPlayoffsHelperText(impliedSport)
                    }
                    if (impliedSport === 'basketball_nba') return 'Runs through end of NBA regular season.'
                    if (impliedSport === 'basketball_wnba') return 'Runs through end of WNBA regular season.'
                    if (impliedSport === 'americanfootball_nfl') return 'Runs through end of NFL regular season.'
                    return 'Runs through end of MLB regular season.'
                  }
                  return 'One night only — highest score wins.'
                })()}
              </p>
            </div>
            {(format === 'hr_derby' || format === 'three_point' || format === 'wnba_three_point' || format === 'strikeouts' || format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions') && (() => {
              const isNflContest = format === 'sacks' || format === 'ints' || format === 'tackles' || format === 'receptions'
              const nflPlayerNoun = format === 'receptions' ? 'pass catcher' : 'defender'
              const reuseOptions = isNflContest
                ? [
                    { value: '1', label: '1x' },
                    { value: '2', label: '2x' },
                    { value: '3', label: '3x' },
                    { value: '4', label: '4x' },
                    { value: 'unlimited', label: 'Unlimited' },
                  ]
                : [
                    { value: 'weekly', label: 'Once per Week' },
                    { value: 'unlimited', label: 'Unlimited' },
                  ]
              const playerNoun = format === 'strikeouts' ? 'pitcher'
                : format === 'hr_derby' ? 'hitter'
                : 'player'
              const cadenceNoun = format === 'strikeouts' ? 'days' : 'nights'
              // Map legacy 'season' value to '1' for display purposes
              const nflMaxUses = pickReuse === 'season' ? '1' : pickReuse
              // For single-week NFL contests, reuse caps are meaningless
              // (everyone picks once, league ends). Grey the picker out.
              const reuseDisabled = isNflContest && seasonType === 'single_week'
              const helper = reuseDisabled
                ? 'Not applicable for a single-week league — each player only gets used once.'
                : isNflContest
                  ? (pickReuse === 'unlimited'
                      ? `No reuse limit — pick the same ${nflPlayerNoun} as many weeks as you want.`
                      : nflMaxUses === '1'
                        ? `Each ${nflPlayerNoun} can only be used once all season.`
                        : `Each ${nflPlayerNoun} can be used up to ${nflMaxUses} times this season.`)
                  : (pickReuse === 'weekly'
                      ? `Each ${playerNoun} can only be used once per Mon-Sun week.`
                      : `No reuse limit — pick the same ${playerNoun} on back-to-back ${cadenceNoun}.`)
              return (
                <div className={reuseDisabled ? 'opacity-50' : ''}>
                  <label className="text-xs text-text-muted block mb-1">
                    {isNflContest ? `Max Uses per ${nflPlayerNoun === 'pass catcher' ? 'Pass Catcher' : 'Defender'}` : 'Player Reuse'}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {reuseOptions.map((opt) => {
                      // Legacy 'season' value for NFL contests was equivalent to '1'
                      const isActive = pickReuse === opt.value || (isNflContest && opt.value === '1' && pickReuse === 'season')
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          disabled={reuseDisabled}
                          onClick={() => setPickReuse(opt.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                            reuseDisabled
                              ? 'bg-bg-secondary/40 text-text-muted cursor-not-allowed'
                              : isActive
                                ? 'bg-accent text-white'
                                : 'bg-bg-secondary text-text-secondary hover:bg-border'
                          }`}
                        >
                          {opt.label}
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-text-muted mt-1.5">{helper}</p>
                </div>
              )
            })()}
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members</label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
          </div>
        )}

        {format === 'survivor' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">
              {survivorMode === 'touchdown' ? 'TD Survivor Settings' : 'Survivor Settings'}
            </h3>
            <p className="text-[11px] text-text-muted leading-relaxed -mt-2">
              {survivorMode === 'touchdown'
                ? "Pick one NFL player per week to score a rushing, receiving, or return TD. Can't reuse players."
                : 'Pick one team per period to win. If they lose, you lose a life.'}
            </p>
            <div>
              <label className="block text-xs text-text-muted mb-2">Lives</label>
              <div className="flex gap-2">
                {[1, 2].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setLives(n)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      lives === n ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {n} {n === 1 ? 'Life' : 'Lives'}
                  </button>
                ))}
              </div>
            </div>
            {/* NFL is always weekly. Skip the picker since it'd be a single
                disabled option, which is just noise. */}
            {sport !== 'americanfootball_nfl' && (
              <div>
                <label className="block text-xs text-text-muted mb-2">Pick Frequency</label>
                <div className="flex gap-2">
                  {['daily', 'weekly'].map((value) => {
                    const isAllowed = allowedFrequencies(sport).includes(value)
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={!isAllowed}
                        onClick={() => setPickFrequency(value)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                          pickFrequency === value
                            ? 'bg-accent text-white'
                            : isAllowed
                              ? 'bg-bg-input text-text-secondary'
                              : 'bg-bg-input/50 text-text-muted opacity-50 cursor-not-allowed'
                        }`}
                      >
                        {value === 'weekly' ? 'Weekly' : 'Daily'}
                      </button>
                    )
                  })}
                </div>
                {pickFrequency === 'daily' && (
                  <div className="text-[10px] text-text-muted mt-1">One pick per day instead of per week</div>
                )}
                {allowedFrequencies(sport).length === 1 && (
                  <div className="text-[10px] text-text-muted mt-1">
                    This sport only supports {allowedFrequencies(sport)[0]} picks.
                  </div>
                )}
              </div>
            )}
            <div className="flex items-center justify-between">
              <label className="text-xs text-text-muted">
                If all eliminated in same {pickFrequency === 'daily' ? 'day' : 'week'}, all survive
              </label>
              <button
                type="button"
                onClick={() => setAllEliminatedSurvive(!allEliminatedSurvive)}
                className={`w-10 h-6 rounded-full transition-colors ${
                  allEliminatedSurvive ? 'bg-accent' : 'bg-bg-input'
                }`}
              >
                <div className={`w-4 h-4 rounded-full bg-white transition-transform mx-1 ${
                  allEliminatedSurvive ? 'translate-x-4' : ''
                }`} />
              </button>
            </div>
            <div>
              <label className="text-xs text-text-muted block mb-1">Max Members <span className="text-text-muted">(optional)</span></label>
              <input
                type="number"
                value={maxMembers}
                onChange={(e) => setMaxMembers(e.target.value)}
                placeholder="No limit"
                min={2}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
            </div>
            {survivorMode !== 'touchdown' && (() => {
              // Football survivor (NFL / NCAAF) never asks for a start date —
              // there's exactly one correct answer (first kickoff of the
              // upcoming week), and the server fills it in. Show a note in
              // white instead. MLB / NBA / WNBA keep the manual date input
              // because their seasons have staggered starts and daily-vs-
              // weekly cadence choice.
              const isFootball = sport === 'americanfootball_nfl' || sport === 'americanfootball_ncaaf'
              if (isFootball) {
                const sportLabel = sport === 'americanfootball_nfl' ? 'NFL' : 'college football'
                const noteText = isSeasonUnderway(sport)
                  ? `Runs through the remainder of the ${sportLabel} regular season. Preseason and playoffs excluded.`
                  : `Runs the full ${sportLabel} regular season, starting at the first kickoff of Week 1. Preseason and playoffs excluded.`
                return (
                  <p className="text-sm text-white leading-relaxed">{noteText}</p>
                )
              }
              return (
                <div>
                  <label className="text-xs text-text-muted block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={startsAt}
                    onChange={(e) => setStartsAt(e.target.value)}
                    className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Defaults to today if left blank. League runs until there's one survivor left or the end of the season.</p>
                </div>
              )
            })()}
            {survivorMode === 'touchdown' && (
              <p className="text-sm text-white">League starts at the next NFL kickoff and runs until there's one survivor left or the end of the season.</p>
            )}
          </div>
        )}

        {format === 'squares' && (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Squares Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Game Date</label>
              {sport === 'all' ? (
                <div className="text-xs text-text-muted">Select a specific sport above to pick a game.</div>
              ) : (
                <>
                  <input
                    type="date"
                    value={squaresDate}
                    onChange={(e) => { setSquaresDate(e.target.value); setGameId('') }}
                    min={todaySportsDay()}
                    className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent mb-3"
                  />
                  {squaresDate && squaresGames.length > 0 ? (
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {squaresGames.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => {
                        setGameId(g.id)
                        setRowTeamName(g.away_team)
                        setColTeamName(g.home_team)
                      }}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        gameId === g.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      <div className="font-semibold text-sm">{g.away_team} @ {g.home_team}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {new Date(g.starts_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </button>
                  ))}
                </div>
              ) : squaresDate ? (
                <div className="text-xs text-text-muted">No games found on this date for the selected sport.</div>
              ) : null}
                </>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">How do you want users to claim squares?</label>
              <div className="flex gap-2">
                {[
                  { value: 'self_select', label: 'Self-Select' },
                  { value: 'random', label: 'Random' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAssignmentMethod(opt.value)}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                      assignmentMethod === opt.value ? 'bg-accent text-white' : 'bg-bg-input text-text-secondary'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-text-muted mb-2">
                Row = away team, column = home team. Order matters — quarter scoring uses the away team's last digit for the row and the home team's for the column.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-muted mb-1">Away Team <span className="text-text-muted/70">(Row)</span></label>
                  <TeamNameAutocomplete
                    value={rowTeamName}
                    onChange={setRowTeamName}
                    placeholder="Away team"
                    teams={squaresTeams}
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-muted mb-1">Home Team <span className="text-text-muted/70">(Column)</span></label>
                  <TeamNameAutocomplete
                    value={colTeamName}
                    onChange={setColTeamName}
                    placeholder="Home team"
                    teams={squaresTeams}
                  />
                </div>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-2">Points per Quarter</label>
              <div className="grid grid-cols-4 gap-2">
                {['Q1', 'Q2', 'Q3', 'Q4'].map((label, i) => (
                  <div key={label}>
                    <div className="text-xs text-text-muted text-center mb-1">{label}</div>
                    <input
                      type="number"
                      value={pointsPerQuarter[i]}
                      onChange={(e) => {
                        const next = [...pointsPerQuarter]
                        next[i] = parseInt(e.target.value, 10) || 0
                        setPointsPerQuarter(next)
                      }}
                      min={0}
                      className="w-full bg-bg-input border border-border rounded-lg px-3 py-2 text-sm text-center text-text-primary focus:outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>
              {(() => {
                const total = pointsPerQuarter.reduce((sum, q) => sum + (q || 0), 0)
                if (!total) return null
                return (
                  <div className="mt-2 text-xs text-text-muted text-center">
                    Total: <span className="text-text-primary font-semibold">{total} pts</span> across 4 quarters · <span className="text-accent font-semibold">{(total / 100).toFixed(total % 100 === 0 ? 0 : 1)} pts</span> per square
                  </div>
                )
              })()}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">Max Squares per User</label>
              <input
                type="number"
                value={maxSquaresPerUser}
                onChange={(e) => setMaxSquaresPerUser(e.target.value)}
                min={1}
                max={100}
                placeholder="No limit"
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-accent"
              />
              <p className="text-[10px] text-text-muted mt-1">Leave blank for unlimited</p>
            </div>
          </div>
        )}

        {format === 'bracket' && (() => {
          // Split into still-pickable templates vs finalized ones. The signal
          // is championship_score_set — set by the admin via "Save championship
          // total" when the tournament concludes. Pre-launch templates (e.g.
          // World Cup Bracket built before the group stage finishes) and
          // mid-tournament ones both show as available; only finalized ones
          // collapse into the "Past Brackets" section.
          // (Earlier code checked t.locks_at which doesn't exist on templates —
          // it's a per-tournament field — so every template was incorrectly
          // classified as available.)
          const available = (bracketTemplates || []).filter((t) => !t.championship_score_set)
          const past = (bracketTemplates || []).filter((t) => t.championship_score_set)
          return (
          <div className="rounded-xl border border-text-primary/20 p-4 space-y-4">
            <h3 className="font-display text-sm text-text-primary mb-1">Bracket Settings</h3>
            <div>
              <label className="block text-xs text-text-muted mb-2">Tournament Template</label>
              {available.length > 0 ? (
                <div className="space-y-1">
                  {available.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplateId(t.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-colors ${
                        templateId === t.id
                          ? 'border-accent bg-accent/10'
                          : 'border-border bg-bg-primary hover:bg-bg-card-hover'
                      }`}
                    >
                      <div className="font-semibold text-sm">{t.name}</div>
                      <div className="text-xs text-text-muted mt-0.5">
                        {t.team_count} teams &middot; {t.rounds?.length || 0} rounds
                        {t.description && ` — ${t.description}`}
                      </div>
                      {t.picks_available_at && (
                        <div className="text-xs text-accent mt-1">
                          Picks open {new Date(t.picks_available_at).toLocaleString('en-US', {
                            month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-text-primary/15 bg-bg-primary/50 p-3 text-xs text-text-secondary leading-relaxed">
                  No bracket tournaments are currently open{sport !== 'all' ? ' for this sport' : ''}. New tournaments are added as each major postseason kicks off — NCAA Tournament in March, NBA + NHL Playoffs in April, MLB + WNBA Playoffs in October, NFL Playoffs in January.
                </div>
              )}
              {past.length > 0 && (
                <div className="mt-4 pt-3 border-t border-text-primary/10">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">Past Brackets</div>
                  <div className="space-y-1">
                    {past.map((t) => (
                      <div
                        key={t.id}
                        className="w-full text-left p-3 rounded-xl border border-text-primary/10 bg-bg-primary/30 opacity-60"
                      >
                        <div className="font-semibold text-sm text-text-secondary">{t.name}</div>
                        <div className="text-xs text-text-muted mt-0.5">
                          {t.team_count} teams &middot; settled
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">
                Bracket Lock Date/Time <span className="text-incorrect">*</span>
              </label>
              <input
                type="datetime-local"
                value={locksAt}
                onChange={(e) => setLocksAt(e.target.value)}
                className="w-full bg-bg-input border border-border rounded-lg px-4 py-2.5 text-sm text-text-primary focus:outline-none focus:border-accent"
              />
              <div className="text-[10px] text-text-muted mt-1">
                Users must submit brackets before this time
              </div>
              {locksAt && (() => {
                // Resolve the user-typed local time through the device timezone
                // so the admin can see exactly what gets stored. Catches the
                // "I'm traveling and my laptop is on ET" footgun before save.
                const resolved = new Date(locksAt)
                if (isNaN(resolved.getTime())) return null
                const formatted = resolved.toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric',
                  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
                })
                return (
                  <div className="text-[11px] text-accent mt-1">
                    Resolves to: <span className="font-semibold">{formatted}</span>
                  </div>
                )
              })()}
            </div>
          </div>
          )
        })()}

        {/* Visibility */}
        <div>
          <label className="block text-sm font-semibold text-text-secondary mb-2">League Visibility</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVisibility('open')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                visibility === 'open' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setVisibility('closed')}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                visibility === 'closed' ? 'bg-accent text-white' : 'bg-bg-input border border-border text-text-secondary hover:bg-bg-card-hover'
              }`}
            >
              Invite Only
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1.5">
            {visibility === 'open'
              ? 'Anyone can find and join this league.'
              : 'Only people with the invite code can join.'}
          </p>
        </div>

        {/* Backdrop picker — after all settings so format/mode influence available options */}
        {format && (
          <div>
            <label className="block text-sm font-semibold text-text-secondary mb-2">League Backdrop <span className="font-normal text-text-muted">(changeable at any time)</span></label>
            <div className="grid grid-cols-3 gap-2 max-h-[400px] overflow-y-auto scrollbar-hide rounded-lg">
              {/* Submit your own */}
              <div className="relative" style={{ paddingBottom: '56.25%' }}>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`absolute inset-0 rounded-lg overflow-hidden border-2 border-dashed transition-all flex flex-col items-center justify-center gap-1 ${
                    customBackdropFile ? 'border-accent bg-accent/10' : 'border-text-primary/20 hover:border-accent/50 bg-bg-primary'
                  }`}
                >
                  {customBackdropPreview ? (
                    <img src={customBackdropPreview} alt="Custom" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <>
                      <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span className="text-[9px] text-text-muted font-semibold leading-tight text-center px-1">Submit your own</span>
                    </>
                  )}
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (file.size > 5 * 1024 * 1024) { toast('Image must be under 5MB', 'error'); return }
                  setCustomBackdropFile(file)
                  setCustomBackdropPreview(URL.createObjectURL(file))
                  setBackdropImage('')
                }}
              />
              {(availableBackdrops || []).map((b) => (
                <button
                  key={b.filename}
                  type="button"
                  onClick={() => { setBackdropImage(backdropImage === b.filename ? '' : b.filename); setCustomBackdropFile(null); setCustomBackdropPreview(null) }}
                  className={`relative block w-full rounded-lg overflow-hidden border-2 transition-all ${
                    backdropImage === b.filename ? 'border-accent ring-1 ring-accent' : 'border-text-primary/20 hover:border-text-primary/40'
                  }`}
                >
                  <img
                    src={getBackdropUrl(b.filename)}
                    alt={b.label}
                    width={1920}
                    height={1080}
                    loading="lazy"
                    decoding="async"
                    className="block w-full h-auto"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-1.5">
                    <span className="text-[10px] text-white font-medium">{b.label}</span>
                  </div>
                  {backdropImage === b.filename && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">Optional. Custom images are submitted for admin review.</p>
          </div>
        )}

        {/* Submit */}
        {!canSubmit && !createLeague.isPending && (
          <p className="text-xs text-text-muted text-center mb-2">
            {missingFieldHint() || 'Fill out all required fields above to create your league'}
          </p>
        )}
        <button
          type="submit"
          disabled={!canSubmit || createLeague.isPending}
          className={`w-full py-3 rounded-xl font-display text-lg transition-colors ${
            canSubmit && !createLeague.isPending
              ? 'bg-accent text-white hover:bg-accent-hover'
              : 'bg-text-muted/30 text-text-muted cursor-not-allowed'
          }`}
        >
          {createLeague.isPending ? 'Creating...' : 'Create League'}
        </button>

        </>}
      </form>
    </div>
  )
}

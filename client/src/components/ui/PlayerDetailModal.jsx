import { createPortal } from 'react-dom'
import { useNbaDfsPlayerGamelog } from '../../hooks/useLeagues'
import { getTeamColor } from '../../lib/teamColors'
import LoadingSpinner from './LoadingSpinner'
import InjuryBadge from './InjuryBadge'

// MLB two-way players appear in our salary table as two rows: one priced
// off batting stats (UTIL) and one off pitching (SP, with -P suffix on
// the espn id). In the modal we surface the dual role so the position
// label matches reality.
const TWO_WAY_PLAYER_NAMES = new Set(['shohei ohtani'])
function twoWayPositionLabel(player) {
  if (!player?.player_name) return null
  const nfl = twoWayNflLabel(player)
  if (nfl) return nfl
  if (!TWO_WAY_PLAYER_NAMES.has(player.player_name.toLowerCase().trim())) return null
  return 'SP, DH'
}

// NFL two-way players — currently just Travis Hunter (2024 Heisman, Jags
// WR/CB). Sleeper picks one primary position (usually WR) which means
// the standard column set drops his defensive stats. When detected we
// override the position label AND render two mini game-log tables so
// both sides of the ball are visible.
const TWO_WAY_NFL_PLAYERS = new Map([
  ['travis hunter', 'WR/CB'],
])
function twoWayNflLabel(player) {
  const name = (player?.player_name || player?.full_name || '').toLowerCase().trim()
  return TWO_WAY_NFL_PLAYERS.get(name) || null
}
function isTwoWayNflByName(player) {
  return !!twoWayNflLabel(player)
}

// InjuryBadge moved to ui/InjuryBadge.jsx — the local copy here had
// drifted from the canonical (missing PUP/SUS, case-sensitive lookup
// that missed lowercase Sleeper variants).

function NBAaverages({ averages }) {
  return (
    <>
      <div className="grid grid-cols-4 gap-3 text-center">
        {[
          { label: 'PTS', value: averages.ppg },
          { label: 'REB', value: averages.rpg },
          { label: 'AST', value: averages.apg },
          { label: 'GP', value: averages.gp },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-lg font-display text-text-primary">{s.value}</div>
            <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 text-center mt-2">
        {[
          { label: 'STL', value: averages.spg },
          { label: 'BLK', value: averages.bpg },
          { label: 'TO', value: averages.tpg },
          { label: 'MIN', value: averages.mpg },
        ].map((s) => (
          <div key={s.label}>
            <div className="text-lg font-display text-text-primary">{s.value}</div>
            <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
          </div>
        ))}
      </div>
    </>
  )
}

function MLBaverages({ averages }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center">
      {[
        { label: 'AVG', value: averages.avg },
        { label: 'HR', value: averages.hr },
        { label: 'RBI', value: averages.rbi },
        { label: 'R', value: averages.r },
        { label: 'SB', value: averages.sb },
        { label: 'OBP', value: averages.obp },
        { label: 'OPS', value: averages.ops },
        { label: 'GP', value: averages.gp },
      ].map((s) => (
        <div key={s.label}>
          <div className="text-lg font-display text-text-primary">{s.value}</div>
          <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function MLBPitcherAverages({ averages }) {
  return (
    <div className="grid grid-cols-4 gap-3 text-center">
      {[
        { label: 'ERA', value: averages.era },
        { label: 'K', value: averages.k },
        { label: 'IP', value: averages.ip },
        { label: 'WHIP', value: averages.whip },
        { label: 'W', value: averages.w },
        { label: 'L', value: averages.l },
        { label: 'GS', value: averages.gs },
      ].map((s) => (
        <div key={s.label}>
          <div className="text-lg font-display text-text-primary">{s.value}</div>
          <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// Shared table renderer for every game log below. Matches the fantasy
// football modal's layout: sticky #/OPP columns on the left, per-stat
// columns to the right, W/L color chip merged into the # column so we
// don't spend a whole column on it. `columns` is a list of
// { key, label, primary?, accent? } objects; primary bolds the value.
// firstColumn: 'result' (default; shows W/L color-coded) or 'week'
// (shows the NFL week number, still colored by W/L). Opponent cell
// gets a vs/@ prefix when the row has is_home data; if the string
// already includes one (DFS services pre-format it), pass through.
function GameLogTable({ games, columns, showFantasyPoints, firstColumn = 'result' }) {
  const isWeek = firstColumn === 'week'
  return (
    <div className="overflow-x-auto -mx-2 px-2">
      <table className="min-w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-text-muted">
            <th className="text-left font-semibold pl-2 pr-1 py-2 sticky left-0 bg-bg-primary">{isWeek ? 'WK' : 'RES'}</th>
            <th className="text-left font-semibold pl-1 pr-2 py-2 whitespace-nowrap">OPP</th>
            {columns.map((c) => (
              <th key={c.key} className={`text-right font-semibold px-2 py-2 whitespace-nowrap ${c.accent ? 'text-accent' : ''}`}>{c.label}</th>
            ))}
            {showFantasyPoints && <th className="text-right font-semibold px-2 py-2 whitespace-nowrap text-accent">FPTS</th>}
          </tr>
        </thead>
        <tbody>
          {games.map((g, i) => {
            const resultColor = g.result === 'W' ? 'text-correct' : g.result === 'L' ? 'text-incorrect' : 'text-text-muted'
            const firstCell = isWeek ? (g.week ?? '—') : (g.result || '—')
            const isBye = g.on_bye || (!g.opponent && !g.result && g.week != null)
            let opponentText = isBye ? 'BYE' : (g.opponent || '—')
            if (!isBye && opponentText !== '—' && g.is_home != null && !/^(vs|@)\s/i.test(opponentText)) {
              opponentText = `${g.is_home ? 'vs' : '@'} ${opponentText}`
            }
            const oppClass = isBye ? 'text-yellow-400 font-semibold' : 'text-text-primary'
            return (
              <tr key={i} className="border-t border-text-primary/10">
                <td className={`pl-2 pr-1 py-2 font-bold sticky left-0 bg-bg-primary ${resultColor}`}>{firstCell}</td>
                <td className={`pl-1 pr-2 py-2 whitespace-nowrap ${oppClass}`}>{opponentText}</td>
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-2 text-right whitespace-nowrap tabular-nums ${c.primary ? 'text-text-primary font-semibold' : 'text-text-secondary'}`}
                  >
                    {g[c.key] ?? '—'}
                  </td>
                ))}
                {showFantasyPoints && (
                  <td className="px-2 py-2 text-right whitespace-nowrap tabular-nums text-accent font-semibold">
                    {g.fantasy_pts != null ? g.fantasy_pts.toFixed(1) : '—'}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MLBPitcherGameLog({ games, showFantasyPoints }) {
  return <GameLogTable games={games} showFantasyPoints={showFantasyPoints} columns={[
    { key: 'ip', label: 'IP', primary: true },
    { key: 'h', label: 'H' },
    { key: 'r', label: 'R' },
    { key: 'er', label: 'ER' },
    { key: 'bb', label: 'BB' },
    { key: 'k', label: 'K', primary: true },
  ]} />
}

function NBAGameLog({ games, showFantasyPoints }) {
  return <GameLogTable games={games} showFantasyPoints={showFantasyPoints} columns={[
    { key: 'min', label: 'MIN' },
    { key: 'pts', label: 'PTS', primary: true },
    { key: 'reb', label: 'REB' },
    { key: 'ast', label: 'AST' },
    { key: 'stl', label: 'STL' },
    { key: 'blk', label: 'BLK' },
  ]} />
}

function MLBGameLog({ games, showFantasyPoints }) {
  return <GameLogTable games={games} showFantasyPoints={showFantasyPoints} columns={[
    { key: 'ab', label: 'AB', primary: true },
    { key: 'h', label: 'H' },
    { key: 'r', label: 'R' },
    { key: 'hr', label: 'HR' },
    { key: 'rbi', label: 'RBI' },
    { key: 'bb', label: 'BB' },
    { key: 'so', label: 'SO' },
  ]} />
}

function getNFLPositionGroup(position) {
  if (!position) return 'skill'
  const pos = position.toUpperCase()
  if (pos === 'QB') return 'qb'
  if (pos === 'RB' || pos === 'FB') return 'rb'
  if (pos === 'WR' || pos === 'TE') return 'rec'
  if (pos === 'K') return 'k'
  if (pos === 'DEF') return 'def'
  // IDPs — group raw ESPN codes into a single 'idp' bucket for stat display.
  if (['DL', 'DE', 'DT', 'NT'].includes(pos)) return 'idp'
  if (['LB', 'ILB', 'OLB', 'MLB'].includes(pos)) return 'idp'
  if (['DB', 'CB', 'S', 'FS', 'SS'].includes(pos)) return 'idp'
  return 'skill'
}

const NFL_AVG_STATS = {
  qb: [
    { label: 'Pass YDS', key: 'pass_yds' },
    { label: 'Pass TD', key: 'pass_td' },
    { label: 'INT', key: 'int' },
    { label: 'Rush YDS', key: 'rush_yds' },
    { label: 'Rush TD', key: 'rush_td' },
    { label: 'GP', key: 'gp' },
  ],
  rb: [
    { label: 'Rush YDS', key: 'rush_yds' },
    { label: 'Rush TD', key: 'rush_td' },
    { label: 'REC', key: 'rec' },
    { label: 'Rec YDS', key: 'rec_yds' },
    { label: 'Rec TD', key: 'rec_td' },
    { label: 'GP', key: 'gp' },
  ],
  rec: [
    { label: 'REC', key: 'rec' },
    { label: 'Rec YDS', key: 'rec_yds' },
    { label: 'Rec TD', key: 'rec_td' },
    { label: 'Rush YDS', key: 'rush_yds' },
    { label: 'GP', key: 'gp' },
  ],
  skill: [
    { label: 'Rush YDS', key: 'rush_yds' },
    { label: 'Rec YDS', key: 'rec_yds' },
    { label: 'TD', key: 'rush_td' },
    { label: 'GP', key: 'gp' },
  ],
  idp: [
    { label: 'SOLO', key: 'def_tackles_solo' },
    { label: 'AST', key: 'def_tackles_ast' },
    { label: 'SACK', key: 'def_sack' },
    { label: 'INT', key: 'def_int' },
    { label: 'PD', key: 'def_pass_def' },
    { label: 'GP', key: 'gp' },
  ],
}

// Per-position column configs — defensive players (idp) get a full
// defensive stat line, not "0 pass yds" columns that don't apply.
const NFL_LOG_COLS = {
  qb: [
    { key: 'pass_yds', label: 'PaYD', primary: true },
    { key: 'pass_td', label: 'PaTD' },
    { key: 'int', label: 'INT' },
    { key: 'rush_yds', label: 'RuYD' },
  ],
  rb: [
    { key: 'rush_yds', label: 'RuYD', primary: true },
    { key: 'rush_td', label: 'RTD' },
    { key: 'rec', label: 'REC' },
    { key: 'rec_yds', label: 'ReYD' },
  ],
  rec: [
    { key: 'rec', label: 'REC', primary: true },
    { key: 'rec_yds', label: 'ReYD' },
    { key: 'rec_td', label: 'RTD' },
    { key: 'rush_yds', label: 'RuYD' },
  ],
  skill: [
    { key: 'rush_yds', label: 'RuYD' },
    { key: 'rec_yds', label: 'ReYD' },
    { key: 'rec', label: 'REC' },
    { key: 'rush_td', label: 'TD' },
  ],
  idp: [
    { key: 'def_tackles_solo', label: 'SOLO', primary: true },
    { key: 'def_tackles_ast', label: 'AST' },
    { key: 'def_sack', label: 'SACK' },
    { key: 'def_tfl', label: 'TFL' },
    { key: 'def_pass_def', label: 'PD' },
    { key: 'def_int', label: 'INT' },
  ],
}

function NFLaverages({ averages, position }) {
  const group = getNFLPositionGroup(position)
  const stats = NFL_AVG_STATS[group] || NFL_AVG_STATS.skill
  return (
    <div className="grid grid-cols-3 gap-3 text-center">
      {stats.map((s) => (
        <div key={s.label}>
          <div className="text-lg font-display text-text-primary">{averages[s.key] || 0}</div>
          <div className="text-[10px] text-text-muted uppercase">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

function NFLGameLog({ games, position, twoWay }) {
  if (twoWay) {
    // Stack a receiving + defensive block so we cover both sides of
    // the ball. Same games list feeds both — ESPN's gamelog rows
    // include offense + defense stats for two-way athletes.
    return (
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-semibold">Offense</div>
          <GameLogTable games={games} columns={NFL_LOG_COLS.rec} firstColumn="week" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1 font-semibold">Defense</div>
          <GameLogTable games={games} columns={NFL_LOG_COLS.idp} firstColumn="week" />
        </div>
      </div>
    )
  }
  const group = getNFLPositionGroup(position)
  const columns = NFL_LOG_COLS[group] || NFL_LOG_COLS.skill
  return <GameLogTable games={games} columns={columns} firstColumn="week" />
}

export default function PlayerDetailModal({ player, onClose, onAdd, sport = 'basketball_nba', showFantasyPoints = false }) {
  // ESPN id is the preferred lookup key. NFL single-stat contests (Sacks,
  // Ints, Tackles, Receptions) carry sleeper_player_id instead — the
  // server resolves that to espn_id via nfl_players.espn_id.
  const lookupId = player?.espn_player_id || player?.sleeper_player_id || player?.id
  const { data, isLoading } = useNbaDfsPlayerGamelog(lookupId, sport)

  if (!player) return null

  const detectedSport = data?.sport || sport
  const isMLB = detectedSport === 'baseball_mlb'
  const isNFL = detectedSport === 'americanfootball_nfl'
  const isPitcher = !!data?.isPitcher
  const teamColor = getTeamColor(detectedSport, player.team)

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-primary border border-text-primary/20 w-full max-w-md rounded-2xl max-h-[85vh] overflow-y-auto scrollbar-hide"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — centered headshot + name on team-tinted backdrop.
            Matches the fantasy football player modal so the whole app
            has one consistent player-hero look. */}
        <div
          className="relative px-5 pt-6 pb-5"
          style={teamColor ? {
            background: `linear-gradient(180deg, ${teamColor} 0%, ${teamColor}cc 60%, ${teamColor}00 100%)`,
          } : undefined}
        >
          <button onClick={onClose} className="absolute top-3 right-3 text-white/80 hover:text-white text-xl leading-none z-10 p-1">&times;</button>
          <div className="flex flex-col items-center text-center">
            {player.headshot_url || player.player_headshot_url ? (
              <img src={player.headshot_url || player.player_headshot_url} alt="" className="w-32 h-32 rounded-full object-cover bg-bg-card border-2 border-text-primary/20 mb-3" />
            ) : (
              <div className="w-32 h-32 rounded-full bg-bg-card border-2 border-text-primary/20 mb-3 flex items-center justify-center text-2xl text-text-muted font-bold">
                {(player.position || '?').split('/')[0]}
              </div>
            )}
            <div className="flex items-center gap-2">
              <h2 className="font-display text-2xl text-text-primary">{player.player_name}</h2>
              <InjuryBadge status={player.injury_status} />
            </div>
            {(() => {
              const displayPosition = twoWayPositionLabel(player) || player.position
              if (!displayPosition && !player.team) return null
              return (
                <div className="text-xs text-text-muted mt-1">
                  {displayPosition ? <>{displayPosition} · </> : null}
                  {player.team && <span className="text-text-primary font-semibold">{player.team}</span>}
                </div>
              )
            })()}
            {onAdd && (
              <button
                onClick={() => { onAdd(player); onClose() }}
                className="mt-4 px-6 py-2 rounded-xl font-display text-sm bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Add to Roster
              </button>
            )}
          </div>
        </div>

        {/* Player Notes (admin blurb) — matches the fantasy football
            modal's styling: accent-orange heading + date pushed to the
            right on the same row, body text below. */}
        {data?.blurb && (
          <div className="px-5 py-4 border-b border-text-primary/10">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <h3 className="text-xs text-accent uppercase tracking-wider font-semibold">Player Notes</h3>
              {data.blurb.published_at && (
                <div className="text-[10px] text-text-muted shrink-0">
                  {data.blurb.generated_by === 'espn' && <span className="mr-1.5">via ESPN</span>}
                  {new Date(data.blurb.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </div>
              )}
            </div>
            <p className="text-sm text-text-primary leading-relaxed whitespace-pre-wrap">{data.blurb.content}</p>
          </div>
        )}


        {/* Game log — the table itself is self-explanatory (WK/OPP
            columns) so no section heading needed. Matches the FF
            modal which also drops the label. */}
        <div className="px-5 py-4">
          {isLoading ? (
            <LoadingSpinner />
          ) : !data?.games?.length ? (
            <p className="text-sm text-text-muted text-center py-4">No games available.</p>
          ) : isPitcher ? (
            <MLBPitcherGameLog games={data.games} showFantasyPoints={showFantasyPoints} />
          ) : isMLB ? (
            <MLBGameLog games={data.games} showFantasyPoints={showFantasyPoints} />
          ) : isNFL ? (
            <NFLGameLog games={data.games} position={player.position} twoWay={isTwoWayNflByName(player)} />
          ) : (
            <NBAGameLog games={data.games} showFantasyPoints={showFantasyPoints} />
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

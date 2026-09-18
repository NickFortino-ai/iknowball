import PlayerHeadshot from '../ui/PlayerHeadshot'
import { shortTeamLabel } from '../../lib/teamShort'
import { playerLastName } from '../../lib/playerName'

// One pick in a survivor history row: headshot, last name, period label.
//
// Shared by SurvivorView (your own row) and SurvivorStandings (everyone
// else's) because those two had drifted into separate copies of the same
// markup — the kind of split that produced two different injury badges and
// two different IR eligibility rules elsewhere in this codebase.
//
// Four shapes it has to handle:
//   player pick   headshot + last name           (touchdown survivor)
//   team pick     short team label, no headshot  (team survivor)
//   locked        '?' and "Hidden"               (another manager, pre-kickoff)
//   missed        'X' and "Missed"               (no pick was made that period)
export default function SurvivorPickChip({
  pick,
  weekNumber,
  periodLabel = 'Week',
  isDaily = false,
  missed = false,
  onOpenPlayer,
}) {
  const isLocked = !missed && pick?.team_name === 'Locked'
  const canOpen = !missed && !isLocked && !!pick?.player_id && !!onOpenPlayer

  // Outcome lives in the ring rather than a filled pill, so the face stays
  // the thing you read and the colour is peripheral.
  const ringClass = missed
    ? 'ring-incorrect/70'
    : isLocked
      ? 'ring-white/15'
      : pick?.status === 'survived'
        ? 'ring-correct/70'
        : pick?.status === 'survived_wrong'
          ? 'ring-yellow-500/70'
          : pick?.status === 'eliminated'
            ? 'ring-incorrect/70'
            : 'ring-white/30'

  // Locked picks show nothing under the circle — the '?' already says it,
  // and "Hidden" underneath was repeating itself. A non-breaking space keeps
  // the row height so a mixed row doesn't sit at two different baselines.
  const label = missed
    ? 'Missed'
    : isLocked
      ? '\u00A0'
      // Player picks get the surname helper: shortTeamLabel takes the last
      // word, which turned "Amon-Ra St. Brown" into "Brown". Team-survivor
      // picks still use shortTeamLabel below, where last-word IS correct
      // (Portland Trail Blazers -> Blazers).
      : playerLastName(pick?.player_name || pick?.team_name) || '—'

  const title = missed
    ? `${periodLabel} ${weekNumber}: Missed pick — lost a life`
    : `${periodLabel} ${weekNumber}: ${isLocked ? 'Hidden' : pick?.team_name || 'No pick'}`

  const Tag = canOpen ? 'button' : 'div'

  return (
    <Tag
      {...(canOpen ? {
        type: 'button',
        // Hands back the player id. The league PlayerDetailModal fetches the
        // full card from it — team colour header, bio, notes, week-by-week
        // table — rather than the trimmed ui/ modal that only had what the
        // caller happened to pass in.
        onClick: () => onOpenPlayer(pick.player_id),
      } : {})}
      title={title}
      className={`shrink-0 flex flex-col items-center gap-0.5 w-14 lg:w-20 ${canOpen ? 'hover:opacity-80 transition-opacity' : ''}`}
    >
      {!missed && !isLocked && pick?.player_id ? (
        <PlayerHeadshot
          name={pick.player_name || pick.team_name}
          url={pick.headshot_url}
          size="lg"
          // 48px on phones, 64px on desktop. className is appended after
          // sizeClass inside the component, so the lg: variants win there.
          className={`ring-2 lg:w-16 lg:h-16 ${ringClass}`}
        />
      ) : (
        // Keeps the column occupied so a row of mixed pick types doesn't
        // reflow around the ones that have no face to show.
        <div className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white/5 ring-2 ${ringClass} flex items-center justify-center font-bold text-text-muted ${
          // A single glyph in a 48-64px circle wants to fill it; a team name
          // has to stay small enough to read. Sizing them the same left the
          // '?' on a hidden pick looking like a speck.
          missed || isLocked ? 'text-2xl lg:text-3xl leading-none' : 'text-[10px]'
        }`}>
          {missed ? '✕' : isLocked ? '?' : shortTeamLabel(pick?.team_name) || '—'}
        </div>
      )}
      <span className="w-full text-center text-[10px] leading-tight text-text-primary truncate">
        {label}
      </span>
      <span className="text-[9px] text-text-muted leading-none">
        {weekNumber != null ? `${isDaily ? 'D' : 'W'}${weekNumber}` : ''}
      </span>
    </Tag>
  )
}

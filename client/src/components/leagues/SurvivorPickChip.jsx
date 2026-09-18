import { useState } from 'react'
import PlayerHeadshot from '../ui/PlayerHeadshot'
import { shortTeamLabel } from '../../lib/teamShort'
import { getTeamLogoUrl, getTeamLogoFallbackUrl } from '../../lib/teamLogos'
import { getTeamColor } from '../../lib/teamColors'
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
  sportKey,
}) {
  // An all-sports survivor row mixes leagues, so the pick's own game wins over
  // whatever the league is nominally set to.
  const logoSport = pick?.games?.sports?.key || (sportKey && sportKey !== 'all' ? sportKey : null)
  const teamColor = !pick?.player_id ? getTeamColor(logoSport, pick?.team_name) : null
  // ESPN serves a -dark variant for some crests and not others; fall back once
  // rather than leaving a broken image in the circle.
  const [logoFailed, setLogoFailed] = useState(false)
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
      // Player picks get the surname helper; team picks keep shortTeamLabel,
      // where last-word IS the right answer (Portland Trail Blazers -> Blazers).
      : pick?.player_id
        ? playerLastName(pick?.player_name) || '—'
        : shortTeamLabel(pick?.team_name) || '—'

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
      ) : !missed && !isLocked && pick?.team_name && getTeamLogoUrl(pick.team_name, logoSport) && !logoFailed ? (
        // Team-survivor pick: the crest plays the part the headshot plays for
        // a player pick, with the same status ring around it.
        <div
          className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full ring-2 ${ringClass} flex items-center justify-center overflow-hidden`}
          // Team tint behind the crest. ESPN's 500-dark art is drawn for dark
          // backgrounds, so this stays a wash (~18%) rather than a solid fill —
          // enough that a pick reads as "the Jaguars one" at a glance without
          // fighting the logo it sits behind.
          style={{ backgroundColor: teamColor ? `${teamColor}2E` : undefined }}
        >
          <img
            src={getTeamLogoUrl(pick.team_name, logoSport)}
            alt=""
            loading="lazy"
            // Bigger than the headshot equivalent would be: crests are mostly
            // wide (wordmarks like the 49ers oval, the Jaguars head), so
            // object-contain shrinks them to their width. Filling ~85% of the
            // circle gets them back to the weight of a player headshot.
            className="w-10 h-10 lg:w-[3.4rem] lg:h-[3.4rem] object-contain"
            onError={(e) => {
              const fb = getTeamLogoFallbackUrl(pick.team_name, logoSport)
              if (fb && e.currentTarget.src !== fb) e.currentTarget.src = fb
              else setLogoFailed(true)
            }}
          />
        </div>
      ) : (
        // Keeps the column occupied so a row of mixed pick types doesn't
        // reflow around the ones that have no face to show.
        <div
          style={{ backgroundColor: teamColor ? `${teamColor}2E` : undefined }}
          className={`w-12 h-12 lg:w-16 lg:h-16 rounded-full bg-white/5 ring-2 ${ringClass} flex items-center justify-center font-bold text-text-muted ${
          // A single glyph in a 48-64px circle wants to fill it; a team name
          // has to stay small enough to read. Sizing them the same left the
          // '?' on a hidden pick looking like a speck.
          missed || isLocked ? 'text-2xl lg:text-3xl leading-none' : 'text-[10px]'
        }`}
        >
          {missed ? '✕' : isLocked ? '?' : shortTeamLabel(pick?.team_name) || '—'}
        </div>
      )}
      <span className="w-full text-center text-[11px] lg:text-[13px] font-medium leading-tight text-text-primary truncate">
        {label}
      </span>
      <span className="text-[10px] lg:text-[11px] text-text-muted leading-none">
        {weekNumber != null ? `${isDaily ? 'D' : 'W'}${weekNumber}` : ''}
      </span>
    </Tag>
  )
}

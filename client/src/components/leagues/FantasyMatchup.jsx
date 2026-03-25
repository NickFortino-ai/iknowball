import { useState, useMemo } from 'react'
import { useFantasyRoster } from '../../hooks/useLeagues'
import Avatar from '../ui/Avatar'

const SLOT_ORDER = ['qb', 'rb1', 'rb2', 'wr1', 'wr2', 'te', 'flex', 'k', 'def']
const SLOT_LABELS = { qb: 'QB', rb1: 'RB', rb2: 'RB', wr1: 'WR', wr2: 'WR', te: 'TE', flex: 'W/R/T', k: 'K', def: 'DEF' }

function PlayerRow({ player, side }) {
  if (!player) {
    return (
      <td colSpan={3} className={`py-2 px-2 text-text-muted text-xs italic ${side === 'left' ? 'text-right' : 'text-left'}`}>
        Empty
      </td>
    )
  }

  const nfl = player.nfl_players
  const pts = '--' // TODO: pull from weekly stats when available

  if (side === 'left') {
    return (
      <>
        <td className="py-2 px-1 text-right text-xs text-text-muted">--</td>
        <td className="py-2 px-1 text-right">
          <div className="flex items-center justify-end gap-2">
            <div className="text-right">
              <div className="text-sm font-semibold text-text-primary truncate max-w-[140px]">{nfl?.full_name}</div>
              <div className="text-[10px] text-text-muted">{nfl?.team || 'FA'}</div>
            </div>
            {nfl?.headshot_url && (
              <img src={nfl.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
            )}
          </div>
        </td>
        <td className="py-2 px-2 text-right font-semibold text-text-primary text-sm">{pts}</td>
      </>
    )
  }

  return (
    <>
      <td className="py-2 px-2 text-left font-semibold text-text-primary text-sm">{pts}</td>
      <td className="py-2 px-1 text-left">
        <div className="flex items-center gap-2">
          {nfl?.headshot_url && (
            <img src={nfl.headshot_url} alt="" className="w-8 h-8 rounded-full object-cover bg-bg-secondary shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
          )}
          <div>
            <div className="text-sm font-semibold text-text-primary truncate max-w-[140px]">{nfl?.full_name}</div>
            <div className="text-[10px] text-text-muted">{nfl?.team || 'FA'}</div>
          </div>
        </div>
      </td>
      <td className="py-2 px-1 text-left text-xs text-text-muted">--</td>
    </>
  )
}

export default function FantasyMatchup({ league, matchup }) {
  // For now, show a placeholder matchup using the first two members
  const members = league.members || []

  if (members.length < 2) {
    return <div className="text-center py-8 text-text-muted text-sm">Need at least 2 teams for matchups</div>
  }

  const homeUser = matchup?.home_user || members[0]?.users
  const awayUser = matchup?.away_user || members[1]?.users
  const homePoints = matchup?.home_points || 0
  const awayPoints = matchup?.away_points || 0

  return (
    <div>
      {/* Matchup Header */}
      <div className="rounded-xl border border-text-primary/20 p-4 mb-4">
        <div className="flex items-center justify-between">
          {/* Home team */}
          <div className="flex items-center gap-3">
            <Avatar user={homeUser} size="lg" />
            <div>
              <div className="font-display text-base text-text-primary">{homeUser?.display_name || homeUser?.username}</div>
              <div className="text-xs text-text-muted">--</div>
            </div>
          </div>

          {/* Score */}
          <div className="text-center px-4">
            <div className="flex items-center gap-3">
              <span className={`font-display text-2xl ${homePoints >= awayPoints ? 'text-text-primary' : 'text-text-muted'}`}>
                {homePoints > 0 ? homePoints.toFixed(2) : '--'}
              </span>
              <span className="text-xs text-text-muted">vs</span>
              <span className={`font-display text-2xl ${awayPoints >= homePoints ? 'text-text-primary' : 'text-text-muted'}`}>
                {awayPoints > 0 ? awayPoints.toFixed(2) : '--'}
              </span>
            </div>
          </div>

          {/* Away team */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="font-display text-base text-text-primary">{awayUser?.display_name || awayUser?.username}</div>
              <div className="text-xs text-text-muted">--</div>
            </div>
            <Avatar user={awayUser} size="lg" />
          </div>
        </div>
      </div>

      {/* Roster Comparison Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="py-2 px-1 text-right">Proj</th>
              <th className="py-2 px-1 text-right">Player</th>
              <th className="py-2 px-2 text-right">Pts</th>
              <th className="py-2 px-2 text-center font-semibold text-text-secondary">Pos</th>
              <th className="py-2 px-2 text-left">Pts</th>
              <th className="py-2 px-1 text-left">Player</th>
              <th className="py-2 px-1 text-left">Proj</th>
            </tr>
          </thead>
          <tbody>
            {SLOT_ORDER.map((slot) => (
              <tr key={slot} className="border-b border-border last:border-0">
                {/* Left side placeholder */}
                <td className="py-2 px-1 text-right text-text-muted">--</td>
                <td className="py-2 px-1 text-right text-text-muted italic">--</td>
                <td className="py-2 px-2 text-right text-text-muted">--</td>
                <td className="py-2 px-2 text-center">
                  <span className="text-xs font-semibold text-text-secondary bg-bg-secondary rounded px-1.5 py-0.5">
                    {SLOT_LABELS[slot]}
                  </span>
                </td>
                {/* Right side placeholder */}
                <td className="py-2 px-2 text-left text-text-muted">--</td>
                <td className="py-2 px-1 text-left text-text-muted italic">--</td>
                <td className="py-2 px-1 text-left text-text-muted">--</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

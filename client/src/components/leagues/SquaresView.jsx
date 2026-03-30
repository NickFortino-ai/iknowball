import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useSquaresBoard,
  useClaimSquare,
  useUnclaimSquare,
  useRandomAssignSquares,
  useLockDigits,
  useScoreQuarter,
  useUpdateBoardSettings,
  useDeleteLeague,
  useCompleteLeague,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'

export default function SquaresView({ league, isCommissioner, onUserTap }) {
  const { data: board, isLoading } = useSquaresBoard(league.id)
  const { profile } = useAuth()
  const claimSquare = useClaimSquare()
  const unclaimSquare = useUnclaimSquare()
  const randomAssign = useRandomAssignSquares()
  const lockDigitsM = useLockDigits()
  const scoreQuarterM = useScoreQuarter()
  const updateSettings = useUpdateBoardSettings()
  const deleteLeague = useDeleteLeague()
  const completeLeague = useCompleteLeague()
  const navigate = useNavigate()

  const [scoreForm, setScoreForm] = useState({ quarter: 1, awayScore: '', homeScore: '' })
  const [editRowName, setEditRowName] = useState(null)
  const [editColName, setEditColName] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isLoading) return <LoadingSpinner />
  if (!board) return <EmptyState title="No board" message="Board not available" />

  const rowTeamName = board.row_team_name || 'Away'
  const colTeamName = board.col_team_name || 'Home'

  // Build grid
  const grid = Array.from({ length: 10 }, () => Array(10).fill(null))
  for (const claim of board.claims || []) {
    grid[claim.row_pos][claim.col_pos] = claim
  }

  const totalClaimed = board.claims?.length || 0
  const isSelfSelect = league.settings?.assignment_method !== 'random'

  async function handleClaim(row, col) {
    try {
      await claimSquare.mutateAsync({ leagueId: league.id, rowPos: row, colPos: col })
      toast('Square claimed!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to claim square', 'error')
    }
  }

  async function handleUnclaim(row, col) {
    try {
      await unclaimSquare.mutateAsync({ leagueId: league.id, rowPos: row, colPos: col })
      toast('Square removed', 'success')
    } catch (err) {
      toast(err.message || 'Failed to remove square', 'error')
    }
  }

  async function handleRandomAssign() {
    try {
      await randomAssign.mutateAsync(league.id)
      toast('Squares randomly assigned!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to assign squares', 'error')
    }
  }

  async function handleLockDigits() {
    try {
      await lockDigitsM.mutateAsync(league.id)
      toast('Digits locked!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to lock digits', 'error')
    }
  }

  async function handleScoreQuarter(e) {
    e.preventDefault()
    try {
      await scoreQuarterM.mutateAsync({
        leagueId: league.id,
        quarter: scoreForm.quarter,
        awayScore: parseInt(scoreForm.awayScore, 10),
        homeScore: parseInt(scoreForm.homeScore, 10),
      })
      toast(`Q${scoreForm.quarter} scored!`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to score quarter', 'error')
    }
  }

  async function handleSaveTeamName(field, value) {
    try {
      await updateSettings.mutateAsync({ leagueId: league.id, [field]: value })
      toast('Team name updated!', 'success')
    } catch (err) {
      toast(err.message || 'Failed to update team name', 'error')
    }
    if (field === 'row_team_name') setEditRowName(null)
    else setEditColName(null)
  }

  // Quarter results
  const quarters = [1, 2, 3, 4].map((q) => ({
    quarter: q,
    awayScore: board[`q${q}_away_score`],
    homeScore: board[`q${q}_home_score`],
    winnerId: board[`q${q}_winner_id`],
  }))

  return (
    <div>
      {/* Game info */}
      {board.games && (
        <div className="bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center">
          <div className="font-display text-lg">
            {board.games.away_team} @ {board.games.home_team}
          </div>
          <div className="text-xs text-text-muted mt-1">
            {new Date(board.games.starts_at).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </div>
        </div>
      )}

      {/* Commissioner actions — compact inline, only shows relevant action */}
      {isCommissioner && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
          {!isSelfSelect && totalClaimed === 0 && (
            <button
              onClick={handleRandomAssign}
              disabled={randomAssign.isPending}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
            >
              Random Assign
            </button>
          )}
          {quarters.every((q) => q.awayScore !== null) && league.status !== 'completed' && (
            <button
              onClick={async () => {
                try {
                  await completeLeague.mutateAsync(league.id)
                  toast('Contest marked as complete!', 'success')
                } catch (err) {
                  toast(err.message || 'Failed to complete contest', 'error')
                }
              }}
              disabled={completeLeague.isPending}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-correct/10 text-correct hover:bg-correct/20 disabled:opacity-50 transition-colors"
            >
              Mark as Complete
            </button>
          )}
        </div>
      )}

      {/* Quarter results */}
      {quarters.some((q) => q.awayScore !== null) && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {quarters.map((q) => (
            <div key={q.quarter} className={`bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border p-3 text-center ${
              q.winnerId ? 'border-accent' : 'border-text-primary/20'
            }`}>
              <div className="text-xs text-text-muted mb-1">Q{q.quarter}</div>
              {q.awayScore !== null ? (
                <>
                  <div className="font-display text-sm">{q.awayScore}-{q.homeScore}</div>
                  {q.winnerId && (
                    <div className="text-[10px] text-accent font-semibold mt-1">
                      {board.claims?.find((c) => c.user_id === q.winnerId)?.users?.username || 'Winner'}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-text-muted text-sm">—</div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Status */}
      <div className="text-xs text-text-muted text-center mb-3">
        {totalClaimed}/100 squares claimed
        {board.digits_locked ? ' — Digits locked' : ''}
      </div>

      {/* Guidance banners */}
      {!board.digits_locked && totalClaimed === 0 && (
        <div className="bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center">
          <p className="text-sm text-text-secondary">
            {isSelfSelect
              ? 'Tap an empty square on the grid below to claim it.'
              : isCommissioner
                ? 'Use "Random Assign" above to assign squares to all members.'
                : 'Waiting for the commissioner to assign squares.'}
          </p>
        </div>
      )}
      {!board.digits_locked && totalClaimed > 0 && (
        <div className="bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center">
          <p className="text-sm text-text-secondary">
            {isSelfSelect
              ? 'Tap an empty square to claim more. Digits lock automatically before game time.'
              : 'Digits will lock automatically before game time.'}
          </p>
        </div>
      )}
      {board.digits_locked && !quarters.some((q) => q.awayScore !== null) && (
        <div className="bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border border-text-primary/20 p-4 mb-4 text-center">
          <p className="text-sm text-text-secondary">Digits are locked! Results will be scored automatically.</p>
        </div>
      )}

      {/* Grid */}
      <div className="overflow-x-auto flex justify-center">
        <div className="inline-block">
          {/* Column team name above grid */}
          <div className="text-center pl-10 lg:pl-16 mb-2 lg:mb-3">
            <span className="text-sm lg:text-2xl font-display text-white tracking-wider uppercase">{colTeamName.split(' ').pop()}</span>
          </div>
          <div className="flex">
            {/* Row team name beside grid (vertical) */}
            <div className="flex items-center justify-center w-8 lg:w-12 shrink-0">
              <span className="text-sm lg:text-2xl font-display text-white tracking-wider uppercase whitespace-nowrap" style={{ writingMode: 'vertical-lr', transform: 'rotate(180deg)' }}>
                {rowTeamName.split(' ').pop()}
              </span>
            </div>
            <table className="border-collapse table-fixed">
              {/* Column headers (home team digits) */}
              <thead>
                <tr>
                  <th className="w-8 h-8 lg:w-[4.5rem] lg:h-12" />
                  {Array.from({ length: 10 }, (_, i) => (
                    <th key={i} className="w-10 h-8 lg:w-[4.5rem] lg:h-12 text-center text-xs lg:text-base font-semibold text-accent">
                      {board.digits_locked ? board.col_digits[i] : '?'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.map((row, r) => (
                  <tr key={r}>
                    {/* Row header (away team digit) */}
                    <td className="w-8 h-10 lg:w-[4.5rem] lg:h-[4.5rem] text-center text-xs lg:text-base font-semibold text-accent">
                      {board.digits_locked ? board.row_digits[r] : '?'}
                    </td>
                  {row.map((cell, c) => {
                    const isMe = cell?.user_id === profile?.id
                    const isWinning = quarters.some(
                      (q) =>
                        q.awayScore !== null &&
                        board.digits_locked &&
                        board.row_digits[r] === q.awayScore % 10 &&
                        board.col_digits[c] === q.homeScore % 10
                    )

                    return (
                      <td
                        key={c}
                        onClick={() => {
                          if (cell && isMe && !board.digits_locked) handleUnclaim(r, c)
                          else if (cell && onUserTap) onUserTap(cell.user_id)
                          else if (!cell && isSelfSelect && !board.digits_locked) handleClaim(r, c)
                        }}
                        className={`w-10 h-10 lg:w-[4.5rem] lg:h-[4.5rem] p-0 overflow-hidden border border-border transition-colors ${
                          isWinning
                            ? 'bg-accent/30'
                            : cell
                              ? isMe
                                ? 'bg-accent/10'
                                : 'bg-bg-card'
                              : isSelfSelect && !board.digits_locked
                                ? 'bg-bg-primary hover:bg-bg-card-hover cursor-pointer'
                                : 'bg-bg-primary'
                        } ${cell ? 'cursor-pointer' : ''}`}
                      >
                        <div className="w-full h-full flex items-center justify-center">
                          {cell ? (
                            <Avatar user={cell.users} size="xs" className="lg:!w-9 lg:!h-9 lg:!text-sm" />
                          ) : null}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Squares owned per user */}
      {totalClaimed > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-base text-text-primary mb-3">Squares Owned</h3>
          <div className="bg-bg-primary/60 md:bg-bg-primary/40 backdrop-blur-sm rounded-xl border border-text-primary/20 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-text-primary/10 text-text-muted text-sm">
                  <th className="text-left py-3 px-4 font-semibold">Player</th>
                  <th className="text-center py-3 px-2 font-semibold">Squares</th>
                  <th className="text-right py-3 px-2 font-semibold">Cost</th>
                  <th className="text-right py-3 px-4 font-semibold">Won</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const pointsPerQuarter = league.settings?.points_per_quarter || [10, 10, 10, 10]
                  const totalPot = pointsPerQuarter.reduce((sum, q) => sum + (q || 0), 0)
                  const costPerSquare = totalPot / 100

                  // Sum quarter winnings per user
                  const winMap = {}
                  for (let i = 0; i < quarters.length; i++) {
                    const q = quarters[i]
                    if (q.winnerId) {
                      winMap[q.winnerId] = (winMap[q.winnerId] || 0) + (pointsPerQuarter[i] || 0)
                    }
                  }

                  const userMap = {}
                  for (const claim of board.claims || []) {
                    const uid = claim.user_id
                    if (!userMap[uid]) {
                      userMap[uid] = { user: claim.users, squares: 0 }
                    }
                    userMap[uid].squares++
                  }
                  return Object.values(userMap)
                    .sort((a, b) => b.squares - a.squares)
                    .map((s) => {
                      const won = winMap[s.user?.id] || 0
                      return (
                        <tr key={s.user?.id} className="border-b border-text-primary/10 last:border-0">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <Avatar user={s.user} size="md" />
                              <span className="text-sm font-bold text-white">{s.user?.display_name || s.user?.username || 'Unknown'}</span>
                            </div>
                          </td>
                          <td className="text-center py-3 px-2 text-sm font-semibold text-white">{s.squares}</td>
                          <td className="text-right py-3 px-2 text-sm text-text-secondary">
                            {costPerSquare % 1 === 0 ? s.squares * costPerSquare : (s.squares * costPerSquare).toFixed(1)} pts
                          </td>
                          <td className={`text-right py-3 px-4 text-sm font-bold ${won > 0 ? 'text-correct' : 'text-text-muted'}`}>
                            {won > 0 ? `+${won}` : '—'}
                          </td>
                        </tr>
                      )
                    })
                })()}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

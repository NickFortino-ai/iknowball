import { useState } from 'react'
import {
  useSquaresBoard,
  useClaimSquare,
  useRandomAssignSquares,
  useLockDigits,
  useScoreQuarter,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'

export default function SquaresView({ league, isCommissioner }) {
  const { data: board, isLoading } = useSquaresBoard(league.id)
  const { profile } = useAuth()
  const claimSquare = useClaimSquare()
  const randomAssign = useRandomAssignSquares()
  const lockDigitsM = useLockDigits()
  const scoreQuarterM = useScoreQuarter()

  const [scoreForm, setScoreForm] = useState({ quarter: 1, awayScore: '', homeScore: '' })

  if (isLoading) return <LoadingSpinner />
  if (!board) return <EmptyState title="No board" message="Board not available" />

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
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 text-center">
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

      {/* Commissioner controls */}
      {isCommissioner && (
        <div className="bg-bg-card rounded-xl border border-border p-4 mb-4 space-y-3">
          <h3 className="font-display text-sm text-text-secondary">Commissioner Controls</h3>
          <div className="flex gap-2">
            {!isSelfSelect && totalClaimed === 0 && (
              <button
                onClick={handleRandomAssign}
                disabled={randomAssign.isPending}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Random Assign
              </button>
            )}
            {!board.digits_locked && totalClaimed > 0 && (
              <button
                onClick={handleLockDigits}
                disabled={lockDigitsM.isPending}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Lock Digits
              </button>
            )}
          </div>
          {board.digits_locked && (
            <form onSubmit={handleScoreQuarter} className="flex items-end gap-2">
              <div>
                <label className="block text-[10px] text-text-muted mb-1">Quarter</label>
                <select
                  value={scoreForm.quarter}
                  onChange={(e) => setScoreForm({ ...scoreForm, quarter: parseInt(e.target.value, 10) })}
                  className="bg-bg-input border border-border rounded-lg px-2 py-2 text-xs text-text-primary"
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>Q{q}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-1">{board.games?.away_team}</label>
                <input
                  type="number"
                  min={0}
                  value={scoreForm.awayScore}
                  onChange={(e) => setScoreForm({ ...scoreForm, awayScore: e.target.value })}
                  className="w-16 bg-bg-input border border-border rounded-lg px-2 py-2 text-xs text-text-primary text-center"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-muted mb-1">{board.games?.home_team}</label>
                <input
                  type="number"
                  min={0}
                  value={scoreForm.homeScore}
                  onChange={(e) => setScoreForm({ ...scoreForm, homeScore: e.target.value })}
                  className="w-16 bg-bg-input border border-border rounded-lg px-2 py-2 text-xs text-text-primary text-center"
                />
              </div>
              <button
                type="submit"
                disabled={scoreQuarterM.isPending || !scoreForm.awayScore || !scoreForm.homeScore}
                className="px-3 py-2 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover disabled:opacity-50"
              >
                Score
              </button>
            </form>
          )}
        </div>
      )}

      {/* Quarter results */}
      {quarters.some((q) => q.awayScore !== null) && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {quarters.map((q) => (
            <div key={q.quarter} className={`bg-bg-card rounded-xl border p-3 text-center ${
              q.winnerId ? 'border-accent' : 'border-border'
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

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="border-collapse">
            {/* Column headers (home team digits) */}
            <thead>
              <tr>
                <th className="w-8 h-8" />
                {Array.from({ length: 10 }, (_, i) => (
                  <th key={i} className="w-10 h-8 text-center text-xs font-semibold text-accent">
                    {board.digits_locked ? board.col_digits[i] : '?'}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, r) => (
                <tr key={r}>
                  {/* Row header (away team digit) */}
                  <td className="w-8 h-10 text-center text-xs font-semibold text-accent">
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
                          if (!cell && isSelfSelect && !board.digits_locked) handleClaim(r, c)
                        }}
                        className={`w-10 h-10 text-center border border-border text-[9px] font-semibold transition-colors ${
                          isWinning
                            ? 'bg-accent/30 text-accent'
                            : cell
                              ? isMe
                                ? 'bg-accent/10 text-accent'
                                : 'bg-bg-card text-text-secondary'
                              : isSelfSelect && !board.digits_locked
                                ? 'bg-bg-primary hover:bg-bg-card-hover cursor-pointer text-text-muted'
                                : 'bg-bg-primary text-text-muted'
                        }`}
                      >
                        {cell
                          ? cell.users?.avatar_emoji || cell.users?.username?.slice(0, 3) || '?'
                          : ''}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {/* Axis labels */}
          {board.games && (
            <div className="flex justify-between text-[10px] text-text-muted mt-2 px-8">
              <span>Rows: {board.games.away_team}</span>
              <span>Columns: {board.games.home_team}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

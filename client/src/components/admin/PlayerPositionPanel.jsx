import { useState } from 'react'
import { usePlayerPositionOverrides, useCreatePositionOverride, useDeletePositionOverride } from '../../hooks/useAdmin'
import { toast } from '../ui/Toast'

const SPORT_OPTIONS = [
  { key: 'basketball_nba', label: 'NBA' },
  { key: 'americanfootball_nfl', label: 'NFL' },
  { key: 'baseball_mlb', label: 'MLB' },
  { key: 'icehockey_nhl', label: 'NHL' },
  { key: 'basketball_wnba', label: 'WNBA' },
]

export default function PlayerPositionPanel() {
  const { data: overrides, isLoading } = usePlayerPositionOverrides()
  const createOverride = useCreatePositionOverride()
  const deleteOverride = useDeletePositionOverride()
  const [playerName, setPlayerName] = useState('')
  const [position, setPosition] = useState('')
  const [sportKey, setSportKey] = useState('basketball_nba')

  async function handleAdd(e) {
    e.preventDefault()
    if (!playerName.trim() || !position.trim()) return
    try {
      await createOverride.mutateAsync({ player_name: playerName.trim(), position: position.trim(), sport_key: sportKey })
      toast('Position override saved', 'success')
      setPlayerName('')
      setPosition('')
    } catch (err) {
      toast(err.message || 'Failed to save', 'error')
    }
  }

  async function handleDelete(id) {
    try {
      await deleteOverride.mutateAsync(id)
      toast('Override removed', 'success')
    } catch (err) {
      toast(err.message || 'Failed to remove', 'error')
    }
  }

  return (
    <div>
      <h2 className="font-display text-lg mb-4">Player Position Overrides</h2>
      <p className="text-xs text-text-muted mb-4">Override positions from ESPN data. These apply to DFS rosters, starters, and prop cards.</p>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2 mb-6">
        <input
          type="text"
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="Player name"
          className="flex-1 min-w-[150px] bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <input
          type="text"
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          placeholder="Position (e.g. PF/C)"
          className="w-32 bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
        />
        <select
          value={sportKey}
          onChange={(e) => setSportKey(e.target.value)}
          className="bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
        >
          {SPORT_OPTIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!playerName.trim() || !position.trim() || createOverride.isPending}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
        >
          {createOverride.isPending ? '...' : 'Add'}
        </button>
      </form>

      {isLoading ? (
        <p className="text-sm text-text-muted">Loading...</p>
      ) : !overrides?.length ? (
        <p className="text-sm text-text-muted">No overrides yet.</p>
      ) : (
        <div className="space-y-2">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between bg-bg-primary border border-text-primary/20 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm font-semibold text-text-primary truncate">{o.player_name}</span>
                <span className="text-xs font-bold text-accent">{o.position}</span>
                <span className="text-[10px] text-text-muted">{SPORT_OPTIONS.find((s) => s.key === o.sport_key)?.label || o.sport_key}</span>
              </div>
              <button
                onClick={() => handleDelete(o.id)}
                disabled={deleteOverride.isPending}
                className="text-xs text-text-muted hover:text-incorrect transition-colors disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

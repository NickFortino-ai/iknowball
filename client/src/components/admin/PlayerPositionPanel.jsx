import { useState, useRef } from 'react'
import { usePlayerPositionOverrides, useCreatePositionOverride, useDeletePositionOverride, useAdminPlayerSearch } from '../../hooks/useAdmin'
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
  const [searchText, setSearchText] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState(null)
  const [position, setPosition] = useState('')
  const [sportKey, setSportKey] = useState('basketball_nba')
  const [showDropdown, setShowDropdown] = useState(false)
  const inputRef = useRef(null)

  const { data: searchResults } = useAdminPlayerSearch(showDropdown ? searchText : null)

  function handleSelectPlayer(player) {
    setSelectedPlayer(player)
    setSearchText(player.player_name)
    setShowDropdown(false)
  }

  function handleSearchChange(e) {
    setSearchText(e.target.value)
    setSelectedPlayer(null)
    setShowDropdown(e.target.value.length >= 2)
  }

  async function handleAdd(e) {
    e.preventDefault()
    const name = selectedPlayer?.player_name || searchText.trim()
    if (!name || !position.trim()) return
    try {
      await createOverride.mutateAsync({ player_name: name, position: position.trim(), sport_key: sportKey })
      toast('Position override saved', 'success')
      setSearchText('')
      setSelectedPlayer(null)
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

      <form onSubmit={handleAdd} className="space-y-3 mb-6">
        <div className="flex flex-wrap gap-2 items-end">
          {/* Player search */}
          <div className="flex-1 min-w-[200px] relative">
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Player</label>
            <input
              ref={inputRef}
              type="text"
              value={searchText}
              onChange={handleSearchChange}
              onFocus={() => searchText.length >= 2 && setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="Search player name..."
              className="w-full bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
            />
            {showDropdown && searchResults?.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-text-primary/20 rounded-xl shadow-lg z-10 overflow-hidden max-h-60 overflow-y-auto">
                {searchResults.map((p) => (
                  <button
                    key={p.player_name}
                    type="button"
                    onClick={() => handleSelectPlayer(p)}
                    className="w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-text-primary/5 transition-colors border-b border-text-primary/10 last:border-b-0"
                  >
                    <div>
                      <span className="text-sm font-semibold text-text-primary">{p.player_name}</span>
                      <span className="text-xs text-text-muted ml-2">{p.team}</span>
                    </div>
                    <span className="text-xs font-bold text-text-secondary">{p.position}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sport selector */}
          <div>
            <label className="text-[10px] text-text-muted uppercase tracking-wider mb-1 block">Sport</label>
            <select
              value={sportKey}
              onChange={(e) => setSportKey(e.target.value)}
              className="bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              {SPORT_OPTIONS.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected player info + position change */}
        {selectedPlayer && (
          <div className="bg-bg-primary border border-text-primary/20 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-text-primary">{selectedPlayer.player_name}</span>
              <span className="text-xs text-text-muted">Current: <span className="text-text-secondary font-bold">{selectedPlayer.position}</span></span>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted shrink-0">Change to:</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. PF/C"
                className="flex-1 bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
              />
              <button
                type="submit"
                disabled={!position.trim() || createOverride.isPending}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50"
              >
                {createOverride.isPending ? '...' : 'Save'}
              </button>
            </div>
          </div>
        )}
      </form>

      {/* Existing overrides */}
      <h3 className="text-xs text-text-muted uppercase tracking-wider mb-2">Active Overrides</h3>
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

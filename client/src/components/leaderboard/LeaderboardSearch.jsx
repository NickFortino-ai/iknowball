import { useEffect, useRef, useState } from 'react'
import { useUserSearch } from '../../hooks/useLeaderboard'
import Avatar from '../ui/Avatar'

// Search control that sits next to the Leaderboard title. Collapsed by
// default (just the magnifying glass icon). Tapping expands an input
// with autocomplete. Selecting a suggestion calls onSelect(user) so
// the parent page can re-query the current tab's leaderboard for that
// user and render a single-row result.
//
// Usage:
//   <LeaderboardSearch onSelect={(user) => setSearchedUser(user)} />
//
// 3-char min for autocomplete (keeps result lists manageable without
// needing server-side pagination).

export default function LeaderboardSearch({ onSelect }) {
  const [expanded, setExpanded] = useState(false)
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  const { data: suggestions, isFetching } = useUserSearch(debounced)

  // Debounce the query at 250ms before firing the autocomplete fetch.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250)
    return () => clearTimeout(t)
  }, [query])

  // Focus the input when the search expands.
  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded])

  // Collapse when user clicks outside or presses ESC.
  useEffect(() => {
    if (!expanded) return
    function onDocClick(e) {
      if (!containerRef.current?.contains(e.target)) {
        setExpanded(false)
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  function handleSelect(user) {
    onSelect?.(user)
    setExpanded(false)
    setQuery('')
    setDebounced('')
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        aria-label="Search leaderboard"
        className="shrink-0 p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-text-primary/5 transition-colors"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    )
  }

  const showEmptyHint = debounced.length > 0 && debounced.length < 3
  const showNoResults = debounced.length >= 3 && !isFetching && suggestions?.length === 0

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md">
      <div className="flex items-center gap-2 bg-bg-primary border border-text-primary/20 rounded-lg px-3 py-1.5">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted shrink-0">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name…"
          className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted focus:outline-none min-w-0"
        />
        <button
          onClick={() => setExpanded(false)}
          aria-label="Close search"
          className="shrink-0 text-text-muted hover:text-text-primary"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {(showEmptyHint || showNoResults || (suggestions && suggestions.length > 0)) && (
        <div className="absolute left-0 right-0 mt-1 bg-bg-primary border border-text-primary/20 rounded-lg shadow-lg overflow-hidden z-20 max-h-80 overflow-y-auto">
          {showEmptyHint && (
            <div className="px-3 py-2 text-xs text-text-muted">
              Keep typing — at least 3 characters.
            </div>
          )}
          {showNoResults && (
            <div className="px-3 py-2 text-xs text-text-muted">No users found.</div>
          )}
          {suggestions?.map((user) => (
            <button
              key={user.id}
              onClick={() => handleSelect(user)}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-text-primary/5 transition-colors text-left"
            >
              <Avatar user={user} size="md" />
              <div className="min-w-0">
                <div className="text-sm font-semibold text-text-primary truncate">
                  {user.display_name || user.username}
                </div>
                <div className="text-xs text-text-muted truncate">@{user.username}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

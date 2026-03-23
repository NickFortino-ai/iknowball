import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import {
  useBracketTournament,
  useBracketEntry,
  useBracketEntries,
  useViewBracketEntry,
} from '../../hooks/useLeagues'
import { useAuth } from '../../hooks/useAuth'
import BracketDisplay from './BracketDisplay'
import BracketPicker from './BracketPicker'
import BracketStandings from './BracketStandings'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'

export default function BracketView({ league, tab = 'bracket', onTabChange, tabs: heroTabs, activeTabIndex, onTabSelect }) {
  const { profile } = useAuth()
  const { data: tournament, isLoading: tournamentLoading } = useBracketTournament(league.id)
  const { data: myEntry } = useBracketEntry(league.id)
  const { data: entries } = useBracketEntries(league.id)

  // Check for saved draft
  const savedDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem(`bracket-draft-${league.id}`)
      if (!raw) return null
      const draft = JSON.parse(raw)
      const pickCount = draft?.picks ? Object.keys(draft.picks).length : 0
      return pickCount > 0 ? { ...draft, pickCount } : null
    } catch { return null }
  }, [league.id])

  const [showPicker, setShowPicker] = useState(!!savedDraft)
  const [viewingUserId, setViewingUserId] = useState(null)
  const [hasDefaulted, setHasDefaulted] = useState(false)
  const viewTab = tab

  // Default to user's own bracket once data loads
  useEffect(() => {
    if (!hasDefaulted && myEntry && profile?.id) {
      setViewingUserId(profile.id)
      setHasDefaulted(true)
    }
  }, [myEntry, profile?.id, hasDefaulted])

  const { data: viewedEntry } = useViewBracketEntry(
    league.id,
    viewingUserId && viewingUserId !== profile?.id ? viewingUserId : null
  )

  const bracketRef = useRef(null)
  const [sharing, setSharing] = useState(false)

  const handleShareBracket = useCallback(async () => {
    if (!bracketRef.current || sharing) return
    setSharing(true)
    try {
      const { toPng } = await import('html-to-image')
      const el = bracketRef.current

      // Temporarily expand to full size for capture
      const prevOverflow = el.style.overflow
      const prevWidth = el.style.width
      el.style.overflow = 'visible'
      el.style.width = `${el.scrollWidth}px`

      const dataUrl = await toPng(el, {
        backgroundColor: '#000000',
        pixelRatio: 2,
      })

      // Restore
      el.style.overflow = prevOverflow
      el.style.width = prevWidth

      // Load the captured image onto a canvas to add branding
      const img = new Image()
      img.src = dataUrl
      await new Promise((resolve) => { img.onload = resolve })

      const finalCanvas = document.createElement('canvas')
      const headerHeight = 80
      const footerHeight = 100
      finalCanvas.width = img.width
      finalCanvas.height = img.height + headerHeight + footerHeight
      const ctx = finalCanvas.getContext('2d')

      // Background
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, finalCanvas.width, finalCanvas.height)

      // Header
      ctx.fillStyle = '#e86833'
      ctx.font = 'bold 36px system-ui, sans-serif'
      ctx.textAlign = 'center'
      const viewingName = viewingUserId
        ? viewingUserId === profile?.id
          ? profile?.display_name || profile?.username || 'My Bracket'
          : entries?.find((e) => e.user_id === viewingUserId)?.users?.display_name || 'Bracket'
        : 'Master Bracket'
      ctx.fillText(viewingName, finalCanvas.width / 2, 50)

      // Bracket image
      ctx.drawImage(img, 0, headerHeight)

      // Footer
      ctx.fillStyle = '#e86833'
      ctx.font = 'bold 64px system-ui, sans-serif'
      ctx.fillText('I KNOW BALL', finalCanvas.width / 2, img.height + headerHeight + 55)

      finalCanvas.toBlob(async (blob) => {
        if (!blob) { toast('Failed to generate image', 'error'); return }
        const file = new File([blob], 'bracket.png', { type: 'image/png' })

        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: 'My Bracket — I KNOW BALL' })
          } catch (e) {
            if (e.name !== 'AbortError') toast('Share cancelled', 'error')
          }
        } else {
          // Download fallback
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `bracket-${viewingName.replace(/\s+/g, '-').toLowerCase()}.png`
          a.click()
          URL.revokeObjectURL(url)
          toast('Bracket image downloaded', 'success')
        }
      }, 'image/png')
    } catch (err) {
      console.error('Share bracket failed:', err)
      toast('Failed to generate bracket image', 'error')
    } finally {
      setSharing(false)
    }
  }, [sharing, viewingUserId, profile, entries])

  if (tournamentLoading) return <LoadingSpinner />
  if (!tournament) return <EmptyState title="No tournament" message="Tournament data not available" />

  const isLocked = new Date(tournament.locks_at) <= new Date()
  const hasSubmitted = !!myEntry
  const rounds = tournament.bracket_templates?.rounds || []

  // Detect missing FF/Championship picks for grace period
  const roundNumbers = rounds.map((r) => r.round_number)
  const maxRound = roundNumbers.length ? Math.max(...roundNumbers) : 0
  const ffMinRound = maxRound - 1
  const hasMissingFFPicks = hasSubmitted && isLocked && maxRound > 0 && (tournament.matchups || [])
    .filter((m) => m.round_number >= ffMinRound)
    .some((m) => {
      const pick = myEntry?.picks?.find((p) => p.template_matchup_id === m.template_matchup_id)
      return !pick
    })

  // Check if bracket is populated (first-round matchups have teams)
  const firstRoundMatchups = (tournament.matchups || []).filter((m) => m.round_number === 1 || m.round_number === 0)
  const isBracketPopulated = firstRoundMatchups.length > 0 && firstRoundMatchups.some(
    (m) => m.team_top || m.team_bottom
  )

  const picksAvailableAt = tournament.bracket_templates?.picks_available_at
  const picksAvailableNow = !picksAvailableAt || new Date(picksAvailableAt) <= new Date()

  // State A: Bracket not populated yet
  if (!isBracketPopulated) {
    const templateName = tournament.bracket_templates?.name
    const locksAtDate = tournament.locks_at
      ? new Date(tournament.locks_at).toLocaleString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        })
      : null

    return (
      <div className="bg-bg-card rounded-xl border border-border p-6 text-center">
        <div className="text-4xl mb-3">&#x1F3C0;</div>
        <h3 className="font-display text-lg text-text-primary mb-2">
          Welcome to the {templateName || 'Tournament'} Challenge!
        </h3>
        <p className="text-sm text-text-muted mb-3">
          The tournament bracket hasn't been set yet.
        </p>
        {picksAvailableAt && (
          <p className="text-sm text-text-muted mb-1">
            Your bracket will be available to fill out starting{' '}
            <span className="text-text-secondary font-semibold">
              {new Date(picksAvailableAt).toLocaleString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric',
                hour: 'numeric', minute: '2-digit',
              })}
            </span>
          </p>
        )}
        {locksAtDate && (
          <p className="text-sm text-text-muted">
            Brackets must be completed by{' '}
            <span className="text-text-secondary font-semibold">{locksAtDate}</span>
          </p>
        )}
      </div>
    )
  }

  // State B: Bracket populated but picks not available yet
  const picksBlocked = !picksAvailableNow && !isLocked

  // Show picker if user chose to fill bracket
  if (showPicker && viewTab === 'bracket' && (!isLocked || hasMissingFFPicks) && picksAvailableNow) {
    return (
      <BracketPicker
        league={league}
        tournament={tournament}
        matchups={tournament.matchups}
        existingPicks={myEntry?.picks}
        existingTiebreakerScore={myEntry?.tiebreaker_score}
        onClose={() => setShowPicker(false)}
        ffOnlyMode={isLocked && hasMissingFFPicks}
      />
    )
  }

  const displayPicks = viewingUserId === profile?.id
    ? myEntry?.picks
    : viewedEntry?.picks || null

  const showCourtBg = league.sport === 'basketball_ncaab' || league.sport === 'basketball_wncaab'

  return (
    <div>
      {/* Hero area with optional court background for March Madness */}
      <div className={`relative rounded-xl mb-4 overflow-hidden ${showCourtBg ? '' : ''}`}>
        {showCourtBg && (
          <>
            <img
              src="/bracket-bg.png"
              alt=""
              className="absolute inset-0 w-full h-full object-cover object-bottom opacity-40 pointer-events-none"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-bg-primary/70 via-transparent to-bg-primary pointer-events-none" />
          </>
        )}

        <div className="relative z-10 p-4">
          {/* Picks not available yet banner */}
          {picksBlocked && (
            <div className="bg-accent/10 border border-accent/30 rounded-xl p-4 text-center">
              <div className="text-sm text-text-secondary font-semibold mb-1">
                Picks open {new Date(picksAvailableAt).toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit',
                })}
              </div>
              <div className="text-xs text-text-muted">Review the bracket in the meantime!</div>
            </div>
          )}

          {/* Status banner */}
          {!isLocked && !picksBlocked && (
            <div className={`${showCourtBg ? '' : 'bg-bg-card rounded-xl border border-border'} p-4 text-center`}>
              <div className="text-sm text-text-secondary mb-2">
                {hasSubmitted
                  ? 'Your bracket has been submitted!'
                  : savedDraft
                    ? `You have a bracket in progress (${savedDraft.pickCount} picks made)`
                    : 'Fill out your bracket before the lock.'}
              </div>
              <div className="text-xs text-text-muted mb-3">
                Locks: {new Date(tournament.locks_at).toLocaleString('en-US', {
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </div>
              <button
                onClick={() => setShowPicker(true)}
                className="px-6 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                {hasSubmitted ? 'Edit Bracket' : savedDraft ? 'Continue Bracket' : 'Fill Your Bracket'}
              </button>
            </div>
          )}

          {hasMissingFFPicks && (
            <div className={`${showCourtBg ? '' : 'bg-bg-card rounded-xl border border-border'} p-4 text-center`}>
              <div className="text-sm text-text-secondary mb-2">
                Your Final Four and Championship picks are incomplete
              </div>
              <button
                onClick={() => setShowPicker(true)}
                className="px-6 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Complete Bracket
              </button>
            </div>
          )}

          {isLocked && !hasSubmitted && (
            <div className={`${showCourtBg ? '' : 'bg-bg-card border border-border rounded-xl'} p-5 text-center`}>
              <div className="text-sm text-text-primary font-semibold mb-2">Bracket not submitted in time</div>
              <div className="text-xs text-text-muted leading-relaxed">
                You didn't get your bracket in before this tournament locked. But don't worry — I KNOW BALL has plenty of ways to compete and showcase your sports prediction powers!
              </div>
            </div>
          )}

          {/* Tabs inside hero area (when locked, parent hides its own tabs) */}
          {heroTabs && (
            <div className="flex gap-2 mt-3">
              {heroTabs.map((t, i) => (
                <button
                  key={t}
                  onClick={() => onTabSelect?.(i)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    activeTabIndex === i
                      ? 'bg-accent text-white'
                      : 'bg-bg-card/60 backdrop-blur-sm text-text-secondary hover:bg-bg-card-hover/60'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {viewTab === 'bracket' && (
        <div>
          {/* User bracket selector (after lock) */}
          {isLocked && entries?.length > 0 && (
            <div className="mb-4">
              <div className="flex gap-1 overflow-x-auto pb-1">
                <button
                  onClick={() => setViewingUserId(null)}
                  className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    !viewingUserId ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                  }`}
                >
                  Master
                </button>
                {entries.map((e) => (
                  <button
                    key={e.user_id}
                    onClick={() => setViewingUserId(e.user_id)}
                    className={`shrink-0 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      viewingUserId === e.user_id ? 'bg-accent/20 text-accent' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
                    }`}
                  >
                    {e.user_id === profile?.id ? 'My Bracket' : e.users?.display_name || e.users?.username}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Share bracket button */}
          <div className="flex justify-end mb-2">
            <button
              onClick={handleShareBracket}
              disabled={sharing}
              className="flex items-center gap-1.5 text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
              {sharing ? 'Generating...' : 'Share Bracket'}
            </button>
          </div>

          <BracketDisplay
            ref={bracketRef}
            matchups={tournament.matchups}
            picks={viewingUserId ? displayPicks : null}
            rounds={rounds}
            regions={tournament.bracket_templates?.regions}
          />
        </div>
      )}

      {viewTab === 'standings' && (
        <BracketStandings
          entries={entries}
          championshipTotalScore={tournament?.championship_total_score}
          onViewBracket={isLocked ? (userId) => {
            setViewingUserId(userId)
            onTabChange?.('bracket')
          } : null}
        />
      )}
    </div>
  )
}

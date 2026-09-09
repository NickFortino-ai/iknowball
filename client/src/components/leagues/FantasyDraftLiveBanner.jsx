import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDraftBoard, useRealtimeDraft } from '../../hooks/useLeagues'
import { playTone, buzz } from '../../lib/draftAudio'

/**
 * Global "draft is live" banner — mounts at the league page level so it
 * stays visible on every tab inside the league (Thread, Members, etc.),
 * not just the Draft tab. Fires the on-the-clock audio + title flash
 * from here too, so users who navigate away still get alerted.
 *
 * Hidden when the user is currently viewing the Draft tab — that view
 * has its own in-room sticky banner.
 */
export default function FantasyDraftLiveBanner({ league, fantasySettings, onGoToDraft, isOnDraftTab }) {
  const { profile } = useAuth()
  const { data: draftData } = useDraftBoard(
    league?.format === 'fantasy' && fantasySettings?.draft_status === 'in_progress' ? league.id : null,
  )
  useRealtimeDraft(
    league?.format === 'fantasy' && fantasySettings?.draft_status === 'in_progress' ? league.id : null,
  )

  const picks = draftData?.picks || []
  const currentPick = useMemo(() => picks.find((p) => !p.player_id) || null, [picks])
  const isMyTurn = !!currentPick && currentPick.user_id === profile?.id

  const picksUntilMine = useMemo(() => {
    if (!currentPick || !profile?.id) return null
    const remaining = picks
      .filter((p) => !p.player_id)
      .sort((a, b) => a.pick_number - b.pick_number)
    const idx = remaining.findIndex((p) => p.user_id === profile.id)
    return idx < 0 ? null : idx
  }, [picks, currentPick, profile?.id])

  // Live-updating timer
  const [timerSeconds, setTimerSeconds] = useState(null)
  useEffect(() => {
    if (!currentPick || !fantasySettings?.draft_pick_timer) {
      setTimerSeconds(null)
      return
    }
    const completed = picks.filter((p) => p.player_id)
    const lastPick = completed[completed.length - 1]
    const lastPickTime = lastPick?.picked_at ? new Date(lastPick.picked_at) : new Date()

    const tick = () => {
      const elapsed = (Date.now() - lastPickTime.getTime()) / 1000
      setTimerSeconds(Math.max(0, Math.ceil(fantasySettings.draft_pick_timer - elapsed)))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [currentPick?.pick_number, fantasySettings?.draft_pick_timer])

  // On-the-clock alert — fires when isMyTurn flips false → true.
  // Lives at the league-page level so it works on every tab.
  const wasMyTurnRef = useRef(false)
  // The tab title before any flashing. Captured once at mount, because the
  // old code read document.title at flash time — so if a second flash began
  // while a previous one was mid-cycle, `original` captured "⏰ YOU'RE UP"
  // itself and every later "restore" put the alarm clock back. That is how it
  // survived the end of the draft.
  const baseTitleRef = useRef(typeof document !== 'undefined' ? document.title : '')
  useEffect(() => {
    const fire = isMyTurn && !wasMyTurnRef.current
    wasMyTurnRef.current = isMyTurn
    if (!fire) return undefined
    playTone({ freq: 880, dur: 0.4, gain: 0.15 })
    buzz([160, 80, 160])
    const original = baseTitleRef.current
    let flashCount = 0
    const flashTimer = setInterval(() => {
      document.title = flashCount % 2 === 0 ? "⏰ YOU'RE UP" : original
      flashCount++
      if (flashCount > 10) {
        clearInterval(flashTimer)
        document.title = original
      }
    }, 800)
    // Unmounting mid-flash used to leave the interval running and the alarm
    // clock stuck in the tab.
    return () => {
      clearInterval(flashTimer)
      document.title = original
    }
  }, [isMyTurn])

  if (league?.format !== 'fantasy') return null
  if (fantasySettings?.draft_status !== 'in_progress') return null
  if (!currentPick) return null
  if (isOnDraftTab) return null

  const onClockName = currentPick.users?.display_name || currentPick.users?.username || 'Someone'
  const turnText = isMyTurn
    ? "You're on the clock!"
    : picksUntilMine != null
      ? `${onClockName} is picking · ${picksUntilMine} pick${picksUntilMine === 1 ? '' : 's'} until you`
      : `${onClockName} is picking…`

  return (
    <div
      onClick={onGoToDraft}
      className={`relative z-10 mb-3 rounded-xl px-4 py-2.5 flex items-center justify-center gap-3 flex-wrap bg-bg-primary border cursor-pointer transition-colors hover:bg-bg-primary/80 ${
        isMyTurn ? 'border-accent shadow-[0_0_8px_rgba(255,140,0,0.4)]' : 'border-text-primary/20'
      }`}
    >
      <div className="font-display text-sm md:text-base text-white">
        R{currentPick.round} · PICK {currentPick.pick_number}
      </div>
      <div className={`font-display text-sm md:text-base ${isMyTurn ? 'text-accent' : 'text-text-secondary'}`}>
        {turnText}
      </div>
      {timerSeconds != null && (
        <div className={`font-display text-sm md:text-base tabular-nums ${timerSeconds <= 10 ? 'text-incorrect' : 'text-text-primary'}`}>
          {Math.floor(timerSeconds / 60)}:{String(timerSeconds % 60).padStart(2, '0')}
        </div>
      )}
      <div className="text-xs font-semibold text-accent underline">Go to Draft →</div>
    </div>
  )
}

/**
 * Shared, unlocked audio for the draft room.
 *
 * The draft's beeps never played on a phone. Three call sites each did:
 *
 *     const ctx = new AudioContext()   // brand new context, every beep
 *     osc.start()
 *
 * Two problems, both silent because the calls sat inside `try {} catch {}`:
 *
 *   1. On iOS an AudioContext is created SUSPENDED and only resumes inside
 *      a user gesture. These were created in a timer callback, which is not
 *      a gesture, so nothing ever played.
 *   2. A new context per beep. iOS caps how many a page may create, so even
 *      if one had worked, later ones would fail outright.
 *
 * So: one context for the page, unlocked on the first real interaction,
 * resumed before every tone.
 *
 * Reported live during The Friends League draft, 2026-09-05 — "I'm not
 * hearing any sounds for when it's the user's turn" — with 49% of picks
 * autopicked, partly because nobody heard their turn begin.
 */

let ctx = null
let unlockBound = false

function getCtx() {
  if (ctx) return ctx
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  try {
    ctx = new Ctx()
  } catch {
    return null
  }
  return ctx
}

/**
 * Unlock from inside a real user gesture. iOS wants both a resume() AND a
 * buffer actually played within the gesture — resume() alone leaves some
 * versions silent until the first real sound.
 */
function unlock() {
  const c = getCtx()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  try {
    const buf = c.createBuffer(1, 1, 22050)
    const src = c.createBufferSource()
    src.buffer = buf
    src.connect(c.destination)
    src.start(0)
  } catch {}
}

/**
 * Bind the one-time unlock. Safe to call repeatedly — binds once.
 * Listeners stay attached because iOS can re-suspend the context when the
 * app is backgrounded, and a draft runs for the better part of an hour
 * with the phone locking in between.
 */
export function initDraftAudio() {
  if (unlockBound || typeof document === 'undefined') return
  unlockBound = true
  const opts = { passive: true }
  document.addEventListener('pointerdown', unlock, opts)
  document.addEventListener('touchend', unlock, opts)
  document.addEventListener('keydown', unlock, opts)
}

/**
 * Play a short tone. No-op if the context can't be created or is still
 * locked — never throws, never blocks a render.
 */
export function playTone({ freq = 880, dur = 0.18, gain = 0.13 } = {}) {
  const c = getCtx()
  if (!c) return
  // Backgrounding suspends the context; resume before every tone rather
  // than assuming the gesture unlock is still in effect.
  if (c.state === 'suspended') c.resume().catch(() => {})
  try {
    const o = c.createOscillator()
    const g = c.createGain()
    o.connect(g)
    g.connect(c.destination)
    o.frequency.value = freq
    g.gain.setValueAtTime(gain, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur)
    o.start()
    o.stop(c.currentTime + dur)
  } catch {}
}

/**
 * Haptic buzz. Deliberately paired with the "you're on the clock" tone:
 * iOS Web Audio obeys the physical silent switch inside a Capacitor
 * WebView, so a muted phone hears nothing no matter what we do here.
 * Vibration still lands. Android supports this; iOS Safari ignores it,
 * which is a no-op rather than an error.
 */
export function buzz(pattern = [120, 60, 120]) {
  try {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern)
  } catch {}
}

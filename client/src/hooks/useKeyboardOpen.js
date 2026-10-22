import { useEffect, useState } from 'react'

/**
 * True while an on-screen keyboard is up.
 *
 * Tracked by FOCUS, not by viewport maths. The obvious approach — watch
 * visualViewport and infer the keyboard from the height it eats — does not
 * work in this app: capacitor.config sets the Keyboard plugin to
 * `resize: "native"`, so iOS resizes the WEBVIEW itself and
 * window.innerHeight shrinks in step with visualViewport.height. The
 * difference between them, which is how you would measure the keyboard,
 * stays 0. That is also why --kb-inset computes to 0 on device and the
 * summary bar sat visibly above the keyboard rather than under it.
 *
 * Focus is the honest signal anyway: the question a caller is really asking
 * is "is the user typing", and that is answerable without guessing at
 * pixels. Covers inputs, textareas and contenteditable; ignores checkboxes,
 * buttons and the like, which take focus without raising a keyboard.
 */
const TYPING_TYPES = new Set([
  'text', 'search', 'email', 'url', 'tel', 'password', 'number',
])

function raisesKeyboard(el) {
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag !== 'INPUT') return false
  // A missing type attribute defaults to text.
  return TYPING_TYPES.has((el.getAttribute('type') || 'text').toLowerCase())
}

export function useKeyboardOpen() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onFocusIn = (e) => setOpen(raisesKeyboard(e.target))
    // focusout fires before the next focusin, so a tab between two inputs
    // would flicker closed. Settle on the element that actually ends up
    // focused rather than the one leaving.
    const onFocusOut = () => {
      requestAnimationFrame(() => setOpen(raisesKeyboard(document.activeElement)))
    }
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    // Mount can land with something already focused (returning to a page
    // with a persisted search field).
    setOpen(raisesKeyboard(document.activeElement))
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  return open
}

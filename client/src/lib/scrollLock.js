// Ref-counted body scroll lock — safe for nested modals
let lockCount = 0

export function lockScroll() {
  lockCount++
  document.body.style.overflow = 'hidden'
}

export function unlockScroll() {
  lockCount--
  if (lockCount <= 0) {
    lockCount = 0
    document.body.style.overflow = ''
  }
}

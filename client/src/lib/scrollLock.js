// Ref-counted body scroll lock — safe for nested modals
// Uses position:fixed on iOS to truly prevent background scrolling
let lockCount = 0
let savedScrollY = 0

export function lockScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
  }
  lockCount++
}

export function unlockScroll() {
  lockCount--
  if (lockCount <= 0) {
    lockCount = 0
    document.body.style.overflow = ''
    document.body.style.position = ''
    document.body.style.top = ''
    document.body.style.left = ''
    document.body.style.right = ''
    window.scrollTo(0, savedScrollY)
  }
}

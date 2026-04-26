// Ref-counted body scroll lock — safe for nested modals.
// Locks document.body (window scroll on desktop) AND the AppShell <main>
// (which has its own overflow-y-auto context on mobile) so the page
// underneath doesn't drift while a modal is open.
let lockCount = 0
let savedScrollY = 0
let savedMainScrollTop = 0

function getMain() {
  return document.querySelector('main')
}

export function lockScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${savedScrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'

    const main = getMain()
    if (main) {
      savedMainScrollTop = main.scrollTop
      main.style.overflow = 'hidden'
    }
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

    const main = getMain()
    if (main) {
      main.style.overflow = ''
      main.scrollTop = savedMainScrollTop
    }
  }
}

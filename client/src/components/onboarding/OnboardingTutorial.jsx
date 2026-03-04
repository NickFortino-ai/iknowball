import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import ONBOARDING_STEPS from './OnboardingSteps'

const TOTAL_STEPS = ONBOARDING_STEPS.length

export default function OnboardingTutorial() {
  const profile = useAuthStore((s) => s.profile)
  const completeOnboarding = useAuthStore((s) => s.completeOnboarding)
  const navigate = useNavigate()
  const location = useLocation()

  const [active, setActive] = useState(false)
  const [step, setStep] = useState(0)
  const [targetRect, setTargetRect] = useState(null)
  const [transitioning, setTransitioning] = useState(false)
  const [mounted, setMounted] = useState(false)
  const observerRef = useRef(null)
  const timeoutRef = useRef(null)
  const returnPathRef = useRef(null)

  // Trigger logic
  useEffect(() => {
    if (profile && !profile.has_seen_onboarding && profile.is_paid) {
      // Remember where the user was so we can return them after the tutorial
      returnPathRef.current = location.pathname
      setActive(true)
      // Slight delay for mount animation
      requestAnimationFrame(() => setMounted(true))
    }
  }, [profile])

  const currentStep = ONBOARDING_STEPS[step]

  // Measure target element
  const scrolledRef = useRef(false)
  const measureTarget = useCallback(() => {
    if (!currentStep?.targetSelector) {
      setTargetRect(null)
      return true
    }
    // Use querySelectorAll and find the first visible element (non-zero dimensions)
    // This handles elements that exist in both mobile and desktop layouts
    const candidates = document.querySelectorAll(currentStep.targetSelector)
    let el = null
    for (const candidate of candidates) {
      const r = candidate.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) { el = candidate; break }
    }
    if (!el && candidates.length > 0) el = candidates[0] // fallback to first match
    if (el) {
      // Scroll target into view on first discovery
      if (!scrolledRef.current) {
        scrolledRef.current = true
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      const rect = el.getBoundingClientRect()
      const padding = currentStep.padding ?? 8
      setTargetRect({
        x: rect.left - padding,
        y: rect.top - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        rx: currentStep.borderRadius ?? 16,
      })
      return true
    }
    return false
  }, [currentStep])

  // Navigate to step's page and find target
  useEffect(() => {
    if (!active) return

    // Clear stale target rect from previous step immediately
    setTargetRect(null)
    scrolledRef.current = false

    // Clean up previous observers/timeouts
    if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }

    const stepData = ONBOARDING_STEPS[step]

    // Navigate if needed
    if (stepData.page && location.pathname !== stepData.page) {
      navigate(stepData.page)
    }

    // Fullscreen step — no target needed
    if (!stepData.targetSelector) {
      setTargetRect(null)
      return
    }

    // Try measuring immediately
    if (measureTarget()) return

    // Set up MutationObserver to watch for the element
    const observer = new MutationObserver(() => {
      if (measureTarget()) {
        observer.disconnect()
        observerRef.current = null
        if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    observerRef.current = observer

    // 3-second timeout → fallback to fullscreen
    timeoutRef.current = setTimeout(() => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null }
      setTargetRect(null) // fullscreen fallback
    }, 3000)

    return () => {
      if (observerRef.current) { observerRef.current.disconnect(); observerRef.current = null }
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    }
  }, [active, step, location.pathname, navigate, measureTarget])

  // Continuously re-measure target position (handles layout shifts from async content)
  useEffect(() => {
    if (!active || !currentStep?.targetSelector) return
    let rafId
    const tick = () => {
      measureTarget()
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [active, currentStep, measureTarget])

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      // Complete — return to where the user was, or /picks as fallback
      const returnTo = returnPathRef.current || '/picks'
      setMounted(false)
      setTimeout(() => {
        setActive(false)
        completeOnboarding()
        navigate(returnTo)
      }, 300)
      return
    }
    setTransitioning(true)
    setTimeout(() => {
      setStep((s) => s + 1)
      setTransitioning(false)
    }, 200)
  }, [step, completeOnboarding, navigate])

  const goBack = useCallback(() => {
    if (step <= 0) return
    setTransitioning(true)
    setTimeout(() => {
      setStep((s) => s - 1)
      setTransitioning(false)
    }, 200)
  }, [step])

  const handleSkip = useCallback(() => {
    setMounted(false)
    setTimeout(() => {
      setActive(false)
      completeOnboarding()
    }, 300)
  }, [completeOnboarding])

  if (!active) return null

  const isFullscreen = !targetRect
  const isFreeScroll = currentStep.freeScroll === true
  const progressPercent = ((step + 1) / TOTAL_STEPS) * 100

  // Tooltip position calculation
  const getTooltipStyle = () => {
    // Free scroll: card docked to right side on desktop, bottom on mobile
    if (isFreeScroll) {
      if (window.innerWidth < 768) {
        return {
          position: 'fixed',
          bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 0.5rem)',
          left: '1rem',
          right: '1rem',
          maxWidth: '24rem',
          margin: '0 auto',
        }
      }
      return {
        position: 'fixed',
        top: '5rem',
        right: '1rem',
        width: '20rem',
      }
    }

    if (isFullscreen) {
      // Center using inset + margin auto — no transform needed
      return {
        position: 'fixed',
        inset: 0,
        margin: 'auto',
        width: 'calc(100% - 2rem)',
        maxWidth: '24rem',
        height: 'fit-content',
      }
    }

    // Mobile: bottom-sheet style above BottomTabBar
    if (window.innerWidth < 768) {
      return {
        position: 'fixed',
        bottom: 'calc(4rem + env(safe-area-inset-bottom, 0px) + 0.5rem)',
        left: '1rem',
        right: '1rem',
        maxWidth: '24rem',
        margin: '0 auto',
      }
    }

    // Desktop: position near the spotlight
    const preferredPos = currentStep.position || 'bottom'
    const style = {
      position: 'fixed',
      maxWidth: '22rem',
      width: '100%',
    }

    // Estimate tooltip height (~220px) and check if it fits below
    const tooltipHeight = 220
    const spaceBelow = window.innerHeight - (targetRect.y + targetRect.height + 12)
    const spaceAbove = targetRect.y - 12

    // Auto-flip: if preferred is bottom but not enough space, go top (and vice versa)
    let pos = preferredPos
    if (pos === 'bottom' && spaceBelow < tooltipHeight && spaceAbove > spaceBelow) {
      pos = 'top'
    } else if (pos === 'top' && spaceAbove < tooltipHeight && spaceBelow > spaceAbove) {
      pos = 'bottom'
    }

    const leftPos = Math.max(16, Math.min(targetRect.x, window.innerWidth - 368))

    if (pos === 'top') {
      style.bottom = `${window.innerHeight - targetRect.y + 12}px`
      style.left = `${leftPos}px`
    } else {
      style.top = `${targetRect.y + targetRect.height + 12}px`
      style.left = `${leftPos}px`
    }

    return style
  }

  return (
    <div
      className={`fixed inset-0 z-[70] transition-opacity duration-300 ${mounted ? 'opacity-100' : 'opacity-0'}`}
      style={{ pointerEvents: isFreeScroll ? 'none' : 'auto' }}
    >
      {/* Dark overlay — skip for freeScroll steps */}
      {!isFreeScroll && (
        isFullscreen ? (
          <div className="fixed inset-0 bg-black/75" />
        ) : (
          <svg
            className="fixed inset-0"
            width="100%"
            height="100%"
            style={{ display: 'block' }}
          >
            <defs>
              <mask id="spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.x}
                  y={targetRect.y}
                  width={targetRect.width}
                  height={targetRect.height}
                  rx={targetRect.rx}
                  ry={targetRect.rx}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.75)"
              mask="url(#spotlight-mask)"
            />
          </svg>
        )
      )}

      {/* Accent border ring around spotlight */}
      {targetRect && (
        <div
          className="fixed pointer-events-none"
          style={{
            left: targetRect.x - 1,
            top: targetRect.y - 1,
            width: targetRect.width + 2,
            height: targetRect.height + 2,
            borderRadius: targetRect.rx + 1,
            border: '2px solid rgba(255, 77, 0, 0.6)',
          }}
        />
      )}

      {/* Click blocker — skip for freeScroll steps */}
      {!isFreeScroll && <div className="fixed inset-0" />}

      {/* Tooltip card */}
      <div
        className={`tutorial-slide-up transition-all duration-200 ${
          transitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
        style={{
          ...getTooltipStyle(),
          zIndex: 71,
          ...(isFreeScroll ? { pointerEvents: 'auto' } : {}),
        }}
      >
        <div className="bg-bg-card border border-border rounded-2xl p-5 shadow-2xl">
          {/* Header: Step counter + Skip */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-text-muted font-semibold">
              {step + 1} / {TOTAL_STEPS}
            </span>
            {step < TOTAL_STEPS - 1 && (
              <button
                onClick={handleSkip}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Skip tutorial
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div className="w-full h-1 bg-bg-secondary rounded-full mb-4 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {/* Title */}
          <h2 className="font-display text-xl mb-2">{currentStep.title}</h2>

          {/* Body */}
          <p className="text-text-secondary text-sm mb-5 leading-relaxed">{currentStep.body}</p>

          {/* Buttons */}
          <div className="flex items-center gap-3">
            {step > 0 && (
              <button
                onClick={goBack}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-text-secondary hover:text-text-primary hover:bg-bg-card-hover transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={goNext}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
            >
              {currentStep.buttonText || 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Shimmer skeleton primitives. Use for inline loading states that match
 * the shape of the content being loaded — much less jarring than a
 * full-page spinner.
 *
 *   <SkeletonBlock className="h-10 w-32" />     // generic block
 *   <SkeletonRow imgSize="w-10 h-10" lines={2} />  // common row layout
 *   <SkeletonRows count={5} />                    // a list of rows
 */
export function SkeletonBlock({ className = '' }) {
  return (
    <div
      className={`animate-pulse bg-text-primary/10 rounded ${className}`}
    />
  )
}

export function SkeletonRow({ imgSize = 'w-10 h-10', lines = 2 }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className={`${imgSize} rounded-full bg-text-primary/10 animate-pulse shrink-0`} />
      <div className="flex-1 space-y-1.5 min-w-0">
        <SkeletonBlock className="h-3 w-3/4" />
        {lines >= 2 && <SkeletonBlock className="h-2.5 w-1/2" />}
      </div>
    </div>
  )
}

export function SkeletonRows({ count = 5, imgSize = 'w-10 h-10', lines = 2 }) {
  return (
    <div className="space-y-1">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} imgSize={imgSize} lines={lines} />
      ))}
    </div>
  )
}

/**
 * Card skeleton: card shape with header + body lines. Good for matchup cards
 * or roster sections.
 */
export function SkeletonCard({ className = '' }) {
  return (
    <div className={`rounded-xl border border-text-primary/10 p-4 space-y-3 ${className}`}>
      <SkeletonBlock className="h-3 w-1/3" />
      <SkeletonBlock className="h-8 w-full" />
      <div className="space-y-1.5">
        <SkeletonBlock className="h-3 w-5/6" />
        <SkeletonBlock className="h-3 w-2/3" />
      </div>
    </div>
  )
}

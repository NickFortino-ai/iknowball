function SkeletonCard() {
  return (
    <div className="bg-bg-card border border-border rounded-xl overflow-hidden border-l-4 border-l-transparent animate-pulse">
      {/* Header */}
      <div className="px-4 pt-3 pb-2 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-bg-secondary" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 bg-bg-secondary rounded w-24" />
          <div className="h-3 bg-bg-secondary rounded w-16" />
        </div>
        <div className="h-3 bg-bg-secondary rounded w-10" />
      </div>

      {/* Body */}
      <div className="px-4 pb-3 space-y-2">
        <div className="h-4 bg-bg-secondary rounded w-full" />
        <div className="h-4 bg-bg-secondary rounded w-3/4" />
      </div>

      {/* Footer */}
      <div className="px-4 pb-3 flex gap-1">
        <div className="h-6 w-10 bg-bg-secondary rounded-full" />
        <div className="h-6 w-10 bg-bg-secondary rounded-full" />
        <div className="h-6 w-10 bg-bg-secondary rounded-full" />
      </div>
    </div>
  )
}

export default function FeedSkeleton() {
  return (
    <div className="space-y-3">
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </div>
  )
}

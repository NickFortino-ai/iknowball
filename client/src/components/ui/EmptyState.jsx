export default function EmptyState({ title, message }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <p className="font-display text-xl text-text-secondary mb-2">{title}</p>
      {message && <p className="text-text-muted text-sm">{message}</p>}
    </div>
  )
}

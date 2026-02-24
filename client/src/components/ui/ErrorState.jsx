export default function ErrorState({ title = 'Something went wrong', message = 'Please try again.', onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <p className="font-display text-xl text-incorrect mb-2">{title}</p>
      {message && <p className="text-text-muted text-sm mb-4">{message}</p>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-5 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  )
}

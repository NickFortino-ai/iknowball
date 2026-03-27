import { useState } from 'react'
import { usePollResults, usePollVote } from '../../hooks/useHotTakes'
import { toast } from '../ui/Toast'

export default function PollDisplay({ hotTakeId }) {
  const { data: pollData, isLoading } = usePollResults(hotTakeId)
  const voteMutation = usePollVote()
  const [justVoted, setJustVoted] = useState(null)

  if (isLoading || !pollData?.options?.length) return null

  const hasVoted = !!(pollData.userVote || justVoted)
  const totalVotes = justVoted ? pollData.totalVotes + 1 : pollData.totalVotes
  const votedOptionId = justVoted || pollData.userVote

  async function handleVote(optionId) {
    if (hasVoted || voteMutation.isPending) return
    try {
      await voteMutation.mutateAsync({ hotTakeId, optionId })
      setJustVoted(optionId)
    } catch (err) {
      if (err.status === 409) {
        setJustVoted(optionId)
      } else {
        toast(err.message || 'Failed to vote', 'error')
      }
    }
  }

  return (
    <div className="mt-3 space-y-1.5">
      {pollData.options.map((opt) => {
        const votes = opt.id === justVoted ? opt.votes + 1 : opt.votes
        const pct = totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0
        const isSelected = votedOptionId === opt.id

        return (
          <button
            key={opt.id}
            onClick={() => handleVote(opt.id)}
            disabled={hasVoted || voteMutation.isPending}
            className={`w-full text-left relative rounded-lg overflow-hidden border transition-colors ${
              isSelected ? 'border-orange-500' : hasVoted ? 'border-text-primary/20' : 'border-text-primary/20 hover:border-orange-500/50'
            }`}
          >
            {/* Background fill bar */}
            {hasVoted && (
              <div
                className={`absolute inset-0 ${isSelected ? 'bg-orange-500/20' : 'bg-bg-secondary/50'}`}
                style={{ width: `${pct}%` }}
              />
            )}
            <div className="relative px-3 py-2 flex items-center justify-between">
              <span className={`text-sm ${isSelected ? 'font-semibold text-orange-400' : 'text-text-primary'}`}>
                {opt.label}
              </span>
              {hasVoted && (
                <span className={`text-xs font-semibold ${isSelected ? 'text-orange-400' : 'text-text-muted'}`}>
                  {pct}%
                </span>
              )}
            </div>
          </button>
        )
      })}
      {hasVoted && (
        <div className="text-xs text-text-muted text-center pt-1">
          {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}

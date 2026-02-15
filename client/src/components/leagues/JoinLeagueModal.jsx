import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useJoinLeague } from '../../hooks/useLeagues'
import { toast } from '../ui/Toast'

export default function JoinLeagueModal({ onClose }) {
  const [code, setCode] = useState('')
  const joinLeague = useJoinLeague()
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    try {
      const league = await joinLeague.mutateAsync({ inviteCode: code.trim().toUpperCase() })
      toast('Joined league!', 'success')
      onClose()
      navigate(`/leagues/${league.id}`)
    } catch (err) {
      toast(err.message || 'Failed to join league', 'error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-sm rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] md:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="font-display text-xl mb-4">Join a League</h2>
        <form onSubmit={handleSubmit}>
          <label className="block text-sm text-text-secondary mb-2">Invite Code</label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. A3K9F2MX"
            maxLength={8}
            className="w-full bg-bg-input border border-border rounded-lg px-4 py-3 text-center font-display text-xl tracking-widest text-text-primary placeholder-text-muted focus:outline-none focus:border-accent uppercase"
            autoFocus
          />
          <button
            type="submit"
            disabled={code.trim().length < 4 || joinLeague.isPending}
            className="w-full mt-4 py-3 rounded-xl font-display bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {joinLeague.isPending ? 'Joining...' : 'Join League'}
          </button>
        </form>
      </div>
    </div>
  )
}

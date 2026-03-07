import { useState } from 'react'
import { useBannedWords, useAddBannedWord, useRemoveBannedWord, useMutedUsers, useUnmuteUser } from '../../hooks/useAdmin'
import { toast } from '../ui/Toast'
import Avatar from '../ui/Avatar'

export default function ModerationPanel() {
  const [newWord, setNewWord] = useState('')
  const { data: bannedWords, isLoading: wordsLoading } = useBannedWords()
  const addWord = useAddBannedWord()
  const removeWord = useRemoveBannedWord()
  const { data: mutedUsers, isLoading: mutedLoading } = useMutedUsers()
  const unmuteUser = useUnmuteUser()

  async function handleAddWord(e) {
    e.preventDefault()
    if (!newWord.trim()) return
    try {
      await addWord.mutateAsync(newWord.trim())
      setNewWord('')
      toast('Word added', 'success')
    } catch (err) {
      toast(err.message || 'Failed to add word', 'error')
    }
  }

  async function handleRemoveWord(id) {
    try {
      await removeWord.mutateAsync(id)
      toast('Word removed', 'success')
    } catch (err) {
      toast(err.message || 'Failed to remove word', 'error')
    }
  }

  async function handleUnmute(userId) {
    try {
      await unmuteUser.mutateAsync(userId)
      toast('User unmuted', 'success')
    } catch (err) {
      toast(err.message || 'Failed to unmute user', 'error')
    }
  }

  return (
    <div className="space-y-6">
      {/* Banned Words */}
      <div className="bg-bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl">Banned Words</h2>
          {bannedWords && (
            <span className="text-xs text-text-muted">{bannedWords.length} words</span>
          )}
        </div>

        <form onSubmit={handleAddWord} className="flex gap-2 mb-4">
          <input
            type="text"
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            placeholder="Add a word..."
            className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={!newWord.trim() || addWord.isPending}
            className="bg-accent text-white px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50 transition-opacity"
          >
            {addWord.isPending ? 'Adding...' : 'Add'}
          </button>
        </form>

        {wordsLoading ? (
          <div className="text-center text-text-muted text-sm py-4">Loading...</div>
        ) : !bannedWords?.length ? (
          <div className="text-center text-text-muted text-sm py-4">No banned words yet</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {bannedWords.map((w) => (
              <span
                key={w.id}
                className="inline-flex items-center gap-1.5 bg-incorrect/10 text-incorrect text-xs font-medium px-2.5 py-1 rounded-full"
              >
                {w.word}
                <button
                  onClick={() => handleRemoveWord(w.id)}
                  disabled={removeWord.isPending}
                  className="hover:text-white transition-colors leading-none text-sm"
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Muted Users */}
      <div className="bg-bg-card rounded-xl border border-border p-4">
        <h2 className="font-display text-xl mb-4">Muted Users</h2>

        {mutedLoading ? (
          <div className="text-center text-text-muted text-sm py-4">Loading...</div>
        ) : !mutedUsers?.length ? (
          <div className="text-center text-text-muted text-sm py-4">No muted users</div>
        ) : (
          <div className="space-y-2">
            {mutedUsers.map((user) => (
              <div key={user.id} className="flex items-center justify-between bg-bg-primary rounded-lg p-3 border border-border">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={user} size="md" />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{user.display_name || user.username}</div>
                    <div className="text-xs text-text-muted">@{user.username}</div>
                  </div>
                </div>
                <button
                  onClick={() => handleUnmute(user.id)}
                  disabled={unmuteUser.isPending}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-correct/20 text-correct hover:bg-correct/30 transition-colors disabled:opacity-50"
                >
                  Unmute
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

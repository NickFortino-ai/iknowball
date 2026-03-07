import { useState, useRef } from 'react'
import { useCreateHotTake, useHotTakeImageUpload } from '../../hooks/useHotTakes'
import { useProfile } from '../../hooks/useProfile'
import Avatar from '../ui/Avatar'
import { toast } from '../ui/Toast'

const MAX_CHARS = 280

export default function HotTakeComposer() {
  const [content, setContent] = useState('')
  const [teamTag, setTeamTag] = useState('')
  const [expanded, setExpanded] = useState(false)
  const createHotTake = useCreateHotTake()
  const { data: profile } = useProfile()
  const { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage } = useHotTakeImageUpload()
  const fileInputRef = useRef(null)

  const charCount = content.length
  const canPost = charCount > 0 && charCount <= MAX_CHARS && !createHotTake.isPending && !uploading

  async function handlePost() {
    if (!canPost) return

    let imageUrl = undefined
    if (hasImage) {
      imageUrl = await uploadImage()
      if (!imageUrl && hasImage) return // upload failed
    }

    createHotTake.mutate(
      { content: content.trim(), team_tag: teamTag.trim() || undefined, image_url: imageUrl },
      {
        onSuccess: () => {
          setContent('')
          setTeamTag('')
          setExpanded(false)
          removeImage()
        },
        onError: (err) => {
          if (err.status === 403) {
            toast('Your posting privileges have been suspended. Contact support if you believe this is an error.', 'error')
          } else {
            toast(err.message || 'Failed to post', 'error')
          }
        },
      }
    )
  }

  function handleCancel() {
    setExpanded(false)
    setContent('')
    setTeamTag('')
    removeImage()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) selectImage(file)
    e.target.value = ''
  }

  return (
    <div className={`bg-bg-card border rounded-xl px-4 py-3 mb-4 transition-all ${
      expanded ? 'border-accent/20' : 'border-border'
    }`}>
      <div className="flex gap-3">
        {/* User avatar */}
        {profile && (
          <div className="flex-shrink-0 pt-0.5">
            <Avatar user={profile} size="md" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setExpanded(true)}
            placeholder="Drop a hot take..."
            maxLength={MAX_CHARS}
            rows={expanded ? 3 : 1}
            className="w-full bg-transparent text-sm text-text-primary placeholder-text-muted resize-none outline-none transition-all"
          />

          {/* Image preview */}
          {previewUrl && (
            <div className="relative mt-2 inline-block">
              <img
                src={previewUrl}
                alt="Upload preview"
                className="max-h-32 rounded-lg object-cover"
              />
              <button
                onClick={removeImage}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          {expanded && (
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <input
                  value={teamTag}
                  onChange={(e) => setTeamTag(e.target.value)}
                  placeholder="Team tag"
                  maxLength={50}
                  className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none w-28"
                />

                {/* Image upload button */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-text-muted hover:text-text-secondary transition-colors p-1"
                  title="Add image"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />

                {charCount > 0 && (
                  <span className={`text-xs flex-shrink-0 ${charCount > MAX_CHARS ? 'text-incorrect' : 'text-text-muted'}`}>
                    {charCount}/{MAX_CHARS}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  className="text-xs text-text-muted hover:text-text-secondary transition-colors"
                >
                  Cancel
                </button>
                {content.trim() && (
                  <button
                    onClick={handlePost}
                    disabled={!canPost}
                    className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
                  >
                    {createHotTake.isPending || uploading ? 'Posting...' : 'Post'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

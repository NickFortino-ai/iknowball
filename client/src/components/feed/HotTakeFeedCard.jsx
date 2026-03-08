import { useState, useRef } from 'react'
import FeedCardWrapper from './FeedCardWrapper'
import ImageLightbox from './ImageLightbox'
import { useUpdateHotTake, useHotTakeImageUpload } from '../../hooks/useHotTakes'
import { toast } from '../ui/Toast'

const MAX_CHARS = 280

export default function HotTakeFeedCard({ item, reactions, onUserTap }) {
  const { hot_take } = item
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [editTeamTag, setEditTeamTag] = useState('')
  const [existingImageUrl, setExistingImageUrl] = useState(null)
  const updateHotTake = useUpdateHotTake()
  const { uploading, previewUrl, selectImage, removeImage, uploadImage, hasImage } = useHotTakeImageUpload()
  const fileInputRef = useRef(null)

  function startEditing() {
    setEditContent(hot_take.content)
    setEditTeamTag(hot_take.team_tag || '')
    setExistingImageUrl(hot_take.image_url || null)
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setEditContent('')
    setEditTeamTag('')
    setExistingImageUrl(null)
    removeImage()
  }

  async function handleSave() {
    const trimmed = editContent.trim()
    if (!trimmed || trimmed.length > MAX_CHARS) return

    let imageUrl = existingImageUrl
    if (hasImage) {
      imageUrl = await uploadImage()
      if (!imageUrl && hasImage) return // upload failed
    }

    updateHotTake.mutate(
      { id: hot_take.id, content: trimmed, team_tag: editTeamTag.trim() || undefined, image_url: imageUrl || undefined },
      {
        onSuccess: () => {
          cancelEditing()
        },
        onError: (err) => {
          if (err.status === 403) {
            toast('Your posting privileges have been suspended.', 'error')
          } else {
            toast(err.message || 'Failed to update', 'error')
          }
        },
      }
    )
  }

  function handleRemoveImage() {
    setExistingImageUrl(null)
    removeImage()
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) {
      setExistingImageUrl(null)
      selectImage(file)
    }
    e.target.value = ''
  }

  const charCount = editContent.length
  const canSave = charCount > 0 && charCount <= MAX_CHARS && !updateHotTake.isPending && !uploading
  const currentPreview = previewUrl || existingImageUrl

  return (
    <FeedCardWrapper
      item={item}
      borderColor="purple"
      targetType="hot_take"
      targetId={hot_take.id}
      reactions={reactions}
      onUserTap={onUserTap}
      commentCount={item.commentCount}
      onEdit={startEditing}
    >
      {editing ? (
        <div className="space-y-2">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            maxLength={MAX_CHARS}
            rows={3}
            className="w-full bg-bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-text-primary placeholder-text-muted resize-none outline-none focus:border-accent/40"
            autoFocus
          />

          {/* Image preview */}
          {currentPreview && (
            <div className="relative inline-block">
              <img
                src={currentPreview}
                alt="Preview"
                className="max-h-32 rounded-lg object-cover"
              />
              <button
                onClick={handleRemoveImage}
                className="absolute top-1 right-1 w-5 h-5 bg-black/70 rounded-full flex items-center justify-center text-white text-xs hover:bg-black/90 transition-colors"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <input
                value={editTeamTag}
                onChange={(e) => setEditTeamTag(e.target.value)}
                placeholder="Team tag"
                maxLength={50}
                className="bg-bg-secondary border border-border rounded-lg px-2 py-1 text-xs text-text-primary placeholder-text-muted outline-none w-28"
              />

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
                onClick={cancelEditing}
                className="text-xs text-text-muted hover:text-text-secondary transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave}
                className="bg-accent text-white text-xs font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 transition-opacity"
              >
                {updateHotTake.isPending || uploading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Tweet-style content */}
          <div className="text-sm text-text-primary leading-relaxed">
            {hot_take.content}
          </div>

          {/* Image */}
          {hot_take.image_url && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightboxOpen(true) }}
              className="mt-2 block w-full"
            >
              <img
                src={hot_take.image_url}
                alt=""
                className="w-full rounded-lg"
              />
            </button>
          )}

          {/* Team tag */}
          {hot_take.team_tag && (
            <div className="mt-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider bg-accent/15 text-accent px-2 py-0.5 rounded-full">
                {hot_take.team_tag}
              </span>
            </div>
          )}

          {/* Lightbox */}
          {lightboxOpen && hot_take.image_url && (
            <ImageLightbox
              src={hot_take.image_url}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
    </FeedCardWrapper>
  )
}

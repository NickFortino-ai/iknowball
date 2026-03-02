import { useRef, useState } from 'react'
import Avatar from '../ui/Avatar'
import { useAvatarUpload } from '../../hooks/useAvatarUpload'

export default function AvatarUpload({ user, size = '2xl', className = '' }) {
  const fileRef = useRef(null)
  const [showMenu, setShowMenu] = useState(false)
  const { uploading, uploadAvatar, removeAvatar } = useAvatarUpload()

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (file) uploadAvatar(file)
    e.target.value = ''
    setShowMenu(false)
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={() => setShowMenu(!showMenu)}
        disabled={uploading}
        className="relative group"
      >
        {uploading ? (
          <div className={`rounded-full flex items-center justify-center flex-shrink-0 bg-bg-primary ${size === '2xl' ? 'w-14 h-14' : 'w-9 h-9'} ${className}`}>
            <svg className="animate-spin w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          </div>
        ) : (
          <Avatar user={user} size={size} className={className} />
        )}
        {/* Camera icon overlay */}
        <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-accent rounded-full flex items-center justify-center border-2 border-bg-card">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </span>
      </button>

      {showMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
          <div className="absolute top-full left-0 mt-1 bg-bg-card border border-border rounded-lg shadow-lg z-50 overflow-hidden whitespace-nowrap">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full text-left px-4 py-2.5 text-sm text-text-primary hover:bg-bg-card-hover transition-colors"
            >
              Upload Photo
            </button>
            {user?.avatar_url && (
              <button
                onClick={() => { removeAvatar(); setShowMenu(false) }}
                className="w-full text-left px-4 py-2.5 text-sm text-incorrect hover:bg-bg-card-hover transition-colors"
              >
                Remove Photo
              </button>
            )}
          </div>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}

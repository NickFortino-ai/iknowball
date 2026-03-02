const SIZE_CLASSES = {
  xs: 'w-5 h-5 text-[10px]',
  sm: 'w-6 h-6 text-xs',
  md: 'w-7 h-7 text-xs',
  lg: 'w-8 h-8 text-sm',
  xl: 'w-9 h-9 text-base',
  '2xl': 'w-14 h-14 text-2xl',
}

export default function Avatar({ user, size = 'md', className = '' }) {
  const sizeClass = SIZE_CLASSES[size] || SIZE_CLASSES.md
  const name = user?.display_name || user?.username || ''

  if (user?.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt=""
        className={`rounded-full object-cover flex-shrink-0 ${sizeClass} ${className}`}
      />
    )
  }

  return (
    <span className={`rounded-full flex items-center justify-center flex-shrink-0 ${sizeClass} ${className || 'bg-bg-primary'}`}>
      {user?.avatar_emoji || name[0]?.toUpperCase() || '?'}
    </span>
  )
}

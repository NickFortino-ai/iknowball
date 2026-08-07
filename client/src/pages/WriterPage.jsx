import { useAuth } from '../hooks/useAuth'
import PlayerBlurbsPanel from '../components/admin/PlayerBlurbsPanel'

// Scoped tool for the writer role — mounts only the Player Blurbs
// panel, no admin nav. Admins are welcomed here too (they can still
// hit /admin for the full toolset). See the requireBlurbWriter
// middleware for the server-side gate.
export default function WriterPage() {
  const { profile } = useAuth()

  if (!profile?.is_writer && !profile?.is_admin) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="font-display text-3xl mb-4">Access Denied</h1>
        <p className="text-text-muted">You need writer access to view this page.</p>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-4">
        <h1 className="font-display text-3xl">Player Blurbs</h1>
        <p className="text-text-muted text-sm mt-1">Write and publish player notes.</p>
      </div>
      <PlayerBlurbsPanel />
    </div>
  )
}

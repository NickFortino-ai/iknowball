import Navbar from './Navbar'
import BottomTabBar from './BottomTabBar'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function AppShell({ children }) {
  const { isOnline } = useOnlineStatus()

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary font-body">
      <Navbar />
      {!isOnline && (
        <div className="bg-incorrect/20 text-incorrect text-center text-sm font-medium py-2 border-b border-incorrect">
          You're offline. Check your connection.
        </div>
      )}
      <main className="pb-14 md:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  )
}

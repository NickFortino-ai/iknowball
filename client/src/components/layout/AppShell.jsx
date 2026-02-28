import Navbar from './Navbar'
import BottomTabBar from './BottomTabBar'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

export default function AppShell({ children }) {
  const { isOnline } = useOnlineStatus()

  return (
    <div className="h-dvh flex flex-col bg-bg-primary text-text-primary font-body overflow-y-auto">
      <Navbar />
      {!isOnline && (
        <div className="bg-incorrect/20 text-incorrect text-center text-sm font-medium py-2 border-b border-incorrect flex-shrink-0">
          You're offline. Check your connection.
        </div>
      )}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{children}</main>
      <BottomTabBar />
    </div>
  )
}

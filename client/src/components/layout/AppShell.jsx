import Navbar from './Navbar'
import BottomTabBar from './BottomTabBar'

export default function AppShell({ children }) {
  return (
    <div className="min-h-screen bg-bg-primary text-text-primary font-body">
      <Navbar />
      <main className="pb-20 md:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  )
}

import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './stores/authStore'
import ProtectedRoute from './components/auth/ProtectedRoute'
import AppShell from './components/layout/AppShell'
import ErrorBoundary from './components/ui/ErrorBoundary'
import ToastContainer from './components/ui/Toast'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import PicksPage from './pages/PicksPage'
import ResultsPage from './pages/ResultsPage'
import LeaderboardPage from './pages/LeaderboardPage'
import HubPage from './pages/HubPage'
import SettingsPage from './pages/SettingsPage'
import LeaguesPage from './pages/LeaguesPage'
import CreateLeaguePage from './pages/CreateLeaguePage'
import JoinLeaguePage from './pages/JoinLeaguePage'
import LeagueDetailPage from './pages/LeagueDetailPage'
import AdminPage from './pages/AdminPage'
import PaymentPage from './pages/PaymentPage'
import JoinPage from './pages/JoinPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import FAQPage from './pages/FAQPage'
import UnsubscribePage from './pages/UnsubscribePage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import HallOfFamePage from './pages/HallOfFamePage'
import MessagesPage from './pages/MessagesPage'
import MessageThreadPage from './pages/MessageThreadPage'
import GuidelinesPage from './pages/GuidelinesPage'
import OnboardingTutorial from './components/onboarding/OnboardingTutorial'
import InstallPrompt from './components/pwa/InstallPrompt'
import { initPushNotifications } from './lib/pushNotifications'
import { initStatusBar } from './lib/statusBar'
import { initIAPListener } from './lib/iapListener'
import { useRealtimeGames } from './hooks/useRealtimeGames'

function AppRoutes() {
  const initialize = useAuthStore((s) => s.initialize)
  const isAuthenticated = useAuthStore((s) => !!s.session)
  useRealtimeGames(isAuthenticated)

  useEffect(() => {
    initialize()
    initPushNotifications()
    initStatusBar()
    initIAPListener()
  }, [initialize])

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/payment" element={<PaymentPage />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/faq" element={<FAQPage />} />
        <Route path="/guidelines" element={<GuidelinesPage />} />
        <Route path="/unsubscribe" element={<UnsubscribePage />} />
        <Route path="/picks" element={<ProtectedRoute><PicksPage /></ProtectedRoute>} />
        <Route path="/results" element={<ProtectedRoute><ResultsPage /></ProtectedRoute>} />
        <Route path="/leaderboard" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
        <Route path="/hub" element={<ProtectedRoute><HubPage /></ProtectedRoute>} />
        <Route path="/profile" element={<Navigate to="/hub" replace />} />
        <Route path="/connections" element={<Navigate to="/hub" replace />} />
        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
        <Route path="/leagues" element={<ProtectedRoute><LeaguesPage /></ProtectedRoute>} />
        <Route path="/leagues/create" element={<ProtectedRoute><CreateLeaguePage /></ProtectedRoute>} />
        <Route path="/leagues/join" element={<ProtectedRoute><JoinLeaguePage /></ProtectedRoute>} />
        <Route path="/leagues/:id" element={<ProtectedRoute><LeagueDetailPage /></ProtectedRoute>} />
        <Route path="/hall-of-fame" element={<ProtectedRoute><HallOfFamePage /></ProtectedRoute>} />
        <Route path="/messages" element={<ProtectedRoute><MessagesPage /></ProtectedRoute>} />
        <Route path="/messages/:partnerId" element={<ProtectedRoute><MessageThreadPage /></ProtectedRoute>} />
        <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
      </Routes>
    </AppShell>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AppRoutes />
          <OnboardingTutorial />
          <InstallPrompt />
          <ToastContainer />
        </BrowserRouter>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

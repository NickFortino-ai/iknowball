import { useState } from 'react'
import { useParams, useSearchParams, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings } from '../hooks/useLeagues'
import { useAuth } from '../hooks/useAuth'
import MembersList from '../components/leagues/MembersList'
import InvitePlayerModal from '../components/leagues/InvitePlayerModal'
import PickemView from '../components/leagues/PickemView'
import SurvivorView from '../components/leagues/SurvivorView'
import SquaresView from '../components/leagues/SquaresView'
import BracketView from '../components/leagues/BracketView'
import LoadingSpinner from '../components/ui/LoadingSpinner'
import { toast } from '../components/ui/Toast'

const TABS = {
  pickem: ['Standings', 'Members'],
  survivor: ['Board', 'Members'],
  squares: ['Board', 'Members'],
  bracket: ['Bracket', 'Members'],
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
  bracket: 'Bracket',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  all: 'All Sports',
}

export default function LeagueDetailPage() {
  const { id } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { profile } = useAuth()
  const { data: league, isLoading } = useLeague(id)
  const { data: standings } = useLeagueStandings(id)
  const [activeTab, setActiveTab] = useState(0)
  const [showInviteModal, setShowInviteModal] = useState(searchParams.get('invite') === '1')

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-6"><LoadingSpinner /></div>
  if (!league) return null

  const tabs = TABS[league.format] || ['Members']
  const isCommissioner = league.commissioner_id === profile?.id

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <Link to="/leagues" className="text-xs text-text-muted hover:text-text-secondary transition-colors">
          &larr; My Leagues
        </Link>
        <h1 className="font-display text-3xl mt-2">{league.name}</h1>
        <div className="flex flex-wrap items-center gap-3 mt-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
            {FORMAT_LABELS[league.format]}
          </span>
          <span className="text-xs text-text-muted">{SPORT_LABELS[league.sport]}</span>
          <span className="text-xs text-text-muted">{league.members?.length || 0} members</span>
          {isCommissioner && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-tier-hof/20 text-tier-hof">
              Commissioner
            </span>
          )}
        </div>
      </div>

      {/* Invite Code & Invite Player */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-xs text-text-muted">Invite Code</div>
            <div className="font-display text-xl tracking-widest">{league.invite_code}</div>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {isCommissioner && (
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
              >
                Invite Player
              </button>
            )}
            <button
              onClick={async () => {
                const url = `${window.location.origin}/join/${league.invite_code}`
                if (navigator.share) {
                  try {
                    await navigator.share({ title: `Join ${league.name}`, url })
                  } catch {
                    // user cancelled share sheet
                  }
                } else {
                  await navigator.clipboard.writeText(url)
                  toast('Invite link copied!', 'success')
                }
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              Share
            </button>
          </div>
        </div>
      </div>

      {showInviteModal && (
        <InvitePlayerModal leagueId={league.id} inviteCode={league.invite_code} leagueName={league.name} onClose={() => {
          setShowInviteModal(false)
          if (searchParams.has('invite')) {
            searchParams.delete('invite')
            setSearchParams(searchParams, { replace: true })
          }
        }} />
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        {tabs.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              activeTab === i
                ? 'bg-accent text-white'
                : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tabs[activeTab] === 'Members' && (
        <MembersList
          members={league.members}
          commissionerId={league.commissioner_id}
          leagueId={league.id}
          isCommissioner={isCommissioner}
        />
      )}

      {tabs[activeTab] === 'Standings' && league.format === 'pickem' && (
        <PickemView league={league} standings={standings} />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'survivor' && (
        <SurvivorView league={league} />
      )}

      {tabs[activeTab] === 'Board' && league.format === 'squares' && (
        <SquaresView league={league} isCommissioner={isCommissioner} />
      )}

      {tabs[activeTab] === 'Bracket' && league.format === 'bracket' && (
        <BracketView league={league} />
      )}
    </div>
  )
}

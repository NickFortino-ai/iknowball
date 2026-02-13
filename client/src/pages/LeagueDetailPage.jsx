import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useLeague, useLeagueStandings } from '../hooks/useLeagues'
import { useAuth } from '../hooks/useAuth'
import MembersList from '../components/leagues/MembersList'
import PickemView from '../components/leagues/PickemView'
import SurvivorView from '../components/leagues/SurvivorView'
import SquaresView from '../components/leagues/SquaresView'
import LoadingSpinner from '../components/ui/LoadingSpinner'

const TABS = {
  pickem: ['Standings', 'Members'],
  survivor: ['Board', 'Members'],
  squares: ['Board', 'Members'],
}

const FORMAT_LABELS = {
  pickem: "Pick'em",
  survivor: 'Survivor',
  squares: 'Squares',
}

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  all: 'All Sports',
}

export default function LeagueDetailPage() {
  const { id } = useParams()
  const { profile } = useAuth()
  const { data: league, isLoading } = useLeague(id)
  const { data: standings } = useLeagueStandings(id)
  const [activeTab, setActiveTab] = useState(0)

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
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-accent/20 text-accent">
            {FORMAT_LABELS[league.format]}
          </span>
          <span className="text-xs text-text-muted">{SPORT_LABELS[league.sport]}</span>
          <span className="text-xs text-text-muted">{league.members?.length || 0} members</span>
          {isCommissioner && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-tier-mvp/20 text-tier-mvp">
              Commissioner
            </span>
          )}
        </div>
      </div>

      {/* Invite Code */}
      <div className="bg-bg-card rounded-xl border border-border p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-text-muted">Invite Code</div>
            <div className="font-display text-xl tracking-widest">{league.invite_code}</div>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(league.invite_code)
            }}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            Copy
          </button>
        </div>
      </div>

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
    </div>
  )
}

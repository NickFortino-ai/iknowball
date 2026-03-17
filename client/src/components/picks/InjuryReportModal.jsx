import { useEffect } from 'react'
import { lockScroll, unlockScroll } from '../../lib/scrollLock'
import { useInjuryDetail } from '../../hooks/useInjuries'
import LoadingSpinner from '../ui/LoadingSpinner'

const STATUS_STYLES = {
  Out: 'text-incorrect',
  Doubtful: 'text-orange-400',
  Questionable: 'text-yellow-400',
  Probable: 'text-text-muted',
  'Day-To-Day': 'text-text-muted',
}

const STATUS_LABELS = {
  Out: 'Out',
  Doubtful: 'Doubt',
  Questionable: 'Ques',
  Probable: 'Prob',
  'Day-To-Day': 'DTD',
}

const BORDER_COLORS = {
  Out: 'border-incorrect',
  Doubtful: 'border-orange-400',
  Questionable: 'border-yellow-400',
  Probable: 'border-text-muted',
  'Day-To-Day': 'border-text-muted',
}

// Primary team colors (official brand colors)
const TEAM_COLORS = {
  // NBA
  'Atlanta Hawks': '#E03A3E',
  'Boston Celtics': '#007A33',
  'Brooklyn Nets': '#000000',
  'Charlotte Hornets': '#1D1160',
  'Chicago Bulls': '#CE1141',
  'Cleveland Cavaliers': '#860038',
  'Dallas Mavericks': '#00538C',
  'Denver Nuggets': '#0E2240',
  'Detroit Pistons': '#C8102E',
  'Golden State Warriors': '#1D428A',
  'Houston Rockets': '#CE1141',
  'Indiana Pacers': '#002D62',
  'LA Clippers': '#C8102E',
  'Los Angeles Lakers': '#552583',
  'Memphis Grizzlies': '#5D76A9',
  'Miami Heat': '#98002E',
  'Milwaukee Bucks': '#00471B',
  'Minnesota Timberwolves': '#0C2340',
  'New Orleans Pelicans': '#0C2340',
  'New York Knicks': '#006BB6',
  'Oklahoma City Thunder': '#007AC1',
  'Orlando Magic': '#0077C0',
  'Philadelphia 76ers': '#006BB6',
  'Phoenix Suns': '#1D1160',
  'Portland Trail Blazers': '#E03A3E',
  'Sacramento Kings': '#5A2D81',
  'San Antonio Spurs': '#C4CED4',
  'Toronto Raptors': '#CE1141',
  'Utah Jazz': '#002B5C',
  'Washington Wizards': '#002B5C',
  // NFL
  'Arizona Cardinals': '#97233F',
  'Atlanta Falcons': '#A71930',
  'Baltimore Ravens': '#241773',
  'Buffalo Bills': '#00338D',
  'Carolina Panthers': '#0085CA',
  'Chicago Bears': '#0B162A',
  'Cincinnati Bengals': '#FB4F14',
  'Cleveland Browns': '#FF3C00',
  'Dallas Cowboys': '#003594',
  'Denver Broncos': '#FB4F14',
  'Detroit Lions': '#0076B6',
  'Green Bay Packers': '#203731',
  'Houston Texans': '#03202F',
  'Indianapolis Colts': '#002C5F',
  'Jacksonville Jaguars': '#006778',
  'Kansas City Chiefs': '#E31837',
  'Las Vegas Raiders': '#A5ACAF',
  'Los Angeles Chargers': '#0080C6',
  'Los Angeles Rams': '#003594',
  'Miami Dolphins': '#008E97',
  'Minnesota Vikings': '#4F2683',
  'New England Patriots': '#002244',
  'New Orleans Saints': '#D3BC8D',
  'New York Giants': '#0B2265',
  'New York Jets': '#125740',
  'Philadelphia Eagles': '#004C54',
  'Pittsburgh Steelers': '#FFB612',
  'San Francisco 49ers': '#AA0000',
  'Seattle Seahawks': '#002244',
  'Tampa Bay Buccaneers': '#D50A0A',
  'Tennessee Titans': '#0C2340',
  'Washington Commanders': '#5A1414',
  // WNBA
  'Atlanta Dream': '#E31837',
  'Chicago Sky': '#418FDE',
  'Connecticut Sun': '#F05023',
  'Dallas Wings': '#C4D600',
  'Golden State Valkyries': '#1D428A',
  'Indiana Fever': '#002D62',
  'Las Vegas Aces': '#A7A8AA',
  'Los Angeles Sparks': '#552583',
  'Minnesota Lynx': '#0C2340',
  'New York Liberty': '#6ECEB2',
  'Phoenix Mercury': '#CB6015',
  'Seattle Storm': '#2C5234',
  'Washington Mystics': '#C8102E',
}

function TeamSection({ teamName, starters, injuries }) {
  const hasInjuries = injuries?.length > 0

  // Build injury status map by player name for cross-referencing with starters
  const injuryMap = {}
  for (const inj of injuries || []) {
    injuryMap[inj.name] = inj.status
    injuryMap[inj.shortName] = inj.status
  }

  // Build today's starters: promote next man up when starter is Out/Doubtful
  const todayStarters = (starters || []).map((s) => {
    const depth = s.depth || [{ name: s.name, shortName: s.shortName }]
    for (const player of depth) {
      const status = injuryMap[player.name] || injuryMap[player.shortName]
      if (status === 'Out' || status === 'Doubtful') continue
      return { position: s.position, name: player.name, shortName: player.shortName, status: status || null }
    }
    // All available players at this position are out
    return null
  }).filter(Boolean)
  const hasStarters = todayStarters.length > 0

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-5 rounded-full shrink-0" style={{ backgroundColor: TEAM_COLORS[teamName] || '#888' }} />
        <h3 className="font-display text-base truncate">{teamName}</h3>
      </div>

      {hasStarters && (
        <div className="mb-4">
          <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Today's Starters</div>
          <div className="space-y-1.5">
            {todayStarters.map((s) => (
              <div key={s.position} className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-accent w-7 shrink-0">{s.position}</span>
                <span className="text-text-primary truncate">{s.shortName}</span>
                {s.status === 'Questionable' && (
                  <span className="text-[10px] font-bold text-yellow-400 shrink-0">Q</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs text-text-muted uppercase tracking-wider mb-2">Injuries</div>
        {hasInjuries ? (
          <div className="space-y-1.5">
            {injuries.map((inj) => (
              <div
                key={inj.name}
                className={`border-l-2 ${BORDER_COLORS[inj.status] || 'border-text-muted'} pl-2 py-0.5`}
              >
                <div className="flex items-center gap-1.5 text-sm">
                  <span className="text-text-muted text-xs w-6 shrink-0">{inj.position}</span>
                  <span className="text-text-primary truncate">{inj.shortName}</span>
                  <span className={`text-xs font-semibold shrink-0 ${STATUS_STYLES[inj.status] || 'text-text-muted'}`}>
                    {STATUS_LABELS[inj.status] || inj.status}
                  </span>
                </div>
                {inj.detail && (
                  <div className="text-xs text-text-muted ml-[1.875rem] truncate">{inj.detail}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-correct">No injuries reported</p>
        )}
      </div>
    </div>
  )
}

export default function InjuryReportModal({ gameId, onClose }) {
  const { data, isLoading } = useInjuryDetail(gameId)

  useEffect(() => {
    if (!gameId) return
    lockScroll()
    return () => unlockScroll()
  }, [gameId])

  if (!gameId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center px-0 md:px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60" />
      <div
        className="relative bg-bg-card border border-border w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 max-h-[90vh] md:max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-text-muted hover:text-text-primary text-xl leading-none"
        >
          &times;
        </button>

        <h2 className="font-display text-lg mb-4">Game Intel</h2>

        {isLoading ? (
          <LoadingSpinner />
        ) : !data ? (
          <p className="text-text-muted text-center">No data available</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <TeamSection
              teamName={data.away_team}
              starters={data.away?.starters}
              injuries={data.away?.injuries}
            />
            <TeamSection
              teamName={data.home_team}
              starters={data.home?.starters}
              injuries={data.home?.injuries}
            />
          </div>
        )}
      </div>
    </div>
  )
}

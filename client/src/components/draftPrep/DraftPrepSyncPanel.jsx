import { useMatchingLeagues, useSyncLeague, useUnsyncLeague, useSyncAllLeagues } from '../../hooks/useDraftPrep'
import { toast } from '../ui/Toast'

export default function DraftPrepSyncPanel({ configHash, scoringFormat }) {
  const { data: leagues, isLoading } = useMatchingLeagues(configHash, scoringFormat)
  const syncLeague = useSyncLeague()
  const unsyncLeague = useUnsyncLeague()
  const syncAll = useSyncAllLeagues()

  async function handleSyncAll(mode) {
    try {
      const result = await syncAll.mutateAsync({ mode, configHash, scoringFormat })
      toast(`Synced ${result.synced?.length || 0} league(s)`, 'success')
    } catch (err) {
      toast(err.message || 'Failed to sync', 'error')
    }
  }

  async function handleToggle(leagueId, isSynced) {
    try {
      if (isSynced) {
        if (!confirm('Unsync this league? It will get an independent copy of your current rankings.')) return
        await unsyncLeague.mutateAsync(leagueId)
        toast('League unsynced', 'success')
      } else {
        await syncLeague.mutateAsync(leagueId)
        toast('League synced', 'success')
      }
    } catch (err) {
      toast(err.message || 'Failed to update sync', 'error')
    }
  }

  const fantasyLeagues = leagues?.filter((l) => l.name) || []
  const matchingCount = fantasyLeagues.filter((l) => l.isMatching).length
  const syncedCount = fantasyLeagues.filter((l) => l.isSynced).length

  return (
    <div className="rounded-xl border border-text-primary/20 bg-bg-primary p-4">
      <h3 className="font-display text-base text-text-primary mb-1">Sync Rankings to Leagues</h3>
      <p className="text-[11px] text-text-muted mb-3">
        Your Draft Prep rankings automatically apply to synced leagues. Edits in either place update the same rankings.
      </p>

      {/* Bulk sync buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          onClick={() => handleSyncAll('all')}
          disabled={syncAll.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/10 border border-accent/40 text-accent hover:bg-accent/20 transition-colors disabled:opacity-50"
        >
          {syncAll.isPending ? 'Syncing...' : 'Sync to All Leagues'}
        </button>
        <button
          onClick={() => handleSyncAll('matching')}
          disabled={syncAll.isPending}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-secondary border border-text-primary/20 text-text-secondary hover:bg-white/10 transition-colors disabled:opacity-50"
        >
          Sync to Matching Rosters Only
          {matchingCount > 0 && <span className="ml-1 text-accent">({matchingCount})</span>}
        </button>
      </div>

      {/* League list */}
      {isLoading ? (
        <div className="text-xs text-text-muted">Loading leagues...</div>
      ) : fantasyLeagues.length === 0 ? (
        <div className="text-xs text-text-muted">No fantasy leagues with upcoming drafts found.</div>
      ) : (
        <div className="space-y-1.5">
          {fantasyLeagues.map((l) => {
            let mismatchLabel = null
            if (!l.isMatching) {
              if (!l.rosterMatches && !l.scoringMatches) mismatchLabel = 'Different roster & scoring'
              else if (!l.rosterMatches) mismatchLabel = 'Different roster'
              else if (!l.scoringMatches) mismatchLabel = 'Different scoring'
            }
            return (
            <div key={l.leagueId} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-white/5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-text-primary truncate">{l.name}</div>
                <div className="text-[10px] text-text-muted flex items-center gap-1.5">
                  <span>{l.scoringFormat === 'ppr' ? 'PPR' : l.scoringFormat === 'standard' ? 'Standard' : 'Half-PPR'}</span>
                  {l.isMatching ? (
                    <span className="text-correct font-semibold">Matching</span>
                  ) : (
                    <span className="text-yellow-500">{mismatchLabel}</span>
                  )}
                </div>
              </div>
              <button
                onClick={() => handleToggle(l.leagueId, l.isSynced)}
                disabled={syncLeague.isPending || unsyncLeague.isPending}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${
                  l.isSynced
                    ? 'bg-correct/15 border border-correct/40 text-correct'
                    : 'bg-bg-secondary border border-text-primary/20 text-text-secondary hover:bg-white/10'
                }`}
              >
                {l.isSynced ? 'Synced' : 'Sync'}
              </button>
            </div>
            )
          })}
        </div>
      )}

      {syncedCount > 0 && (
        <div className="mt-3 text-[10px] text-text-muted">
          {syncedCount} league{syncedCount !== 1 ? 's' : ''} synced. Edits in any synced league update your Draft Prep rankings and all other synced leagues.
        </div>
      )}
    </div>
  )
}

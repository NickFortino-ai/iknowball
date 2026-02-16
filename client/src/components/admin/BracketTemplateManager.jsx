import { useState } from 'react'
import { useBracketTemplates, useDeleteBracketTemplate } from '../../hooks/useAdmin'
import BracketTemplateBuilder from './BracketTemplateBuilder'
import BracketTemplateResults from './BracketTemplateResults'
import LoadingSpinner from '../ui/LoadingSpinner'
import EmptyState from '../ui/EmptyState'
import { toast } from '../ui/Toast'

const SPORT_LABELS = {
  americanfootball_nfl: 'NFL',
  basketball_nba: 'NBA',
  baseball_mlb: 'MLB',
  basketball_ncaab: 'NCAAB',
  americanfootball_ncaaf: 'NCAAF',
  basketball_wnba: 'WNBA',
  basketball_wncaab: 'WNCAAB',
}

export default function BracketTemplateManager() {
  const [sportFilter, setSportFilter] = useState('')
  const [editingTemplate, setEditingTemplate] = useState(null) // null = list, 'new' = create, id = edit
  const [resultsTemplate, setResultsTemplate] = useState(null) // template id for entering results
  const { data: templates, isLoading } = useBracketTemplates(sportFilter || undefined)
  const deleteTemplate = useDeleteBracketTemplate()

  async function handleDelete(templateId) {
    if (!confirm('Archive this template? It will no longer be available for new leagues.')) return
    try {
      await deleteTemplate.mutateAsync(templateId)
      toast('Template archived', 'success')
    } catch (err) {
      toast(err.message || 'Failed to archive template', 'error')
    }
  }

  if (resultsTemplate) {
    return (
      <BracketTemplateResults
        templateId={resultsTemplate}
        onClose={() => setResultsTemplate(null)}
      />
    )
  }

  if (editingTemplate) {
    return (
      <BracketTemplateBuilder
        templateId={editingTemplate === 'new' ? null : editingTemplate}
        onClose={() => setEditingTemplate(null)}
      />
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl">Bracket Templates</h2>
        <button
          onClick={() => setEditingTemplate('new')}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-accent text-white hover:bg-accent-hover transition-colors"
        >
          New Template
        </button>
      </div>

      {/* Sport filter */}
      <div className="flex gap-1 mb-4">
        <button
          onClick={() => setSportFilter('')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            !sportFilter ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
          }`}
        >
          All
        </button>
        {Object.entries(SPORT_LABELS).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSportFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              sportFilter === key ? 'bg-accent text-white' : 'bg-bg-card text-text-secondary hover:bg-bg-card-hover'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : !templates?.length ? (
        <EmptyState title="No templates" message="Create your first bracket template to get started" />
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <div key={t.id} className="bg-bg-card rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{t.name}</div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-text-muted">
                    <span className="px-2 py-0.5 rounded bg-accent/20 text-accent font-semibold">
                      {SPORT_LABELS[t.sport]}
                    </span>
                    <span>{t.team_count} teams</span>
                    <span>{t.rounds?.length || 0} rounds</span>
                    {t.regions?.length > 0 && <span>{t.regions.length} regions</span>}
                  </div>
                  {t.description && (
                    <div className="text-xs text-text-muted mt-1">{t.description}</div>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setResultsTemplate(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-accent/20 text-accent hover:bg-accent/30 transition-colors"
                  >
                    Results
                  </button>
                  <button
                    onClick={() => setEditingTemplate(t.id)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-bg-card-hover text-text-secondary hover:text-text-primary transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(t.id)}
                    disabled={deleteTemplate.isPending}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-incorrect hover:bg-incorrect/10 transition-colors disabled:opacity-50"
                  >
                    Archive
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

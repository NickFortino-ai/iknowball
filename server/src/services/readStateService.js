import { supabase } from '../config/supabase.js'
import { fetchAll } from '../utils/fetchAll.js'

// Per-user read state, shared across a user's devices. See migration
// 274 for why one table covers blurbs, commissioner notes and matchup
// results.
export const READ_STATE_KINDS = new Set(['blurb', 'league_note', 'matchup_result'])

/**
 * Everything this user has marked read, grouped by kind:
 *   { blurb: { [playerId]: blurbId }, league_note: {...}, matchup_result: {...} }
 *
 * Paged — a heavy fantasy user accumulates a row per player whose notes
 * they've opened, and the silent 1000-row cap would quietly resurrect
 * dots on the oldest ones. Explicit .order() so paging is stable.
 */
export async function getReadState(userId) {
  const rows = await fetchAll(
    supabase
      .from('user_read_state')
      .select('kind, ref_id, value')
      .eq('user_id', userId)
      .order('ref_id', { ascending: true }),
  )
  const out = {}
  for (const kind of READ_STATE_KINDS) out[kind] = {}
  for (const r of rows || []) {
    if (!out[r.kind]) out[r.kind] = {}
    out[r.kind][r.ref_id] = r.value
  }
  return out
}

/**
 * Mark one thing read. Upsert on the composite key so re-reading the
 * same item just refreshes the value (a newer blurb id, a later
 * timestamp) instead of erroring.
 */
export async function markRead(userId, kind, refId, value) {
  if (!READ_STATE_KINDS.has(kind)) {
    const err = new Error(`Unknown read-state kind: ${kind}`)
    err.status = 400
    throw err
  }
  if (!refId) {
    const err = new Error('ref_id required')
    err.status = 400
    throw err
  }
  const { error } = await supabase
    .from('user_read_state')
    .upsert(
      {
        user_id: userId,
        kind,
        ref_id: String(refId),
        value: value == null ? null : String(value),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,kind,ref_id' },
    )
  if (error) throw error
  return { ok: true }
}

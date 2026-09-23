import { useSyncExternalStore } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'

/**
 * Per-USER read state, shared across a user's devices.
 *
 * Read state used to live in three per-DEVICE localStorage keys, so
 * clearing a player's orange dot on your phone left it showing on your
 * laptop. This keeps the same instant local behaviour but syncs it.
 *
 * Local-first by design:
 *  - reads take the UNION of the local mirror and the server map, so a
 *    dot never flashes back while the fetch is in flight, and a device
 *    that has been offline doesn't resurrect what it already cleared
 *  - marking writes localStorage synchronously (instant dismissal, no
 *    network latency in the UI), updates the query cache, then POSTs in
 *    the background — a failed POST costs a re-read on that device, not
 *    a broken interaction
 *  - the local mirror also carries over the read state users already had
 *    before this shipped, so nothing resets on upgrade
 */

const LOCAL_KEY = 'read-state-v1'
export const READ_KINDS = { BLURB: 'blurb', LEAGUE_NOTE: 'league_note', MATCHUP_RESULT: 'matchup_result' }

/**
 * One-time import of the three legacy per-device keys this replaces.
 * Without it every user's dots would come back once on upgrade, which
 * looks exactly like the bug we're fixing.
 *
 *   blurb-seen-v2            {playerId: blurbId}   single JSON blob
 *   note-seen-{leagueId}     ISO timestamp         one key per league
 *   matchup-result-seen-{id} '1'                   one key per matchup
 *
 * Runs only when the new key is absent, and the old keys are left in
 * place — harmless, and it means a rollback doesn't lose anything.
 */
function importLegacy() {
  const out = { [READ_KINDS.BLURB]: {}, [READ_KINDS.LEAGUE_NOTE]: {}, [READ_KINDS.MATCHUP_RESULT]: {} }
  try {
    const blurbs = localStorage.getItem('blurb-seen-v2')
    if (blurbs) out[READ_KINDS.BLURB] = JSON.parse(blurbs) || {}
  } catch { /* malformed — start clean for this kind */ }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k) continue
      if (k.startsWith('note-seen-')) {
        out[READ_KINDS.LEAGUE_NOTE][k.slice('note-seen-'.length)] = localStorage.getItem(k)
      } else if (k.startsWith('matchup-result-seen-')) {
        out[READ_KINDS.MATCHUP_RESULT][k.slice('matchup-result-seen-'.length)] = localStorage.getItem(k)
      }
    }
  } catch { /* ignore */ }
  return out
}

function readLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    if (raw) return JSON.parse(raw)
    const migrated = importLegacy()
    writeLocal(migrated)
    return migrated
  } catch {
    return {}
  }
}

// Local mirror changes have to wake every mounted useReadState, because that
// hook reads localStorage DURING RENDER — nothing about a localStorage write
// re-renders React on its own.
//
// Without this, clearing a dot depended entirely on the caller remembering to
// pass a queryClient so the cache nudge forced a render. All four call sites
// omitted it, so reading a blurb wrote the mark, fired the POST, and left the
// orange dot on screen until something else happened to re-render the page or
// the 5-minute staleTime expired.
let localVersion = 0
const localListeners = new Set()

// Marks made in THIS session, which always win the merge below.
//
// markRead writes localStorage immediately, but merge() lets the SERVER map
// win on conflict — and the server copy is only refreshed when a caller
// threads a queryClient through setQueryData. Every call site omits it, so
// for a player whose PREVIOUS blurb had been marked seen, the server still
// held the old blurb id and the merge overwrote the fresh local mark with it.
// The dot then hung around until the 5-minute staleTime expired.
//
// That is why it looked intermittent: a player you had never read cleared
// instantly (no server entry to lose to), one you had read before did not.
// Publishing ESPN blurbs made it common, by giving hundreds of players a new
// blurb id against a server entry holding the old one.
//
// A session mark is by definition the newest thing this device knows, so it
// outranks both — and being module-level it does not depend on any call site
// remembering to pass a client.
const sessionMarks = {}

function subscribeLocal(cb) {
  localListeners.add(cb)
  return () => localListeners.delete(cb)
}

function writeLocal(map) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(map)) } catch { /* private mode / quota */ }
  localVersion += 1
  for (const cb of localListeners) cb()
}

// Server map wins on conflict — it's the newer write in every case where
// they disagree except an offline mark, and an offline mark is still
// present in local so the union covers it.
function merge(local, server) {
  const out = {}
  for (const kind of Object.values(READ_KINDS)) {
    out[kind] = {
      ...(local?.[kind] || {}),
      ...(server?.[kind] || {}),
      // Last, so a mark made just now is never overwritten by a server map
      // fetched before it.
      ...(sessionMarks[kind] || {}),
    }
  }
  return out
}

export function useReadState() {
  const { data } = useQuery({
    queryKey: ['read-state'],
    queryFn: () => api.get('/read-state'),
    staleTime: 5 * 60_000,
  })
  // Re-render when the local mirror changes, so a mark clears its dot
  // immediately whether or not the caller threaded a queryClient through.
  useSyncExternalStore(subscribeLocal, () => localVersion, () => localVersion)
  return merge(readLocal(), data)
}

/**
 * Imperative marker. Not a hook so it can be called from event handlers
 * that already exist (modal-open callbacks, dismiss buttons) without
 * restructuring them.
 *
 * queryClient is passed in because this is called from plain functions;
 * components get one from useQueryClient().
 */
export function markRead(queryClient, kind, refId, value = '1') {
  if (!kind || !refId) return
  const id = String(refId)
  const val = value == null ? '1' : String(value)

  sessionMarks[kind] = { ...(sessionMarks[kind] || {}), [id]: val }

  const local = readLocal()
  local[kind] = { ...(local[kind] || {}), [id]: val }
  writeLocal(local)

  queryClient?.setQueryData(['read-state'], (prev) => ({
    ...(prev || {}),
    [kind]: { ...(prev?.[kind] || {}), [id]: val },
  }))

  // Fire and forget — the UI has already updated from local state.
  api.post('/read-state', { kind, ref_id: id, value: val }).catch(() => {})
}

// Convenience wrapper for components that already hold a queryClient.
export function useMarkRead() {
  const queryClient = useQueryClient()
  return (kind, refId, value) => markRead(queryClient, kind, refId, value)
}

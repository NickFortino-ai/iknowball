// Shared formatter for record values. Same record can render in
// multiple places (record book page, feed card, detail modal, server
// email), and they all need to read the same way. Keep this in lockstep
// with server/src/services/recordService.js's formatRecordValue().

export function formatRecordValue(record) {
  if (record == null) return ''
  // RecordBookPage uses `record_value` (current record snapshot row);
  // RecordFeedCard / RecordDetailModal use `new_value` (record_history row).
  // Accept both to keep callers simple.
  const val = record.record_value ?? record.new_value ?? record.value ?? record
  if (val == null) return '--'
  const key = record.record_key || record.key || ''

  switch (key) {
    case 'highest_prop_pct':
    case 'biggest_dog_lover':
    case 'highest_overall_win_pct':
      return `${val}%`
    case 'biggest_underdog_hit':
      // American odds (+750) reframed as profit-on-$10-stake.
      return `10 → ${Math.round(val / 10)}`
    case 'best_futures_hit':
      // Stored as American odds; display as IKB points (odds / 10).
      return `+${Math.round(val / 10)} pts`
    case 'biggest_parlay':
      return `10 → ${Math.round((val - 1) * 10)}`
    case 'great_climb':
      return `${val} spots`
    case 'most_parlay_legs':
      return `${val} legs`
    case 'longest_crown_tenure':
      return `${val} days`
    case 'fewest_picks_to_baller':
    case 'fewest_picks_to_elite':
    case 'fewest_picks_to_hof':
    case 'fewest_picks_to_goat':
      return `${val} picks`
    default:
      // Per-sport futures hits (best_futures_hit_basketball_nba, etc.)
      if (key.startsWith('best_futures_hit_')) {
        return `+${Math.round(val / 10)} pts`
      }
      return `${val}`
  }
}

// Variant for displaying a previous_value alongside the new value where
// the record object only carries the key once. Pass the same record (for
// the key) plus the raw previous_value.
export function formatRecordPreviousValue(record, previousValue) {
  if (previousValue == null) return ''
  return formatRecordValue({ ...record, new_value: previousValue })
}

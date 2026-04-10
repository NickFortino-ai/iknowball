/**
 * Paginated fetch to bypass Supabase's silent 1000-row server limit.
 * Pass an unexecuted Supabase query builder — this adds .range() and
 * concatenates pages until the full result set is collected.
 *
 * Usage:
 *   const rows = await fetchAll(
 *     supabase.from('users').select('id, total_points').order('total_points', { ascending: false })
 *   )
 */
export async function fetchAll(query) {
  const PAGE = 1000
  let all = []
  let offset = 0
  while (true) {
    const { data, error } = await query.range(offset, offset + PAGE - 1)
    if (error) throw error
    all = all.concat(data || [])
    if (!data || data.length < PAGE) break
    offset += PAGE
  }
  return all
}

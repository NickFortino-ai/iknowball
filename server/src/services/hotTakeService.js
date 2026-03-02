import { supabase } from '../config/supabase.js'

export async function createHotTake(userId, content, teamTag) {
  const { data, error } = await supabase
    .from('hot_takes')
    .insert({ user_id: userId, content, team_tag: teamTag || null })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteHotTake(userId, hotTakeId) {
  const { data: hotTake } = await supabase
    .from('hot_takes')
    .select('id, user_id')
    .eq('id', hotTakeId)
    .single()

  if (!hotTake) {
    const err = new Error('Hot take not found')
    err.status = 404
    throw err
  }

  if (hotTake.user_id !== userId) {
    const err = new Error('You can only delete your own hot takes')
    err.status = 403
    throw err
  }

  const { error } = await supabase.from('hot_takes').delete().eq('id', hotTakeId)
  if (error) throw error
}

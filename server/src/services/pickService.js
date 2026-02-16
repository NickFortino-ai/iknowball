import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function submitPick(userId, gameId, pickedTeam) {
  // Verify game exists and hasn't started
  const { data: game, error: gameError } = await supabase
    .from('games')
    .select('id, status, starts_at')
    .eq('id', gameId)
    .single()

  if (gameError || !game) {
    const err = new Error('Game not found')
    err.status = 404
    throw err
  }

  if (game.status !== 'upcoming') {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  if (new Date(game.starts_at) <= new Date()) {
    const err = new Error('Game has already started — picks are locked')
    err.status = 400
    throw err
  }

  // Upsert pick (user can change pick before lock)
  const { data, error } = await supabase
    .from('picks')
    .upsert(
      {
        user_id: userId,
        game_id: gameId,
        picked_team: pickedTeam,
        status: 'pending',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,game_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to submit pick')
    throw error
  }

  return data
}

export async function deletePick(userId, gameId) {
  const { data: pick } = await supabase
    .from('picks')
    .select('id, status')
    .eq('user_id', userId)
    .eq('game_id', gameId)
    .single()

  if (!pick) {
    const err = new Error('Pick not found')
    err.status = 404
    throw err
  }

  if (pick.status !== 'pending') {
    const err = new Error('Cannot undo a locked or settled pick')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('picks')
    .delete()
    .eq('id', pick.id)

  if (error) {
    logger.error({ error }, 'Failed to delete pick')
    throw error
  }
}

export async function getUserPicks(userId, status) {
  let query = supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error

  return data
}

export async function getUserPickHistory(userId) {
  const { data, error } = await supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .eq('status', 'settled')
    .order('updated_at', { ascending: false })

  if (error) throw error
  return data
}

export async function getPublicPickHistory(userId) {
  const { data, error } = await supabase
    .from('picks')
    .select('*, games(*, sports(key, name))')
    .eq('user_id', userId)
    .eq('status', 'settled')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

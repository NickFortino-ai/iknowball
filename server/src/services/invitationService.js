import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

export async function sendInvitation(leagueId, senderId, username) {
  // Verify sender is commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id, status, max_members, settings')
    .eq('id', leagueId)
    .single()

  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }

  if (league.commissioner_id !== senderId) {
    const err = new Error('Only the commissioner can invite players')
    err.status = 403
    throw err
  }

  if (league.status !== 'open') {
    const err = new Error('This league is no longer accepting members')
    err.status = 400
    throw err
  }

  // Look up recipient by username
  const { data: recipient } = await supabase
    .from('users')
    .select('id, username')
    .eq('username', username)
    .single()

  if (!recipient) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }

  if (recipient.id === senderId) {
    const err = new Error('You cannot invite yourself')
    err.status = 400
    throw err
  }

  // Check if already a member
  const { data: existingMember } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', leagueId)
    .eq('user_id', recipient.id)
    .single()

  if (existingMember) {
    const err = new Error('This user is already a member of the league')
    err.status = 400
    throw err
  }

  // Check if already invited (pending)
  const { data: existingInvite } = await supabase
    .from('league_invitations')
    .select('id, status')
    .eq('league_id', leagueId)
    .eq('invited_user_id', recipient.id)
    .single()

  if (existingInvite?.status === 'pending') {
    const err = new Error('This user already has a pending invitation')
    err.status = 400
    throw err
  }

  // Check max members
  if (league.max_members) {
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', leagueId)

    if (count >= league.max_members) {
      const err = new Error('This league is full')
      err.status = 400
      throw err
    }
  }

  // Upsert invitation (handles re-inviting after decline)
  const { data: invitation, error } = await supabase
    .from('league_invitations')
    .upsert(
      {
        league_id: leagueId,
        invited_by: senderId,
        invited_user_id: recipient.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
      { onConflict: 'league_id,invited_user_id' }
    )
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to create invitation')
    throw error
  }

  return invitation
}

export async function getMyInvitations(userId) {
  const { data, error } = await supabase
    .from('league_invitations')
    .select(`
      id,
      status,
      created_at,
      leagues(id, name, format, sport),
      inviter:invited_by(username, display_name, avatar_emoji)
    `)
    .eq('invited_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

export async function acceptInvitation(invitationId, userId) {
  const { data: invitation } = await supabase
    .from('league_invitations')
    .select('*, leagues(status, max_members, settings)')
    .eq('id', invitationId)
    .eq('invited_user_id', userId)
    .single()

  if (!invitation) {
    const err = new Error('Invitation not found')
    err.status = 404
    throw err
  }

  if (invitation.status !== 'pending') {
    const err = new Error('This invitation is no longer pending')
    err.status = 400
    throw err
  }

  if (invitation.leagues.status !== 'open') {
    const err = new Error('This league is no longer accepting members')
    err.status = 400
    throw err
  }

  // Check max members
  if (invitation.leagues.max_members) {
    const { count } = await supabase
      .from('league_members')
      .select('id', { count: 'exact', head: true })
      .eq('league_id', invitation.league_id)

    if (count >= invitation.leagues.max_members) {
      const err = new Error('This league is full')
      err.status = 400
      throw err
    }
  }

  // Check if already a member (edge case: joined via invite code while invitation was pending)
  const { data: existingMember } = await supabase
    .from('league_members')
    .select('id')
    .eq('league_id', invitation.league_id)
    .eq('user_id', userId)
    .single()

  if (existingMember) {
    // Already a member — just mark invitation as accepted
    await supabase
      .from('league_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitationId)

    return { league_id: invitation.league_id }
  }

  // Add to league
  const { error: memberError } = await supabase.from('league_members').insert({
    league_id: invitation.league_id,
    user_id: userId,
    role: 'member',
    lives_remaining: invitation.leagues.settings?.lives || 1,
  })

  if (memberError) {
    logger.error({ error: memberError }, 'Failed to add member via invitation')
    throw memberError
  }

  // Mark invitation as accepted
  await supabase
    .from('league_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId)

  return { league_id: invitation.league_id }
}

export async function declineInvitation(invitationId, userId) {
  const { data: invitation } = await supabase
    .from('league_invitations')
    .select('id, status')
    .eq('id', invitationId)
    .eq('invited_user_id', userId)
    .single()

  if (!invitation) {
    const err = new Error('Invitation not found')
    err.status = 404
    throw err
  }

  if (invitation.status !== 'pending') {
    const err = new Error('This invitation is no longer pending')
    err.status = 400
    throw err
  }

  const { error } = await supabase
    .from('league_invitations')
    .update({ status: 'declined' })
    .eq('id', invitationId)

  if (error) throw error
}

export async function getLeagueInvitations(leagueId, userId) {
  // Verify commissioner
  const { data: league } = await supabase
    .from('leagues')
    .select('commissioner_id')
    .eq('id', leagueId)
    .single()

  if (!league || league.commissioner_id !== userId) {
    const err = new Error('Only the commissioner can view invitations')
    err.status = 403
    throw err
  }

  const { data, error } = await supabase
    .from('league_invitations')
    .select(`
      id,
      status,
      created_at,
      user:invited_user_id(username, display_name, avatar_emoji)
    `)
    .eq('league_id', leagueId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}

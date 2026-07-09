import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

const MAX_MESSAGE_LENGTH = 4000

export async function createCommissionerReport(leagueId, commissionerUserId, message) {
  const trimmed = (message || '').trim()
  if (!trimmed) {
    const err = new Error('Message is required')
    err.status = 400
    throw err
  }
  if (trimmed.length > MAX_MESSAGE_LENGTH) {
    const err = new Error(`Message is too long (max ${MAX_MESSAGE_LENGTH} characters)`)
    err.status = 400
    throw err
  }

  // Verify caller is the league's commissioner. Guards against a user
  // spoofing leagueId to send admin messages tagged to a league they don't run.
  const { data: league } = await supabase
    .from('leagues')
    .select('id, name, commissioner_id')
    .eq('id', leagueId)
    .single()
  if (!league) {
    const err = new Error('League not found')
    err.status = 404
    throw err
  }
  if (league.commissioner_id !== commissionerUserId) {
    const err = new Error('Only the commissioner can report a problem for this league')
    err.status = 403
    throw err
  }

  const { data: report, error } = await supabase
    .from('commissioner_reports')
    .insert({
      league_id: leagueId,
      commissioner_id: commissionerUserId,
      message: trimmed,
    })
    .select()
    .single()
  if (error) throw error

  logger.info({ reportId: report.id, leagueId, commissionerUserId }, 'Commissioner report submitted')
  return report
}

export async function listCommissionerReports({ status } = {}) {
  let query = supabase
    .from('commissioner_reports')
    .select('id, league_id, commissioner_id, message, status, admin_reply, admin_replied_at, admin_replier_id, created_at, updated_at, leagues(name, format), users!commissioner_reports_commissioner_id_fkey(username, display_name, avatar_url, avatar_emoji)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function replyToCommissionerReport(reportId, adminUserId, reply) {
  const trimmed = (reply || '').trim()
  if (!trimmed) {
    const err = new Error('Reply is required')
    err.status = 400
    throw err
  }

  const { data: report } = await supabase
    .from('commissioner_reports')
    .select('id, commissioner_id, league_id, leagues(name)')
    .eq('id', reportId)
    .single()
  if (!report) {
    const err = new Error('Report not found')
    err.status = 404
    throw err
  }

  const { error: updateErr } = await supabase
    .from('commissioner_reports')
    .update({
      admin_reply: trimmed,
      admin_replied_at: new Date().toISOString(),
      admin_replier_id: adminUserId,
      status: 'replied',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reportId)
  if (updateErr) throw updateErr

  // Notify the commissioner. Best-effort — admin still sees the reply
  // saved even if the notification insert fails.
  try {
    await createNotification(
      report.commissioner_id,
      'commissioner_report_reply',
      `Admin replied to your report about ${report.leagues?.name || 'your league'}`,
      { leagueId: report.league_id, reportId },
    )
  } catch (err) {
    logger.error({ err, reportId }, 'Failed to notify commissioner of reply')
  }

  return { ok: true }
}

export async function resolveCommissionerReport(reportId, adminUserId) {
  const { error } = await supabase
    .from('commissioner_reports')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw error
  logger.info({ reportId, adminUserId }, 'Commissioner report resolved')
  return { ok: true }
}

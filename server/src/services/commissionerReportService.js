import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

const MAX_MESSAGE_LENGTH = 4000

/**
 * Hydrate a report row into a unified messages array. The initial
 * commissioner message + first admin reply still live on the report row
 * itself (from migration 244), so we prepend them to whatever's in the
 * commissioner_report_messages table (migration 245). The client renders
 * everything as one thread without knowing about the split.
 */
function hydrateMessages(report, extraMessages) {
  const messages = []
  if (report.message) {
    messages.push({
      id: `report-${report.id}-initial`,
      report_id: report.id,
      sender_id: report.commissioner_id,
      sender_role: 'commissioner',
      message: report.message,
      created_at: report.created_at,
    })
  }
  if (report.admin_reply) {
    messages.push({
      id: `report-${report.id}-first-reply`,
      report_id: report.id,
      sender_id: report.admin_replier_id,
      sender_role: 'admin',
      message: report.admin_reply,
      created_at: report.admin_replied_at,
    })
  }
  for (const m of extraMessages || []) messages.push(m)
  messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
  return messages
}

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

/**
 * Commissioner-side list: every report they've filed for this league,
 * with the full message thread hydrated on each.
 */
export async function listReportsForCommissioner(leagueId, commissionerUserId) {
  const { data: reports, error } = await supabase
    .from('commissioner_reports')
    .select('id, league_id, commissioner_id, message, status, admin_reply, admin_replied_at, admin_replier_id, created_at, updated_at')
    .eq('league_id', leagueId)
    .eq('commissioner_id', commissionerUserId)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw error
  if (!reports?.length) return []

  const ids = reports.map((r) => r.id)
  const { data: messageRows } = await supabase
    .from('commissioner_report_messages')
    .select('id, report_id, sender_id, sender_role, message, created_at')
    .in('report_id', ids)
    .order('created_at', { ascending: true })

  const byReport = {}
  for (const m of messageRows || []) {
    if (!byReport[m.report_id]) byReport[m.report_id] = []
    byReport[m.report_id].push(m)
  }

  return reports.map((r) => ({ ...r, messages: hydrateMessages(r, byReport[r.id]) }))
}

/**
 * Admin-side list: every report across all leagues, filtered by status.
 * Joined with league + commissioner info for the admin panel.
 */
export async function listCommissionerReports({ status } = {}) {
  let query = supabase
    .from('commissioner_reports')
    .select('id, league_id, commissioner_id, message, status, admin_reply, admin_replied_at, admin_replier_id, created_at, updated_at, leagues(name, format), users!commissioner_reports_commissioner_id_fkey(username, display_name, avatar_url, avatar_emoji)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (status && status !== 'all') query = query.eq('status', status)
  const { data: reports, error } = await query
  if (error) throw error
  if (!reports?.length) return []

  const ids = reports.map((r) => r.id)
  const { data: messageRows } = await supabase
    .from('commissioner_report_messages')
    .select('id, report_id, sender_id, sender_role, message, created_at')
    .in('report_id', ids)
    .order('created_at', { ascending: true })

  const byReport = {}
  for (const m of messageRows || []) {
    if (!byReport[m.report_id]) byReport[m.report_id] = []
    byReport[m.report_id].push(m)
  }

  return reports.map((r) => ({ ...r, messages: hydrateMessages(r, byReport[r.id]) }))
}

/**
 * Append a message to an existing report thread. Enforces sender_role
 * against the actual user identity so a commissioner can't post as admin
 * or vice versa.
 */
export async function postReportMessage(reportId, senderUserId, senderRole, message) {
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

  const { data: report } = await supabase
    .from('commissioner_reports')
    .select('id, league_id, commissioner_id, status, leagues(name)')
    .eq('id', reportId)
    .single()
  if (!report) {
    const err = new Error('Report not found')
    err.status = 404
    throw err
  }

  if (senderRole === 'commissioner' && report.commissioner_id !== senderUserId) {
    const err = new Error('Only the report author can post as commissioner')
    err.status = 403
    throw err
  }

  if (report.status === 'resolved') {
    const err = new Error('This report is resolved — start a new one for a fresh issue')
    err.status = 400
    throw err
  }

  const { data: msg, error } = await supabase
    .from('commissioner_report_messages')
    .insert({
      report_id: reportId,
      sender_id: senderUserId,
      sender_role: senderRole,
      message: trimmed,
    })
    .select()
    .single()
  if (error) throw error

  // Bump status: a commissioner reply after an admin reply reopens the
  // conversation from admin's perspective ('open' with fresh unread signal);
  // an admin reply flips it to 'replied' if it wasn't already.
  const newStatus = senderRole === 'admin' ? 'replied' : 'open'
  await supabase
    .from('commissioner_reports')
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', reportId)

  // Notify the other party.
  try {
    if (senderRole === 'admin') {
      await createNotification(
        report.commissioner_id,
        'commissioner_report_reply',
        `Admin replied to your report about ${report.leagues?.name || 'your league'}`,
        { leagueId: report.league_id, reportId },
      )
    }
    // Commissioner→admin follow-up doesn't fire a notification (admin
    // watches the SupportPanel with a 30s refetch + badge count).
  } catch (err) {
    logger.error({ err, reportId }, 'Failed to send thread notification')
  }

  return msg
}

/**
 * Legacy compat: old admin panel calls this to send the first admin
 * reply. Under the hood this now writes a message row like any other
 * follow-up. The admin_reply column stays untouched on the report row
 * so existing pre-thread reports still render their first reply.
 */
export async function replyToCommissionerReport(reportId, adminUserId, reply) {
  return postReportMessage(reportId, adminUserId, 'admin', reply)
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

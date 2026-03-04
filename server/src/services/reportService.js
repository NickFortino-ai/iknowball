import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

let transporter = null

function getTransporter() {
  if (!transporter) {
    if (!env.SMTP_USER || !env.SMTP_PASS) return null
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  }
  return transporter
}

export async function sendReportNotification(report, reporterId) {
  const transport = getTransporter()
  if (!transport) return

  // Look up usernames
  const { data: users } = await supabase
    .from('users')
    .select('id, username')
    .in('id', [reporterId, report.reported_user_id])

  const reporter = users?.find((u) => u.id === reporterId)
  const reported = users?.find((u) => u.id === report.reported_user_id)

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 20px; margin-bottom: 16px;">New Content Report</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #888;">Reporter</td><td style="padding: 6px 0;">@${reporter?.username || 'unknown'}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Reported User</td><td style="padding: 6px 0;">@${reported?.username || 'unknown'}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Type</td><td style="padding: 6px 0;">${report.target_type}</td></tr>
        <tr><td style="padding: 6px 0; color: #888;">Reason</td><td style="padding: 6px 0;">${report.reason}</td></tr>
        ${report.details ? `<tr><td style="padding: 6px 0; color: #888;">Details</td><td style="padding: 6px 0;">${report.details}</td></tr>` : ''}
      </table>
    </div>
  `

  await transport.sendMail({
    from: `"I KNOW BALL" <${env.SMTP_FROM}>`,
    to: env.SMTP_FROM,
    subject: `Report: ${report.reason} — @${reported?.username || 'unknown'} (${report.target_type})`,
    html,
    text: `New report from @${reporter?.username}: ${report.reason} on ${report.target_type} by @${reported?.username}. ${report.details || ''}`,
  })

  logger.info({ reportId: report.id }, 'Report notification email sent')
}

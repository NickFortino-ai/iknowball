import { supabase } from '../config/supabase.js'
import { sendEmailBlast, sendTargetedEmail, sendTemplateBracketEmail } from '../services/emailService.js'
import { logger } from '../utils/logger.js'

export async function sendScheduledEmails() {
  const now = new Date().toISOString()

  const { data: pending, error } = await supabase
    .from('email_logs')
    .select('*')
    .eq('email_status', 'scheduled')
    .lte('scheduled_at', now)
    .order('scheduled_at', { ascending: true })
    .limit(5)

  if (error || !pending?.length) return

  for (const email of pending) {
    // Mark as sending to prevent double-processing
    const { data: locked } = await supabase
      .from('email_logs')
      .update({ email_status: 'sending' })
      .eq('id', email.id)
      .eq('email_status', 'scheduled')
      .select('id')
      .single()

    if (!locked) continue // Another instance grabbed it

    try {
      if (email.type === 'blast') {
        await sendEmailBlast(email.subject, email.body)
      } else if (email.type === 'targeted') {
        await sendTargetedEmail(email.subject, email.body, email.recipients_requested)
      } else if (email.type === 'template_blast') {
        const templateId = email.recipients_requested?.[0]
        await sendTemplateBracketEmail(email.subject, email.body, templateId)
      }

      // Send functions create their own log row, so delete the scheduled placeholder
      await supabase.from('email_logs').delete().eq('id', email.id)

      logger.info({ id: email.id, type: email.type }, 'Scheduled email sent')
    } catch (err) {
      // Mark as sent so it doesn't retry forever
      await supabase
        .from('email_logs')
        .update({ email_status: 'sent', failed: 1 })
        .eq('id', email.id)

      logger.error({ err, id: email.id }, 'Failed to send scheduled email')
    }
  }
}

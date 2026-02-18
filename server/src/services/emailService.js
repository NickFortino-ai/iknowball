import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { supabase } from '../config/supabase.js'
import { logger } from '../utils/logger.js'

let transporter = null

function getTransporter() {
  if (!transporter) {
    if (!env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('SMTP_USER and SMTP_PASS must be configured')
    }
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    })
  }
  return transporter
}

export async function getAllUserEmails() {
  const emails = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data: { users }, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!users || users.length === 0) break

    for (const user of users) {
      if (user.email) {
        emails.push(user.email)
      }
    }

    if (users.length < perPage) break
    page++
  }

  return emails
}

export async function sendEmailBlast(subject, body) {
  const transport = getTransporter()
  const emails = await getAllUserEmails()

  logger.info({ count: emails.length }, 'Sending email blast')

  let sent = 0
  let failed = 0
  const errors = []

  for (const email of emails) {
    try {
      await transport.sendMail({
        from: `"IKnowBall" <${env.SMTP_FROM}>`,
        to: email,
        subject,
        html: body,
        text: body.replace(/<[^>]*>/g, ''),
      })
      sent++
    } catch (err) {
      failed++
      errors.push({ email, error: err.message })
      logger.error({ email, error: err.message }, 'Failed to send email')
    }
  }

  logger.info({ sent, failed }, 'Email blast complete')
  return { total: emails.length, sent, failed, errors }
}

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

function encodeToken(userId) {
  return Buffer.from(userId).toString('base64url')
}

export function decodeToken(token) {
  return Buffer.from(token, 'base64url').toString()
}

function getUnsubscribeUrl(userId) {
  const token = encodeToken(userId)
  const baseUrl = env.CORS_ORIGIN.split(',')[0].trim()
  return `${baseUrl}/unsubscribe?token=${token}`
}

function appendUnsubscribeFooter(html, userId) {
  const url = getUnsubscribeUrl(userId)
  return `${html}<br/><hr style="border:none;border-top:1px solid #333;margin:24px 0 12px"/><p style="font-size:12px;color:#888;text-align:center"><a href="${url}" style="color:#888">Unsubscribe</a> from IKnowBall emails</p>`
}

export async function getSubscribedUsers() {
  // Get all user IDs that haven't unsubscribed
  const { data: subscribedUsers, error: dbError } = await supabase
    .from('users')
    .select('id')
    .eq('email_unsubscribed', false)

  if (dbError) throw dbError

  const subscribedIds = new Set((subscribedUsers || []).map((u) => u.id))

  // Get emails from auth for subscribed users
  const users = []
  let page = 1
  const perPage = 1000

  while (true) {
    const { data: { users: authUsers }, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!authUsers || authUsers.length === 0) break

    for (const user of authUsers) {
      if (user.email && subscribedIds.has(user.id)) {
        users.push({ id: user.id, email: user.email })
      }
    }

    if (authUsers.length < perPage) break
    page++
  }

  return users
}

export async function sendEmailBlast(subject, body) {
  const transport = getTransporter()
  const users = await getSubscribedUsers()

  logger.info({ count: users.length }, 'Sending email blast')

  let sent = 0
  let failed = 0
  const errors = []

  for (const user of users) {
    try {
      const htmlWithFooter = appendUnsubscribeFooter(body, user.id)
      await transport.sendMail({
        from: `"IKnowBall" <${env.SMTP_FROM}>`,
        to: user.email,
        subject,
        html: htmlWithFooter,
        text: htmlWithFooter.replace(/<[^>]*>/g, ''),
      })
      sent++
    } catch (err) {
      failed++
      errors.push({ email: user.email, error: err.message })
      logger.error({ email: user.email, error: err.message }, 'Failed to send email')
    }
  }

  logger.info({ sent, failed }, 'Email blast complete')
  return { total: users.length, sent, failed, errors }
}

export async function sendTargetedEmail(subject, body, usernames) {
  const transport = getTransporter()

  // Look up user IDs by username
  const { data: users, error: dbError } = await supabase
    .from('users')
    .select('id, username')
    .in('username', usernames)

  if (dbError) throw dbError
  if (!users?.length) return { total: 0, sent: 0, failed: 0, notFound: usernames, errors: [] }

  const foundUsernames = users.map((u) => u.username)
  const notFound = usernames.filter((u) => !foundUsernames.includes(u))

  // Get emails from auth
  const userIds = new Set(users.map((u) => u.id))
  const emailMap = {}
  let page = 1
  const perPage = 1000

  while (true) {
    const { data: { users: authUsers }, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error
    if (!authUsers || authUsers.length === 0) break

    for (const authUser of authUsers) {
      if (authUser.email && userIds.has(authUser.id)) {
        emailMap[authUser.id] = authUser.email
      }
    }

    if (authUsers.length < perPage) break
    page++
  }

  logger.info({ count: Object.keys(emailMap).length, usernames: foundUsernames }, 'Sending targeted email')

  let sent = 0
  let failed = 0
  const errors = []

  for (const user of users) {
    const email = emailMap[user.id]
    if (!email) {
      failed++
      errors.push({ username: user.username, error: 'No email found' })
      continue
    }

    try {
      const htmlWithFooter = appendUnsubscribeFooter(body, user.id)
      await transport.sendMail({
        from: `"IKnowBall" <${env.SMTP_FROM}>`,
        to: email,
        subject,
        html: htmlWithFooter,
        text: htmlWithFooter.replace(/<[^>]*>/g, ''),
      })
      sent++
    } catch (err) {
      failed++
      errors.push({ username: user.username, error: err.message })
      logger.error({ username: user.username, error: err.message }, 'Failed to send targeted email')
    }
  }

  logger.info({ sent, failed, notFound }, 'Targeted email complete')
  return { total: users.length, sent, failed, notFound, errors }
}

export async function sendLeagueInviteEmail(toEmail, leagueName, inviteCode) {
  const transport = getTransporter()
  const baseUrl = env.CORS_ORIGIN.split(',')[0].trim()
  const inviteUrl = `${baseUrl}/join/${inviteCode}`

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h1 style="font-size: 24px; margin-bottom: 8px;">You've been invited!</h1>
      <p style="color: #aaa; font-size: 16px; margin-bottom: 24px;">
        Someone invited you to join <strong>${leagueName}</strong> on I KNOW BALL.
      </p>
      <a href="${inviteUrl}"
         style="display: inline-block; background: #f97316; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
        Join League
      </a>
      <p style="color: #888; font-size: 13px; margin-top: 24px;">
        Or copy this link: <a href="${inviteUrl}" style="color: #f97316;">${inviteUrl}</a>
      </p>
    </div>
  `

  await transport.sendMail({
    from: `"IKnowBall" <${env.SMTP_FROM}>`,
    to: toEmail,
    subject: `You've been invited to join ${leagueName} on I KNOW BALL`,
    html,
    text: `You've been invited to join "${leagueName}" on I KNOW BALL!\n\nJoin here: ${inviteUrl}`,
  })

  logger.info({ to: toEmail, league: leagueName }, 'Sent league invite email')
}

export async function unsubscribeUser(userId) {
  const { error } = await supabase
    .from('users')
    .update({ email_unsubscribed: true })
    .eq('id', userId)

  if (error) throw error
}

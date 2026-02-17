import webpush from 'web-push'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:notifications@iknowball.com',
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  )
}

export async function sendPushNotification(userId, title, body, url = '/results') {
  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error) {
    logger.error({ error, userId }, 'Failed to fetch push subscriptions')
    return
  }

  if (!subscriptions?.length) return

  const payload = JSON.stringify({ title, body, url })

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('id', sub.id)
          logger.info({ endpoint: sub.endpoint }, 'Removed expired push subscription')
        } else {
          logger.error({ error: err, endpoint: sub.endpoint }, 'Failed to send push notification')
        }
      }
    })
  )

  return results
}

export async function savePushSubscription(userId, subscription) {
  const { endpoint, keys } = subscription

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      { user_id: userId, endpoint, p256dh: keys.p256dh, auth: keys.auth },
      { onConflict: 'endpoint' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deletePushSubscription(userId, endpoint) {
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('user_id', userId)
    .eq('endpoint', endpoint)

  if (error) throw error
}

export async function getUserPushSubscriptions(userId) {
  const { count, error } = await supabase
    .from('push_subscriptions')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) throw error
  return { hasSubscriptions: (count || 0) > 0 }
}

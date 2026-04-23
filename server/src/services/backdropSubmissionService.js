import sharp from 'sharp'
import { randomUUID } from 'crypto'
import { supabase } from '../config/supabase.js'
import { env } from '../config/env.js'
import { logger } from '../utils/logger.js'
import { createNotification } from './notificationService.js'

const BUCKET_SUBMISSIONS = 'backdrop-submissions'
const BUCKET_APPROVED = 'backdrop-approved'
const MAX_WIDTH = 1920

/**
 * Process and upload a backdrop submission.
 */
export async function submitBackdrop(userId, leagueId, fileBuffer, originalFilename, mimetype) {
  // Auto-rotate based on EXIF orientation, resize, convert to webp
  let processed = sharp(fileBuffer).rotate() // .rotate() with no args applies EXIF orientation
  const metadata = await processed.metadata()
  if (metadata.width > MAX_WIDTH) {
    processed = processed.resize({ width: MAX_WIDTH })
  }
  const webpBuffer = await processed.webp({ quality: 80 }).toBuffer()

  const filename = `${randomUUID()}.webp`
  const storagePath = leagueId ? `submissions/${leagueId}/${filename}` : `submissions/general/${filename}`

  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_SUBMISSIONS)
    .upload(storagePath, webpBuffer, { contentType: 'image/webp', upsert: false })

  if (uploadErr) {
    logger.error({ uploadErr, userId, leagueId }, 'Failed to upload backdrop to storage')
    throw new Error('Failed to upload image')
  }

  const { data, error } = await supabase
    .from('backdrop_submissions')
    .insert({
      user_id: userId,
      league_id: leagueId || null,
      storage_path: storagePath,
      original_filename: originalFilename,
    })
    .select()
    .single()

  if (error) {
    logger.error({ error }, 'Failed to insert backdrop submission')
    throw error
  }

  logger.info({ submissionId: data.id, userId, leagueId }, 'Backdrop submitted for review')
  return data
}

/**
 * Get all pending submissions for admin review.
 */
export async function getPendingSubmissions() {
  const { data, error } = await supabase
    .from('backdrop_submissions')
    .select('*, users!backdrop_submissions_user_id_fkey(id, username, display_name), leagues(id, name)')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    logger.error({ error }, 'Failed to fetch pending backdrop submissions')
    throw error
  }

  // Generate signed URLs for preview
  const withUrls = await Promise.all((data || []).map(async (sub) => {
    const { data: urlData } = await supabase.storage
      .from(BUCKET_SUBMISSIONS)
      .createSignedUrl(sub.storage_path, 3600)
    return { ...sub, preview_url: urlData?.signedUrl || null }
  }))

  return withUrls
}

/**
 * Approve a submission — move image to approved bucket, set as league backdrop.
 */
export async function approveSubmission(submissionId, adminUserId) {
  const { data: sub, error } = await supabase
    .from('backdrop_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('status', 'pending')
    .single()

  if (error || !sub) throw new Error('Submission not found or already reviewed')

  // Download from submissions bucket
  const { data: fileData, error: dlErr } = await supabase.storage
    .from(BUCKET_SUBMISSIONS)
    .download(sub.storage_path)

  if (dlErr || !fileData) throw new Error('Failed to download submission image')

  const buffer = Buffer.from(await fileData.arrayBuffer())
  const approvedFilename = `custom-${randomUUID().slice(0, 8)}.webp`

  // Upload to approved bucket
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET_APPROVED)
    .upload(approvedFilename, buffer, { contentType: 'image/webp', upsert: false })

  if (uploadErr) throw new Error('Failed to upload to approved bucket')

  // Build the public URL path
  const publicPath = `custom/${approvedFilename}`

  // Set the backdrop on the league or user profile
  if (sub.league_id) {
    await supabase
      .from('leagues')
      .update({ backdrop_image: publicPath, updated_at: new Date().toISOString() })
      .eq('id', sub.league_id)
  } else {
    await supabase
      .from('users')
      .update({ backdrop_image: publicPath })
      .eq('id', sub.user_id)
  }

  // Update submission status
  await supabase
    .from('backdrop_submissions')
    .update({
      status: 'approved',
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  // Notify submitter
  const notifMsg = sub.league_id
    ? 'Your backdrop submission was approved and is now live on your league!'
    : 'Your custom profile backdrop was approved and is now live!'
  await createNotification(sub.user_id, 'comment', notifMsg,
    { leagueId: sub.league_id })

  logger.info({ submissionId, approvedFilename, leagueId: sub.league_id }, 'Backdrop submission approved')
  return { approvedFilename, publicPath }
}

/**
 * Reject a submission with a reason.
 */
export async function rejectSubmission(submissionId, adminUserId, reason) {
  const { data: sub, error } = await supabase
    .from('backdrop_submissions')
    .select('*')
    .eq('id', submissionId)
    .eq('status', 'pending')
    .single()

  if (error || !sub) throw new Error('Submission not found or already reviewed')

  // Update submission
  await supabase
    .from('backdrop_submissions')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', submissionId)

  // Delete from storage
  await supabase.storage.from(BUCKET_SUBMISSIONS).remove([sub.storage_path])

  // Notify submitter
  await createNotification(sub.user_id, 'comment',
    `Your backdrop submission was not approved: ${reason}`,
    { leagueId: sub.league_id })

  logger.info({ submissionId, reason }, 'Backdrop submission rejected')
}

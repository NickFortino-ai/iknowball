import { supabase } from '../config/supabase.js'

let cachedWords = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function loadBannedWords() {
  const now = Date.now()
  if (cachedWords && now - cacheTimestamp < CACHE_TTL) {
    return cachedWords
  }

  const { data, error } = await supabase
    .from('banned_words')
    .select('word')

  if (error) throw error

  cachedWords = (data || []).map((row) => row.word.toLowerCase())
  cacheTimestamp = now
  return cachedWords
}

function clearCache() {
  cachedWords = null
  cacheTimestamp = 0
}

export async function checkContent(text) {
  const words = await loadBannedWords()
  const normalized = text.toLowerCase()

  for (const word of words) {
    const regex = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(normalized)) {
      return { blocked: true, word }
    }
  }

  return { blocked: false, word: null }
}

export async function checkUserMuted(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('is_muted')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data?.is_muted === true
}

export async function getBannedWords() {
  const { data, error } = await supabase
    .from('banned_words')
    .select('*')
    .order('word')

  if (error) throw error
  return data
}

export async function addBannedWord(word) {
  const { data, error } = await supabase
    .from('banned_words')
    .insert({ word: word.toLowerCase().trim() })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      const err = new Error('Word already exists')
      err.status = 409
      throw err
    }
    throw error
  }

  clearCache()
  return data
}

export async function removeBannedWord(id) {
  const { error } = await supabase
    .from('banned_words')
    .delete()
    .eq('id', id)

  if (error) throw error
  clearCache()
}

export async function getMutedUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_url, avatar_emoji')
    .eq('is_muted', true)
    .order('username')

  if (error) throw error
  return data
}

export async function muteUser(userId) {
  const { error } = await supabase
    .from('users')
    .update({ is_muted: true })
    .eq('id', userId)

  if (error) throw error
}

export async function unmuteUser(userId) {
  const { error } = await supabase
    .from('users')
    .update({ is_muted: false })
    .eq('id', userId)

  if (error) throw error
}

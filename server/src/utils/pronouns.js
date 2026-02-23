const PRONOUN_MAP = {
  king: { subject: 'he', object: 'him', possessive: 'his' },
  queen: { subject: 'she', object: 'her', possessive: 'her' },
}

const NEUTRAL = { subject: 'they', object: 'them', possessive: 'their' }

export function getPronouns(titlePreference) {
  return PRONOUN_MAP[titlePreference] || NEUTRAL
}

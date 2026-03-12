// Returns gendered pronouns based on title_preference
// king = he/him/his, queen = she/her/hers, null = they/them/their
export function getPronouns(titlePreference) {
  if (titlePreference === 'king') return { subject: 'he', object: 'him', possessive: 'his' }
  if (titlePreference === 'queen') return { subject: 'she', object: 'her', possessive: 'her' }
  return { subject: 'they', object: 'them', possessive: 'their' }
}

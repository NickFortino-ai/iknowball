// Mirrors roundSeriesConfig in server/src/services/bracketService.js. The two
// MUST agree: this decides which buttons are offered and how a prediction is
// coloured, the server decides which values it stores and what it pays out.
// A mismatch either shows a length that is silently dropped on save, or
// promises a bonus that never lands.
//
// A round may declare `best_of`; otherwise the template-level flag applies,
// which is how every NBA / NHL / World Cup template still behaves.
//
// Lives here rather than inside a component because three callers need it:
// BracketPicker (which lengths to offer), BracketDisplay (how to colour a
// prediction), and the admin builder's bonus preview.
export function roundSeriesConfig(rounds, roundNumber, seriesFormat) {
  const round = (rounds || []).find((r) => r.round_number === roundNumber)
  const fromRound = Number(round?.best_of)
  const bestOf = Number.isFinite(fromRound) && fromRound > 0
    ? fromRound
    : (seriesFormat === 'best_of_7' ? 7 : 1)
  if (bestOf <= 1) {
    return { bestOf: 1, clinch: 1, lengths: [], isSeries: false, exactBonus: 0, oneOffBonus: 0 }
  }
  const clinch = Math.ceil(bestOf / 2)
  const lengths = []
  for (let n = clinch; n <= bestOf; n++) lengths.push(n)
  // The bonus tracks how many outcomes are possible: "exact" is a coin flip in
  // a best-of-3 and a one-in-four call in a best-of-7. NO one-off credit on a
  // best-of-3 — with two answers, "one game off" IS the other answer.
  const exactBonus = lengths.length
  const oneOffBonus = lengths.length >= 3 ? Math.floor(lengths.length / 2) : 0
  return { bestOf, clinch, lengths, isSeries: true, exactBonus, oneOffBonus }
}

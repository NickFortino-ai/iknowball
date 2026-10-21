// Tap-to-move lineup logic, kept out of the component so it can be reasoned
// about (and tested) on its own.
//
// The model is one predicate used in both directions:
//
//   tap an OCCUPIED spot -> the spots that player may move to
//   tap an EMPTY spot    -> the players who may fill it
//
// Whichever you tapped is the anchor; the list is everything legal on the
// other side. There is no "correct" entry point and no direction mode.
//
// The unit is a SPOT, not a slot. A league with 7 bench slots has 7 bench
// spots, each independently occupied or empty — which is what lets one tap
// promote a specific bench player into the lineup (they swap) as distinct
// from simply benching the anchor (he takes an empty spot). Treating bench as
// a single destination collapsed those two very different moves into one.
import { isPositionEligibleForSlot, isStarterSlot } from './rosterSlots'
import { isIrEligible } from './injuryStatus'

export const BENCH = 'bench'
export const IR = 'ir'

/**
 * The server's kickoff rule, mirrored exactly (fantasyService: a locked
 * player's assignment is refused unless BOTH slots are non-scoring).
 *
 * Mirrored rather than approximated because an option the server then refuses
 * is worse here than under the old Edit flow — an auto-saving tap has no Save
 * button to absorb the blame.
 */
export function canMoveLockedPlayer(fromSlot, toSlot) {
  return !isStarterSlot(fromSlot) && !isStarterSlot(toSlot)
}

function movable(player, toSlot) {
  if (!player) return false
  if (player.slot === toSlot) return true
  if (!player.is_locked) return true
  return canMoveLockedPlayer(player.slot, toSlot)
}

/**
 * Can this player occupy this slot at all, ignoring who is there now?
 * IR additionally requires an injury designation — capacity is handled by
 * the spot list, since an IR spot only exists up to the league's limit.
 */
export function isEligibleFor(player, slotKey, starterSlots) {
  if (!player) return false
  if (slotKey === BENCH) return true
  if (slotKey === IR) return isIrEligible(player.nfl_players?.injury_status)
  const def = (starterSlots || []).find((s) => s.key === slotKey)
  if (!def) return false
  return isPositionEligibleForSlot(player.nfl_players?.position, def.positions)
}

/**
 * Every roster spot, in display order, each with its occupant or null.
 *
 * Bench and IR are expanded to the league's configured counts. Math.max with
 * the actual occupancy is deliberate: a roster that is over its bench limit
 * (which happens after a healed IR player is forced back) still renders every
 * player rather than hiding whoever overflowed.
 */
export function buildSpots({ roster, starterSlots, benchLimit, irLimit }) {
  const rows = roster || []
  const spots = []

  for (const s of starterSlots || []) {
    spots.push({
      id: s.key,
      slotKey: s.key,
      label: s.label,
      occupant: rows.find((r) => r.slot === s.key) || null,
    })
  }

  const expand = (slotKey, label, limit) => {
    const occupants = rows.filter((r) => r.slot === slotKey)
    const count = Math.max(Number(limit || 0), occupants.length)
    for (let i = 0; i < count; i++) {
      spots.push({ id: `${slotKey}#${i}`, slotKey, label, occupant: occupants[i] || null })
    }
  }
  expand(BENCH, 'BN', benchLimit)
  expand(IR, 'IR', irLimit)

  return spots
}

/**
 * Options for whichever side was tapped.
 * Returns { anchorPlayer, anchorSpot, options }.
 */
export function buildMoveOptions({ anchor, roster, starterSlots, benchLimit, irLimit }) {
  const rows = roster || []
  const spots = buildSpots({ roster: rows, starterSlots, benchLimit, irLimit })

  if (anchor?.type === 'player') {
    const player = rows.find((r) => r.player_id === anchor.playerId)
    if (!player) return { anchorPlayer: null, anchorSpot: null, options: [] }
    const anchorSpot = spots.find((s) => s.occupant?.player_id === player.player_id) || null

    const options = []
    for (const spot of spots) {
      if (spot.id === anchorSpot?.id) continue
      // Shuffling within bench (or within IR) changes nothing that is saved —
      // both are unordered sets of one slot value.
      if (spot.slotKey === player.slot) continue
      if (!isEligibleFor(player, spot.slotKey, starterSlots)) continue
      if (!movable(player, spot.slotKey)) continue

      const occupant = spot.occupant
      // Where the displaced occupant ends up. Normally the anchor's own slot
      // — a swap is a SWAP — but an IR swap is different, see below.
      let occupantTo = player.slot
      if (occupant) {
        // Moving someone ONTO an occupied IR spot bumps the occupant to the
        // BENCH, not into the anchor's slot.
        //
        // Requiring him to fill the anchor's slot is the rule everywhere
        // else and it is right there: tapping a bench RB while moving a WR
        // out of WR1 would otherwise "swap" into the RB being re-benched and
        // WR1 left empty — a move nobody asked for, silently committed.
        //
        // But IR is not a position, it is a holding area, and the player
        // coming off it is healed rather than ready to start. Making him
        // eligible for the anchor's slot meant a DL on IR could not be
        // replaced by an Out WR, because a DL cannot play WR — so the IR
        // option simply never appeared and there was nothing on screen to
        // explain why. Bench is where clearing IR puts you on every other
        // platform.
        if (spot.slotKey === IR) {
          if (!movable(occupant, BENCH)) continue
          // Only if the bench can actually take him. The anchor vacating a
          // bench seat frees one, which is why this counts the resulting
          // roster rather than the current one.
          const benchAfter = rows.filter((r) => r.slot === BENCH && r.player_id !== player.player_id).length + 1
          if (benchAfter > Math.max(Number(benchLimit || 0), 0)) continue
          occupantTo = BENCH
        } else {
          if (!isEligibleFor(occupant, player.slot, starterSlots)) continue
          if (!movable(occupant, player.slot)) continue
        }
      }

      options.push({
        key: spot.id,
        kind: occupant ? 'swap' : 'move',
        label: spot.label,
        slotKey: spot.slotKey,
        spotId: spot.id,
        occupant,
        // Read by applyMove. Without it an IR swap would send the occupant
        // to the anchor's slot, which is the thing this branch exists to
        // avoid.
        occupantTo,
      })
    }
    // Collapse interchangeable empty spots. Seven open bench slots produced
    // seven identical "Empty BN" rows, and picking any of them wrote exactly
    // the same thing — the choice was noise, not a choice. Same for two empty
    // WR slots: whichever you tap, the player ends up starting at WR.
    //
    // Occupied spots are never collapsed; each one is a different player and
    // therefore a genuinely different move.
    const seenEmpty = new Set()
    const deduped = options.filter((o) => {
      if (o.occupant) return true
      if (seenEmpty.has(o.label)) return false
      seenEmpty.add(o.label)
      return true
    })
    return { anchorPlayer: player, anchorSpot, options: deduped }
  }

  if (anchor?.type === 'spot') {
    const spot = spots.find((s) => s.id === anchor.spotId)
    if (!spot) return { anchorPlayer: null, anchorSpot: null, options: [] }

    const options = []
    for (const p of rows) {
      if (p.slot === spot.slotKey) continue
      if (!isEligibleFor(p, spot.slotKey, starterSlots)) continue
      if (!movable(p, spot.slotKey)) continue
      options.push({
        key: p.player_id,
        kind: 'fill',
        label: spot.label,
        slotKey: spot.slotKey,
        spotId: spot.id,
        player: p,
      })
    }
    // Bench first, then IR, then starters — pulling someone out of another
    // starting slot leaves a fresh hole, so it shouldn't lead the list.
    // Within a group, the better projection first.
    options.sort((a, b) => {
      const rank = (r) => (r.slot === BENCH ? 0 : r.slot === IR ? 1 : 2)
      const d = rank(a.player) - rank(b.player)
      if (d !== 0) return d
      return (b.player.weekly_projection ?? -1) - (a.player.weekly_projection ?? -1)
    })
    return { anchorPlayer: null, anchorSpot: spot, options }
  }

  return { anchorPlayer: null, anchorSpot: null, options: [] }
}

/**
 * Apply one option and return the COMPLETE slot map ({ [player_id]: slot })
 * that the save endpoints expect.
 *
 * Always the full map, never a delta: both setters validate the whole lineup,
 * so sending everything makes each tap one atomic transaction — a swap cannot
 * land half-written with two players in one slot.
 */
export function applyMove({ anchor, option, roster }) {
  const rows = roster || []
  const next = {}
  for (const r of rows) next[r.player_id] = r.slot

  if (anchor?.type === 'player') {
    const player = rows.find((r) => r.player_id === anchor.playerId)
    if (!player) return next
    // A straight exchange, EXCEPT onto IR — there the occupant is bumped to
    // the bench instead. buildMoveOptions decides which it is and records
    // the destination on the option; defaulting to the anchor's slot keeps
    // an older option object (or a test building one by hand) behaving the
    // way it always did.
    if (option.occupant) next[option.occupant.player_id] = option.occupantTo || player.slot
    next[player.player_id] = option.slotKey
    return next
  }

  if (anchor?.type === 'spot' && option.player) {
    // The spot was empty, so nothing is displaced — the player's old spot
    // simply becomes empty in turn. Deliberately not back-filled: a hole you
    // can see beats a rearrangement you didn't ask for.
    next[option.player.player_id] = option.slotKey
    return next
  }

  return next
}

/** Slot map -> the array shape both lineup endpoints take. */
export function toSlotAssignments(slotMap) {
  return Object.entries(slotMap || {}).map(([player_id, slot]) => ({ player_id, slot }))
}

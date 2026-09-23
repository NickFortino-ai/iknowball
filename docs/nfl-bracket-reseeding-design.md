# NFL brackets need reseeding — design note

Not yet built. Written down so the analysis isn't repeated.

## Why NFL doesn't fit the current model

Every bracket we support is **statically wired**: `bracket_template_matchups`
carries `feeds_into_matchup_id` + `feeds_into_slot`, so the winner of a
matchup goes to a known slot decided when the template was built. That works
for MLB, the NBA, the NHL, the NCAA tournament and the World Cup, none of
which reseed.

**The NFL reseeds.** After the Wild Card round the 1 seed plays the *lowest
remaining* seed. If the 7 seed upsets the 2, the 1 seed draws the 7. Which
Wild Card winner feeds which Divisional matchup is unknowable in advance, so
no static wire can express it.

## The good news: it bites in exactly one round

14 teams, 7 per conference, **only the 1 seed on a bye**:

```
Wild Card    2v7, 3v6, 4v5        3 matchups per conference
Divisional   1 vs lowest survivor  2 matchups per conference   <- RESEEDS
Conf Champ   the two survivors     1 matchup per conference
Super Bowl   AFC vs NFC            1 matchup
```

13 matchups, 13 games, 14 teams. By the Conference Championship only two
teams remain per conference, so there is no seeding choice left. **Only the
Divisional round reseeds.**

Per conference after the Wild Card round, survivors are the 1 seed plus three
winners. Sort ascending by seed:

```
DIV-A   seeds[0] (always the 1) vs seeds[3]   lowest survivor
DIV-B   seeds[1] vs seeds[2]                  the middle two
```

## Proposed shape

Add `reseed: true` to a round in the template's `rounds` JSON, meaning *"this
round's participants come from re-seeding the previous round's survivors
within their region."*

### Server — `bracketService.js`

`enterTemplateResult` currently pushes a winner straight into
`feeds_into_slot` the moment a matchup settles. A reseeding round **cannot
place anyone until the whole previous round is settled for that region**.

So: after any result in round N-1, if round N has `reseed`, check whether
every round N-1 matchup in that region is settled. Only then gather the
survivors (winners, plus any bye team already sitting in round N) and write
all four `team_top`/`team_bottom` + seeds at once.

Wild Card matchups then need no `feeds_into_matchup_id` at all — placement is
computed. The Divisional -> Championship -> Super Bowl wires stay static.

### Client — `BracketPicker.jsx` (the hard half)

The picker resolves each matchup through `feederMap`: a static
`matchup.id -> { top, bottom }` built from `feeds_into_*`. **Reseeding has no
fixed feeder pair**, so this needs a parallel path: for a reseed round,
resolve participants from the user's own picks in the previous round plus the
bye team, sorted by seed, and pair 1-vs-lowest / middle-two.

This matters because a bracket is the user's *prediction* — their Divisional
pairings must follow from their own Wild Card picks, or the bracket they
submit isn't the one they think they're submitting.

### Display — `BracketDisplay.jsx`

Will need the same treatment wherever it draws connectors from `feeds_into`.

## Sequencing

No deadline pressure: NFL playoffs are mid-January. MLB (Sep 30) and WNBA are
the near-term ones and are done. Worth building this as its own focused
change with its own verification, not appended to a long session — it touches
the component that takes users' picks, and a half-built version is worse than
none, because users would submit brackets the server then reseeds
differently.

## Also needed, once the engine exists

- `generateNfl14Matchups` in `BracketTemplateBuilder.jsx`, same idea as
  `generateMlb12Matchups` — 13 matchups, one bye per conference.
- An `americanfootball_nfl` entry in `SPORT_BRACKET_PRESETS`: 14 teams,
  `single_elimination`, regions `['AFC', 'NFC']`.

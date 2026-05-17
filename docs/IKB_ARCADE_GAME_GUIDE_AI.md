# How to Build an IKB Arcade Game (AI-First Edition)

You don't need to know how to code. You just need to be good at **describing
what you want** and **noticing what's wrong** when something looks off. The
AI handles the actual coding.

This guide walks you through building a real, working game using AI tools.
Read it once, then follow it step by step.

---

## What you're building

A simple browser game called **Alien Dodgeball**. Two aliens face off on a
2D field. You move around, throw a ball, and try to hit your opponent. 60
seconds, most hits wins. Cute, fast, fun.

Once it works, you'll send Nick the URL and he plugs it into IKB Arcade.

---

## Step 1: Make the accounts you'll need (5 min)

Sign up for free accounts at:

1. **[bolt.new](https://bolt.new)** — this is where you'll build the game
2. **[netlify.com](https://netlify.com)** — this is where you'll publish it
3. **[github.com](https://github.com)** (optional, but recommended) — for backup

That's it. No app installs. Everything runs in your browser.

---

## Step 2: Open Bolt.new and tell it what to build

Go to **bolt.new**. You'll see a big text box. Paste this **exact prompt**:

> Build a 2D browser game called Alien Dodgeball. It runs in a single HTML
> file with vanilla JavaScript and the Canvas API — no frameworks, no React,
> no build step.
>
> Two aliens face each other on a 2D field. The left alien is the player
> (controlled by the user). The right alien is a simple AI opponent.
>
> **Player controls (must work on both desktop and mobile):**
> - Desktop: arrow keys or WASD to move, spacebar to throw ball toward opponent
> - Mobile: a virtual joystick on the left half of the screen for movement,
>   tap the right half of the screen to throw
>
> **Game rules:**
> - 60-second round timer
> - Each player has 3 hearts (lives)
> - Throwing a ball costs nothing; balls disappear after hitting something
> - When a ball hits an alien, that alien loses a heart
> - First to lose all 3 hearts loses, OR when the timer hits 0, the player
>   with more remaining hearts wins
> - Show a clear "You Win!" or "You Lose!" screen at the end
> - Track final score: hits landed on the opponent
>
> **Visual style:**
> - Dark space background (deep blue or near-black with a few stars)
> - Aliens are cute and simple — round bodies, big eyes, two colors so they're
>   easy to tell apart (e.g., green for player, purple for AI)
> - Balls are bright, glowing, slightly bigger than realistic
> - Smooth movement, small particle effect when a ball hits an alien
> - Hearts shown at the top of the screen for each player
> - Big readable timer at the top center
> - Mobile-first layout — no scrolling, fills the whole screen
>
> **AI opponent behavior:**
> - Moves around randomly to avoid getting hit
> - Throws a ball at the player every 1.5–2.5 seconds
> - Speed and accuracy should make it beatable but not a pushover
>
> Use no external libraries. Use only vanilla JavaScript and the HTML Canvas
> API. The whole game should be one index.html file.

Hit Enter. Bolt will build the game. Watch the right side — it'll open a
preview as soon as the code compiles.

---

## Step 3: Play it. See if it's fun.

Click around. Try to win. Try to lose. Notice anything that feels off?

If something needs to change, **just tell Bolt in plain English**:

- "The aliens move too slow. Make them about twice as fast."
- "The opponent is too easy. Make it throw the ball more often."
- "Add a sound effect when a ball hits an alien."
- "Make the player alien red instead of green."
- "Add a 3-2-1 countdown before the round starts."
- "After the round ends, add a 'Play Again' button that restarts the game."

Each instruction = a new round of refinement. Keep going until you like
the game.

**Don't stress about the code.** You don't need to read it. Just describe
what you want.

---

## Step 4: Make sure it works on a phone

This is the most important test. Most IKB players are on phones.

In Bolt's preview window:
- Click the icon that looks like a phone (or open the preview URL on your
  phone directly)
- Try to play with thumbs only
- Does the joystick feel responsive? Can you throw without misclicking?

If the controls feel bad on mobile, tell Bolt:

> The mobile controls feel sluggish. Make the joystick more responsive and
> increase the size of the throw zone on the right side of the screen.

Iterate until it feels smooth on a real phone.

---

## Step 5: Add the IKB integration

This is the only "technical" part, and the AI will handle it. Once your
game feels good, paste this prompt into Bolt:

> Add IKB Arcade integration to this game.
>
> 1. When the page loads, read these from the URL parameters:
>    - `ikbToken` (a string)
>    - `gameId` (a string, default to "alien-dodgeball" if missing)
>    Stash both in module-level variables.
>
> 2. When the round ends, after showing the win/lose screen, send the
>    player's score to IKB. Use this exact code shape:
>
>    ```js
>    async function submitToIKB(score) {
>      try {
>        const res = await fetch('https://api.iknowball.club/arcade/score', {
>          method: 'POST',
>          headers: { 'Content-Type': 'application/json' },
>          body: JSON.stringify({ ikbToken, gameId, score })
>        })
>        if (res.ok) return 'Score saved!'
>        return 'Save failed.'
>      } catch {
>        return 'Offline — score not saved.'
>      }
>    }
>    ```
>
> 3. Show the result of `submitToIKB(score)` as a small text line under the
>    win/lose screen — something like "Score saved!" or "Save failed."
>
> The score sent to IKB should be the number of hits the player landed on
> the opponent during the round.

Bolt adds this in seconds. You won't notice anything different when playing
locally (the API call will fail because you don't have a real token yet),
but the integration is in place for when Nick adds your game to IKB.

---

## Step 6: Download the game

In Bolt, look for a button that says **Download** or **Export**. Click it
and you'll get a folder of files — typically just `index.html` and maybe a
couple others.

If Bolt doesn't have an obvious download button, tell it:

> Show me the full `index.html` file so I can copy it.

Then paste the code into a new file on your computer named `index.html`.

---

## Step 7: Publish your game

Go to **[netlify.com/drop](https://app.netlify.com/drop)**.

Drag the folder containing your `index.html` onto the page.

Netlify will give you a URL like `https://glittering-cupcake-1234.netlify.app`.

That's your game. Open the URL on your phone. It should work.

(If you want a nicer URL, you can rename the site in Netlify settings —
e.g., `https://alien-dodgeball.netlify.app`.)

---

## Step 8: Send the URL to Nick

Send him these five things:

1. **Game URL** — `https://alien-dodgeball.netlify.app`
2. **Game name** — "Alien Dodgeball"
3. **One-sentence description** — "Outrun and outaim an alien opponent
   in 60-second dodgeball rounds."
4. **An icon** — a 256×256 PNG of the alien character. You can ask Bolt
   or any AI image generator to make this for you. Dark background, no
   white border.
5. **Score-to-IKB conversion idea** — e.g., "5 hits = 1 IKB point. 10 hits =
   3 IKB points. Win the round = bonus 5 IKB points."

That's it. Done. Game is built and ready to plug into IKB.

---

## When you get stuck

### "Bolt won't generate the right thing"

- Be more specific. Instead of "make it better," say "make the aliens 50%
  bigger and the field background darker blue."
- Reset and start fresh with a clearer prompt if it goes off the rails.

### "The game has a bug"

- Tell Bolt exactly what went wrong: "When I throw a ball while moving up,
  the ball flies off-screen. The ball should always go toward the opponent."
- AI is great at fixing bugs you describe clearly.

### "I want to use a different AI"

- [Claude.ai](https://claude.ai) is great for asking questions and getting
  code chunks (free with limits, paid for unlimited).
- [Cursor](https://cursor.com) is a desktop app (free) that's like a code
  editor with Claude built in. Better for fine-tuning after Bolt makes the
  first draft.
- [v0.dev](https://v0.dev) — also great for quick UI builds.
- [Lovable.dev](https://lovable.dev) — similar to Bolt.
- All of them work for this. Bolt is the lowest-friction starting point.

### "I want to make a different kind of game"

The same flow works. Just change the prompt in Step 2. Good prompt seeds:

- "Build a top-down maze game where a robot collects coins while avoiding
  ghosts. 90-second rounds."
- "Build a side-scrolling jumping game where an alien hops between
  platforms over a void. Score = how far you get."
- "Build a memory match game with player photos and team logos. 16 cards.
  Score = time remaining when all matched."

The integration steps (5–8) stay exactly the same.

---

## Recap

1. **Bolt.new** — describe the game, AI builds it
2. **Iterate** in plain English until it's fun
3. **Test on a phone** — most important
4. **Add IKB integration** with the prompt in Step 5
5. **Download** the code
6. **Drag it onto Netlify Drop** to publish
7. **Send Nick the URL**

Total time end-to-end: probably 1–3 sessions. Have fun.

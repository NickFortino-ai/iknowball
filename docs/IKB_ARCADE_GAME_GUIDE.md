# How to Build a Game for IKB Arcade

Welcome! You're going to build a small game that plugs into I KNOW BALL's
Arcade. This guide is the only thing you need.

---

## 1. The big picture (read this first)

Your game runs **inside an iframe** on the IKB app. IKB handles login,
scores, friends, and leaderboards. Your game's job is just:

1. **Be fun.**
2. Read who the player is from the URL when IKB launches your game.
3. Send the final score back to IKB when the round ends.

That's it. You don't touch IKB's code. You don't store users. You don't
build login. You don't run a database.

---

## 2. What stack should I use?

Whatever you want. The game is hosted independently, so IKB doesn't care
how it's built. Some good options:

| Type of game | Suggested tool |
| --- | --- |
| Simple tap/reaction game | HTML + CSS + plain JavaScript |
| 2D arcade-style | [Phaser](https://phaser.io) |
| Fast 2D effects | [Pixi.js](https://pixijs.com) |
| 3D | [Three.js](https://threejs.org) |
| Full game engine | Unity (export as WebGL) |

**For your first game, use plain JavaScript or Phaser.** Don't overthink it.

---

## 3. Project setup

Make a folder. Put your stuff in it. Done.

```
my-game/
├── index.html
├── game.js
├── style.css
└── assets/
    ├── images/
    └── sounds/
```

Open `index.html` in a browser. Now you're a game developer.

---

## 4. The IKB contract (THE IMPORTANT PART)

When IKB opens your game, the URL looks like this:

```
https://your-game.com?ikbToken=eyJ...&gameId=your-game-id
```

You need to:

### A. Read the params on load

```js
const params = new URLSearchParams(window.location.search)
const ikbToken = params.get('ikbToken')
const gameId = params.get('gameId')
```

Stash these in a variable. You'll need them when the round ends. You do
**not** need to decode `ikbToken` — just hold it like a passcode.

### B. Submit the score when the round ends

```js
async function submitScore(score) {
  const res = await fetch('https://api.iknowball.club/arcade/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ikbToken, gameId, score })
  })
  if (!res.ok) {
    console.error('Score submit failed:', await res.text())
    return null
  }
  return res.json() // { saved: true, ikbPointsEarned: N }
}
```

Then show the player "Saved!" + their score, plus a "Play Again" button.

---

## 5. Design constraints

These aren't suggestions, they're requirements:

- **Dark backgrounds.** IKB is a dark-themed app. White backgrounds will
  look jarring. Stick to dark grey / black with bright accents.
- **Mobile first.** ~90% of players are on a phone. Build for a 375px
  width first, scale up to desktop second.
- **One screen, no scroll.** Your game fills the iframe edge-to-edge.
  Don't make `<body>` scroll — that breaks how it sits inside IKB.
- **Round length: 30 seconds to 5 minutes.** Anything longer and players
  lose interest before reaching the end.
- **One round per session.** Player taps Play Again to start over. Don't
  build complex meta-progression — IKB's leaderboard is the meta game.

---

## 6. A 60-second skeleton you can copy

Save this as `index.html` and you've got a working game stub:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Tap Race</title>
  <style>
    html, body { margin: 0; height: 100%; background: #0a0a0a; color: white;
                 font-family: -apple-system, sans-serif; overflow: hidden;
                 user-select: none; -webkit-user-select: none; }
    #app { display: flex; flex-direction: column; align-items: center;
           justify-content: center; height: 100%; gap: 1rem; padding: 1rem; }
    button { background: #ff6b00; color: white; border: 0; padding: 1rem 2rem;
             font-size: 1.1rem; border-radius: 0.75rem; font-weight: 700; }
    .score { font-size: 3rem; font-weight: 800; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const params = new URLSearchParams(location.search)
    const ikbToken = params.get('ikbToken')
    const gameId = params.get('gameId') || 'tap-race'
    const app = document.getElementById('app')

    let score = 0
    let timeLeft = 10
    let timer = null

    function showStart() {
      app.innerHTML = `
        <h1>Tap Race</h1>
        <p>Tap as many times as you can in 10 seconds.</p>
        <button id="start">Start</button>
      `
      document.getElementById('start').onclick = startRound
    }

    function startRound() {
      score = 0
      timeLeft = 10
      app.innerHTML = `
        <div class="score" id="score">0</div>
        <p>Time: <span id="time">10</span>s</p>
        <button id="tap" style="font-size: 2rem; width: 200px; height: 200px; border-radius: 50%;">TAP</button>
      `
      document.getElementById('tap').addEventListener('touchstart', tap, { passive: true })
      document.getElementById('tap').addEventListener('mousedown', tap)
      timer = setInterval(tick, 1000)
    }

    function tap() {
      score++
      document.getElementById('score').textContent = score
    }

    function tick() {
      timeLeft--
      document.getElementById('time').textContent = timeLeft
      if (timeLeft <= 0) endRound()
    }

    async function endRound() {
      clearInterval(timer)
      app.innerHTML = `
        <h2>Time's up!</h2>
        <div class="score">${score}</div>
        <p id="status">Saving…</p>
        <button id="again">Play Again</button>
      `
      document.getElementById('again').onclick = showStart

      try {
        const res = await fetch('https://api.iknowball.club/arcade/score', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ikbToken, gameId, score })
        })
        document.getElementById('status').textContent = res.ok ? 'Score saved!' : 'Save failed.'
      } catch {
        document.getElementById('status').textContent = 'Offline — score not saved.'
      }
    }

    showStart()
  </script>
</body>
</html>
```

Open it in a browser. It works. Now make it your own.

---

## 7. Test locally

From inside your project folder:

```
npx serve .
```

Then go to `http://localhost:3000?ikbToken=fake&gameId=test`.

Score submission will fail (the token isn't real) but the rest of the
game runs fine. Build the whole game, then test for real once Nick gives
you a token.

---

## 8. Deploy your game

Pick the easiest one:

| Service | How |
| --- | --- |
| **Netlify** | drag-and-drop your folder at [netlify.com/drop](https://app.netlify.com/drop) |
| **Vercel** | run `npx vercel` from your folder |
| **Cloudflare Pages** | push to GitHub, connect at [pages.cloudflare.com](https://pages.cloudflare.com) |
| **GitHub Pages** | push to a repo, enable Pages in repo settings |

You'll get a URL like `https://my-game.netlify.app`. Send it to Nick.

---

## 9. Hand off to Nick

When you're ready, send him:

1. **Deployed URL** — `https://my-game.netlify.app`
2. **Game name** — short and punchy
3. **Description** — 1–2 sentences, no marketing speak
4. **Icon** — 256×256 PNG, dark-friendly, no white border
5. **Score curve suggestion** — e.g., "Score 50 = 1 IKB pt; score 200 = 5 IKB pts"

That's it. He'll add it to the Arcade.

---

## 10. Questions to ask Nick before starting

- What's the real API base URL? (`https://api.iknowball.club/arcade/score`?)
- Will the token be opaque or can we decode the user ID for personalization?
- Daily play cap? (e.g., 3 rounds per day per game)
- Color palette / font / brand guidelines?
- Can we use multiplayer / async features later?

---

## Tips from the trenches

- **Test on a real phone early.** Desktop testing lies. iPhone Safari is
  where the action is.
- **Use `touchstart` not just `click`.** Click has a 300ms delay on mobile.
- **Don't autoplay sound.** iOS blocks it. Trigger sounds on a user tap.
- **Lazy load assets.** Players will quit before your 4MB sprite sheet
  finishes loading.
- **Keep it under 1MB total** if you can. Fast load = more plays.
- **Build the whole game with `score = randomInt(0, 100)`** before worrying
  about IKB integration. Get the loop fun first, hook it up second.

---

Build something cool. Ship it. Iterate.

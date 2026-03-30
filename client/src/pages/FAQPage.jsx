import { useState } from 'react'

const sections = [
  {
    title: 'I KNOW BALL',
    faqs: [
      {
        q: 'What is I KNOW BALL?',
        a: `I KNOW BALL is the all-in-one sports platform for people who live and breathe sports. Pick winners using live Vegas odds, run fantasy leagues with the best visuals in the game, and prove you actually know ball.

\u2022 <strong class="text-white">Picks:</strong> Make daily picks on real games across NFL, NBA, MLB, NHL, and more. Every pick is scored using live odds and permanently tracked \u2014 no hiding from bad takes.
\u2022 <strong class="text-white">Fantasy Leagues:</strong> Full-featured fantasy football, NBA Daily Fantasy, MLB Daily Fantasy, Home Run Derby, Survivor pools, Brackets, Pick\u2019em, and Squares. Create a league in seconds, invite your squad, and compete with stadium backdrops and real trophies.
\u2022 <strong class="text-white">Social:</strong> Post takes, react to your friends\u2019 picks, comment, and watch the feed light up. Your connections see everything \u2014 the wins, the losses, and the streaks.
\u2022 <strong class="text-white">Global Leaderboard:</strong> Climb from Rookie to GOAT. Your score reflects everything \u2014 picks, props, parlays, futures, and league finishes. Filter by sport to see who really knows ball.

Built for the fan who\u2019s tired of clunky fantasy apps and wants something that actually looks and feels like a modern sports experience.`,
      },
      {
        q: 'Is this gambling?',
        a: 'No. I KNOW BALL is not a sportsbook and does not involve real money wagering. You never pick with real money on games. The app uses a points-based scoring system for entertainment and bragging rights only. No cash is wagered, won, or distributed through the app. Think of it like fantasy sports \u2014 you\u2019re competing for status, not money.',
      },
      {
        q: 'What sports are available?',
        a: 'NFL, NBA, NCAAB, NCAAF, WNBA, MLB, NHL, and MLS. Each sport has its own leaderboard filter so you can see who knows ball sport by sport.',
      },
      {
        q: 'How much does it cost?',
        a: 'The app is free to use with one small one-time payment to unlock full access. Paid features are in development and will be insanely valuable.',
      },
      {
        q: 'What are the status tiers?',
        a: `Your total points determine your tier:

\u2022 Lost: Below 0 points
\u2022 Rookie: 0\u201399 points
\u2022 Baller: 100\u2013499 points
\u2022 Elite: 500\u2013999 points
\u2022 Hall of Famer: 1,000\u20132,999 points
\u2022 GOAT: 3,000+ points

Your tier is visible on your profile, the leaderboard, and in every league you join. It\u2019s earned through consistent, smart picking over time.`,
      },
      {
        q: 'What are the Weekly Headlines?',
        a: 'Every Monday, we publish the top 5 performances of the week with narratives, plus Pick of the Week, Biggest Fall, and Longest Active Streak. If you make the Weekly Headlines, you\u2019ll get an email and an in-app notification. It\u2019s your moment of fame.',
      },
    ],
  },
  {
    title: 'Picks & Scoring',
    faqs: [
      {
        q: 'How does scoring work?',
        a: `Every pick risks points and can earn points based on the Vegas odds at the time you lock it in.

\u2022 Favorites (negative odds): You risk 10 points for a smaller reward. The heavier the favorite, the less you earn. Example: picking a -300 favorite risks 10 and earns +3 if correct.
\u2022 Underdogs (positive odds): You risk 10 points for a larger reward. The bigger the underdog, the more you earn. Example: picking a +250 underdog risks 10 and earns +25 if correct.
\u2022 Heavy favorites beyond -1000: The risk increases. A -1500 favorite risks 15 points, a -2000 risks 20. This prevents people from gaming the system with extreme chalk.
\u2022 Wrong picks: You lose your risk amount (usually 10 points).

The system is designed so that over time, your score reflects how well you actually know sports \u2014 not how often you pick safe favorites.`,
      },
      {
        q: 'What are parlays?',
        a: 'A parlay lets you combine multiple picks into one. All picks must be correct for the parlay to hit. The risk and reward are multiplied \u2014 bigger upside, bigger downside. If you\u2019re confident in multiple games, parlays let you stack your knowledge for a massive point payout.',
      },
      {
        q: 'What is the pick multiplier?',
        a: `The pick multiplier lets you amplify your risk and reward on straight picks in the global competition. If you have at least 20 total points, you can apply a 2x, 3x, or 4x multiplier to any pending straight pick.

\u2022 A 2x multiplier doubles both your risk and reward. A 3x triples them. A 4x quadruples them.
\u2022 The extra risk from multiplying draws from your total points as a budget.
\u2022 Regular 1x picks are always free \u2014 only the extra risk from multiplying requires budget.
\u2022 You can multiply multiple picks as long as you have enough budget remaining.

The multiplier is only available on straight picks in the global competition. It is not available in leagues, parlays, player props, or futures. To use it, tap the bottom bar on the Picks page to expand it, then toggle "Multiply" on.`,
      },
      {
        q: 'What are player props?',
        a: 'Props let you predict individual player performances instead of game outcomes. Things like \u201cWill Anthony Edwards score over 27.5 points?\u201d or \u201cWill Gerrit Cole record over 6.5 strikeouts?\u201d Props test deeper sports knowledge beyond just picking winners. I KNOW BALL features one player prop per day. Tapping a player\u2019s name shows their recent game log and season averages.',
      },
      {
        q: 'What are futures?',
        a: 'Futures are long-term predictions. You make one pick per market and it stays locked until the season is decided. Futures odds are usually longer, which means bigger potential point rewards if you call it right. You can pick one team per market for each sport (e.g. one NBA championship pick, one World Series pick).',
      },
      {
        q: 'Can I tap a game card to see more info?',
        a: 'Yes. On NBA, NFL, and WNBA games, tapping a game card opens the Game Intel modal showing today\u2019s projected starters, injury reports with depth chart adjustments, team records, and last 10 games form. On MLB games, tapping shows team records and the probable starting pitchers with their stats.',
      },
    ],
  },
  {
    title: 'Leagues',
    faqs: [
      {
        q: 'What are leagues?',
        a: `Leagues let you compete with friends, coworkers, or anyone else. A league commissioner creates the league, sets the rules, and invites members. League formats include:

\u2022 <strong class="text-white">Pick\u2019em:</strong> Pick games within the league each day or week. Your picks are scored using the same odds-based system as regular picks but tracked on a separate standings board.
\u2022 <strong class="text-white">Survivor:</strong> Pick one team to win each period. If your team loses, you lose a life. Use all your lives and you\u2019re eliminated. You can only pick each team once. Last one standing wins.
\u2022 <strong class="text-white">Brackets:</strong> Tournament-style bracket competitions where you fill out a bracket and earn points for each correct pick. Finishing position determines your global score impact.
\u2022 <strong class="text-white">Squares:</strong> Classic grid game for a specific matchup. Random numbers assigned, winners based on score at the end of each quarter.
\u2022 <strong class="text-white">Fantasy Football:</strong> Traditional draft-based fantasy football with head-to-head matchups, waivers, and trades.
\u2022 <strong class="text-white">NBA Daily Fantasy:</strong> Build a nightly NBA lineup under a salary cap (9 positions) and compete for the highest score.
\u2022 <strong class="text-white">MLB Daily Fantasy:</strong> Build a daily MLB lineup under a salary cap (C, 1B, 2B, SS, 3B, OF, OF, OF, UTIL) scored on hits, HRs, RBIs, runs, stolen bases, and more.
\u2022 <strong class="text-white">Home Run Derby:</strong> Pick 3 hitters per day who you think will hit a home run. Each player can only be used once per week. Total home runs determine standings with HR distance as tiebreaker.`,
      },
      {
        q: 'How do leagues affect my global score?',
        a: `It depends on the format:

\u2022 <strong class="text-white">Pick\u2019em:</strong> Your league pick points are added to your global score when the league ends, plus the winner earns a bonus equal to the number of members.
\u2022 <strong class="text-white">Survivor:</strong> Winners earn bonus points scaled by league size (10 pts for small leagues up to 100 pts for 41+ member leagues).
\u2022 <strong class="text-white">Bracket, Fantasy, NBA DFS, MLB DFS, HR Derby:</strong> All use position-based scoring when the league ends. Top half earns positive points, bottom half loses points. Formula: N+1\u22122\u00d7rank, plus a +10 champion bonus for 1st place. Ties split the points for the positions they span.
\u2022 <strong class="text-white">Squares:</strong> Does not affect global score.`,
      },
      {
        q: 'How do I invite friends to a league?',
        a: 'From your league page, use the link icon to copy an invite link, the share icon to share via your device\u2019s share sheet, or the invite icon to search and invite by username or email. When someone clicks the link, they\u2019ll be prompted to sign up and land directly in your league.',
      },
      {
        q: 'Can I choose a backdrop for my league?',
        a: 'Yes. When creating a league, you can select a stadium backdrop image that appears on your league page, league card, and join card. NBA leagues see NBA arenas, NFL leagues see NFL stadiums, and MLB leagues see MLB ballparks.',
      },
      {
        q: 'What is the trophy case?',
        a: 'The trophy case on the My Leagues page displays awards for every league you\u2019ve won. Medals are awarded for small leagues (4 or fewer members), small trophies for 5\u20138 members, medium trophies for 9\u201313 members, and large sport-specific trophies for 14+ member leagues. Tapping a trophy takes you to that league\u2019s page.',
      },
    ],
  },
  {
    title: 'Hub & Social',
    faqs: [
      {
        q: 'What is the Hub?',
        a: 'The Hub is your social home on I KNOW BALL. It shows your profile, your squad (connections), and a feed of activity from you and your connections \u2014 picks, streaks, league wins, posts, and more. You can also create posts, predictions, and polls to share with your connections.',
      },
      {
        q: 'What are connections?',
        a: 'Connections are your network on I KNOW BALL. You can search for and connect with other users by username. You\u2019re also automatically connected to anyone in your leagues (if auto-connect is enabled). Your connections feed shows notable events \u2014 big underdog hits, new tiers reached, hot streaks, survivor wins, and posts.',
      },
      {
        q: 'What can I post?',
        a: 'You can create posts with text, images, or videos. You can tag teams and other users, create polls, and make predictions. Posts show up in your connections\u2019 feeds. Your connections can react with emojis and leave comments on your posts.',
      },
    ],
  },
  {
    title: 'Leaderboard',
    faqs: [
      {
        q: 'What is the leaderboard?',
        a: 'The global leaderboard ranks every user by total points. You can filter by sport to see who actually knows football vs. basketball vs. baseball. Your rank and tier are visible to everyone.',
      },
      {
        q: 'How is my global score calculated?',
        a: `Your global score is the sum of all your settled pick points (wins and losses), prop pick points, parlay results, futures results, and league bonuses. League bonuses include winner bonuses, position-based finishes, and earned league pick points. The leaderboard is live \u2014 every settled pick updates your score immediately.`,
      },
    ],
  },
  {
    title: 'Account & Support',
    faqs: [
      {
        q: 'Is my data private?',
        a: 'Your picks, leagues, and activity are visible to other users on the platform \u2014 that\u2019s the point. Your email address and personal information are never shared with third parties. See our full privacy policy at iknowball.club/privacy.',
      },
      {
        q: 'What if I think there\u2019s an error with my score?',
        a: 'Contact us at <a href="mailto:admin@iknowball.club" class="text-accent hover:underline">admin@iknowball.club</a>. We have admin tools to audit and recalculate scores if something looks off.',
      },
      {
        q: 'How do I report a problem?',
        a: 'Email us at <a href="mailto:admin@iknowball.club" class="text-accent hover:underline">admin@iknowball.club</a> with a description of the issue and we\'ll look into it. You can also flag individual comments or posts directly in the app.',
      },
      {
        q: 'Who built this?',
        a: 'I KNOW BALL was created by Nick Fortino and Desmond Fortino. Questions, feedback, or feature requests? Email <a href="mailto:admin@iknowball.club" class="text-accent hover:underline">admin@iknowball.club</a>.',
      },
    ],
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-text-primary/10 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-4 text-left"
      >
        <span className="font-semibold text-sm text-text-primary pr-4">{q}</span>
        <svg
          className={`w-5 h-5 text-text-muted flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="pb-4 text-sm text-text-secondary whitespace-pre-line leading-relaxed" dangerouslySetInnerHTML={{ __html: a }} />
      )}
    </div>
  )
}

export default function FAQPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12 pb-32">
      <h1 className="font-display text-3xl text-center mb-2">FAQ</h1>
      <p className="text-text-muted text-center mb-6">Everything you need to know about I KNOW BALL</p>

      <button
        onClick={() => window.dispatchEvent(new Event('replay-tutorial'))}
        className="flex items-center gap-2 mx-auto mb-8 text-sm text-accent hover:text-accent-hover transition-colors"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" />
          <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
        </svg>
        Replay the tutorial
      </button>

      <div className="space-y-6">
        {sections.map((section) => (
          <div key={section.title}>
            <h2 className="font-display text-lg text-accent mb-2">{section.title}</h2>
            <div className="bg-bg-primary rounded-2xl border border-text-primary/20 px-6">
              {section.faqs.map((faq) => (
                <FAQItem key={faq.q} q={faq.q} a={faq.a} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

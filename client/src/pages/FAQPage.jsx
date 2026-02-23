import { useState } from 'react'

const faqs = [
  {
    q: 'What is I KNOW BALL?',
    a: 'I KNOW BALL is a sports prediction platform where you pick winners of real games using live Vegas odds, earn or lose points based on your accuracy, and climb from Rookie to GOAT status. Every pick you make is permanently tracked \u2014 no hiding from bad takes, no rewriting history.',
  },
  {
    q: 'Is this gambling?',
    a: 'No. I KNOW BALL is not a sportsbook and does not involve real money wagering. You never bet real money on games. The app uses a points-based scoring system for entertainment and bragging rights only. No cash is wagered, won, or distributed through the app. Think of it like fantasy sports \u2014 you\u2019re competing for status, not money.',
  },
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
    q: 'What are leagues?',
    a: `Leagues let you compete with friends, coworkers, or anyone else. A league commissioner creates the league and invites members. League formats include:

\u2022 Pick\u2019em: Everyone picks games each week. Most points at the end wins.
\u2022 Survivor: Pick one team to win each week. If your team loses, you\u2019re eliminated. You can only pick each team once all season. Last one standing wins.
\u2022 Brackets: Tournament-style bracket competitions.
\u2022 Super Bowl Squares: Classic grid game for the big game. Random numbers assigned, winners based on score at the end of each quarter.

League winners earn bonus points that count toward their global score.`,
  },
  {
    q: 'How do I invite friends?',
    a: 'From any league you\u2019ve created, tap the invite button. You can invite by username, send an email invitation, or copy a shareable link to text to anyone. When they click the link, they\u2019ll be prompted to sign up and will land directly in your league.',
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
    q: 'What sports are available?',
    a: 'NFL, NBA, NCAA Basketball, NCAA Football, MLB, NHL, and MLS. We\u2019re always looking to add more. Each sport has its own leaderboard filter so you can see who knows ball sport by sport.',
  },
  {
    q: 'What are parlays?',
    a: 'A parlay lets you combine 2\u20135 picks into one bet. All picks must be correct for the parlay to hit. The risk and reward are multiplied \u2014 bigger upside, bigger downside. If you\u2019re confident in multiple games, parlays let you stack your knowledge for a massive point payout.',
  },
  {
    q: 'What are player props?',
    a: 'Props let you predict individual player performances instead of game outcomes. Things like \u201cWill Anthony Edwards score over 27.5 points?\u201d or \u201cWill Brock Purdy throw over 2.5 touchdowns?\u201d Props test deeper sports knowledge beyond just picking winners. I KNOW BALL features one player prop per day.',
  },
  {
    q: 'What are futures?',
    a: 'Futures are long-term predictions. You make one pick per market and it stays locked until the season is decided. Futures odds are usually longer, which means bigger potential point rewards if you call it right.',
  },
  {
    q: 'Can I only pick once per futures market?',
    a: 'Yes. One pick per market. If you pick the Denver Nuggets to win the championship, you can\u2019t also pick the Thunder. You\u2019re locked in. You can pick for each sport though.',
  },
  {
    q: 'What is the leaderboard?',
    a: 'The global leaderboard ranks every user by total points. You can filter by sport to see who actually knows football vs. basketball vs. baseball. Your rank and tier are visible to everyone.',
  },
  {
    q: 'What are connections?',
    a: 'Connections are your network on I KNOW BALL. You\u2019re automatically connected to anyone in your leagues. You can also search for and connect with other users by username. Your connections feed shows notable events \u2014 big underdog hits, new tiers reached, hot streaks, and survivor wins.',
  },
  {
    q: 'What are the Weekly Headlines?',
    a: 'Every Monday, we publish the top 5 performances of the week with narratives, plus Pick of the Week, Biggest Fall, and Longest Active Streak. If you make the Weekly Headlines, you\u2019ll get an email and an in-app notification. It\u2019s your moment of fame.',
  },
  {
    q: 'Is my data private?',
    a: 'Your picks, leagues, and activity are visible to other users on the platform \u2014 that\u2019s the point. Your email address and personal information are never shared with third parties. See our full privacy policy at iknowball.club/privacy.',
  },
  {
    q: 'How much does it cost?',
    a: 'The app is free to use with one small one-time payment to unlock full access. We also offer promo codes for early adopters. Paid features are in development and will be insanely valuable.',
  },
  {
    q: 'What if I think there\u2019s an error with my score?',
    a: 'Contact us at admin@iknowball.club. We have admin tools to audit and recalculate scores if something looks off.',
  },
  {
    q: 'Who built this?',
    a: 'I KNOW BALL was created by Nick Fortino and Desmond Fortino. Questions, feedback, or feature requests? Email admin@iknowball.club.',
  },
]

function FAQItem({ q, a }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="border-b border-border last:border-b-0">
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
        <div className="pb-4 text-sm text-text-secondary whitespace-pre-line leading-relaxed">
          {a}
        </div>
      )}
    </div>
  )
}

export default function FAQPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <h1 className="font-display text-3xl text-center mb-2">FAQ</h1>
      <p className="text-text-muted text-center mb-8">Everything you need to know about I KNOW BALL</p>

      <div className="bg-bg-card rounded-2xl border border-border px-6">
        {faqs.map((faq) => (
          <FAQItem key={faq.q} q={faq.q} a={faq.a} />
        ))}
      </div>
    </div>
  )
}

const ONBOARDING_STEPS = [
  {
    page: null,
    targetSelector: null,
    title: 'Welcome to I KNOW BALL',
    body: "The fantasy sports platform where you make picks, compete in leagues, and climb the leaderboard across every major sport. Keep in mind — you can replay this tutorial anytime from the FAQ page.",
    position: 'center',
    buttonText: "Let's Go",
  },
  {
    page: null,
    targetSelector: '[data-onboarding="home-logo"]',
    title: 'Home Button',
    body: "Tap \"I KNOW BALL\" in the top left to return to your home page from anywhere in the app.",
    position: 'bottom',
  },
  {
    page: '/picks',
    targetSelector: '[data-onboarding="game-card"]',
    title: 'Make Your Picks',
    body: "There are three ways to make picks. Straight picks — tap a team to pick the winner. Parlays — combine multiple picks for a bigger payout (miss one and you lose it all). Player props — pick on individual performances like points, rebounds, or strikeouts. You can pick across any sport — NBA, MLB, NFL, NHL, and more.",
    position: 'top',
    freeScroll: true,
  },
  {
    page: '/picks',
    targetSelector: '[data-onboarding="props-tab"]',
    title: 'Set Your Own Line',
    body: "Open Props and you don't just take the number the book is offering — you move it. Slide the line to where you think the player lands, pick over or under, and the payout scales with how far you went: the bolder the call, the bigger the return. You can stack several predictions on the same player at different lines, and the results page shows them as a ladder so you can see exactly where the night actually finished.",
    position: 'bottom',
  },
  {
    page: '/',
    targetSelector: '[data-onboarding="open-leagues"]',
    title: 'Join an Open League',
    body: "Scroll horizontally to browse leagues you can jump into right now. Tap any card for details — format, members already in, and how the global bonus scales with league size — then hit Join. Your own leagues live in the row above. You can also browse the full list anytime from the Leagues page.",
    position: 'bottom',
    freeScroll: true,
  },
  {
    page: '/',
    targetSelector: '[data-onboarding="scoreboard"]',
    title: 'The Scoreboard',
    body: "Live scores, upcoming games, and finals across every sport we cover — right from the home page. Tap a sport header to drill in for standings, stat leaders, and the full slate. Tap any matchup for records, injuries, starting lineups and team leaders before kickoff, or the full box score once it's underway.",
    position: 'top',
    freeScroll: true,
  },
  {
    page: '/leagues/create',
    targetSelector: null,
    title: 'Create Leagues',
    body: "Commissioners love this app. Create Fantasy Football, Daily Fantasy (NFL, NBA, WNBA & MLB), Survivor Pools, Brackets, Pick'em, Squares, and more. Customize everything — scoring, duration, visibility — and invite your friends.",
    position: 'center',
    freeScroll: true,
  },
  {
    page: '/leaderboard',
    targetSelector: null,
    title: 'Climb the Leaderboard',
    body: 'Earn points from your picks and league finishes to climb tiers — from Rookie all the way to GOAT. There\u2019s an overall leaderboard and a leaderboard for every sport, so you can see who really knows ball.',
    position: 'center',
    freeScroll: true,
  },
  {
    page: '/hub?tab=all',
    targetSelector: null,
    title: 'Your Hub',
    body: "IKB is complete with a sportscentric social hub. View your profile, browse the activity feed, and create posts, predictions, and polls. \"All of IKB\" shows what everyone across the platform is up to. The Hub has four rooms \u2014 Feed, Arcade, News and the Hall of Fame \u2014 and News carries a live ESPN wire so you can stay on top of what\u2019s happening in sports.",
    position: 'center',
    freeScroll: true,
  },
  {
    page: '/hub',
    targetSelector: null,
    title: 'Your Squad',
    body: "Your squad is your circle on IKB — the people you connect with. Send connection requests from anyone\u2019s profile, and once they accept, you\u2019re in each other\u2019s squad. Your squad sees your picks, posts, and streaks in their feed, and you\u2019ll see theirs. You can also join leagues together and auto-connect with leaguemates at the end of a season.",
    position: 'center',
    freeScroll: true,
  },
  // Deliberately stays on the FEED view rather than deep-linking
  // ?tab=arcade: the arcade room replaces this part of the Hub, marks and
  // all, so opening it would spotlight an element that no longer exists and
  // time out to a fullscreen card. Pointing at the door is also the more
  // useful lesson — where the arcade lives is the thing a new player
  // doesn't know.
  {
    page: '/hub',
    targetSelector: '[data-onboarding="arcade"]',
    title: 'The Arcade',
    body: "Sports games you can play right now. Memory, played on IKB's own image library, and Trivia — pick a sport or take all of them, in 10 or 20 question rounds or Streak mode, where you keep answering until you miss one. Every game keeps high scores and a leaderboard for each sport, so the board is the thing to chase.",
    position: 'bottom',
  },
  // Points at the Hub's fourth mark rather than opening the page, for the
  // same reason the Arcade step does: where it lives is the thing a new
  // player doesn't know, and the page has its own hero to discover.
  // It used to navigate to /hall-of-fame and sit before the Hub steps, back
  // when the only way in was the account menu.
  {
    page: '/hub',
    targetSelector: '[data-onboarding="hall-of-fame"]',
    title: 'Hall of Fame & Record Book',
    body: "The fourth room. IKB Royalty shows the current leaders in every category, alongside the all-time record book \u2014 longest win streaks, biggest underdog hits, the lot. Chase a record and your name goes up there.",
    position: 'bottom',
  },
  {
    page: null,
    targetSelector: '[data-onboarding="hamburger-menu"]',
    title: 'The Menu',
    body: 'This is where you\u2019ll find the FAQ, Share IKB with friends, and your profile settings \u2014 where you can update your username, avatar, backdrop, notification preferences, and more.',
    position: 'bottom',
  },
  {
    page: null,
    targetSelector: null,
    title: "You're All Set",
    body: "Make picks across every sport, compete in fantasy football leagues, survivor pools, daily fantasy, squares, brackets, and so much more. Good luck — show 'em you know ball.",
    position: 'center',
    buttonText: "Let's Go",
  },
]

export default ONBOARDING_STEPS

const ONBOARDING_STEPS = [
  {
    page: null,
    targetSelector: null,
    title: 'Welcome to I KNOW BALL',
    body: "The fantasy sports platform where you make picks, compete in leagues, and climb the leaderboard across every major sport. Keep in mind — you can replay this tutorial anytime from the FAQ page.",
    position: 'center',
    buttonText: "Let's Go",
  },
  // Navigates home rather than spotlighting the logo wherever the player
  // happens to be standing. The step is about what home IS as much as how to
  // get back to it, and the tutorial can start from any route — so without
  // this, the one step naming the home page could be read on top of Picks.
  {
    page: '/',
    targetSelector: '[data-onboarding="home-logo"]',
    title: 'Home Button',
    body: "This is your home page \u2014 your leagues, open leagues to join, and the live scoreboard. Tap \"I KNOW BALL\" in the top left to get back here from anywhere in the app.",
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
  // Opens the Props tab, not just a spotlight on it. The step before is
  // /picks, so this is the same pathname with a new query param — the branch
  // in OnboardingTutorial that re-navigates on changed params is what makes
  // it switch. The player lands on the sport row rather than a prop card,
  // which is fine: the point is that Props is a place you go, and the copy
  // explains what is waiting there.
  {
    page: '/picks?tab=props',
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
  // Opens the arcade itself (`?tab=arcade`, the param HubPage already reads
  // for notification deep-links) rather than spotlighting the mark on the
  // Hub. Pointing at the door taught where it was; walking through it shows
  // the games, which is the thing worth seeing. Fullscreen — there is no
  // single element in the room to spotlight, and dimming the whole arcade
  // behind the card still puts it on screen.
  {
    page: '/hub?tab=arcade',
    targetSelector: null,
    position: 'center',
    title: 'The Arcade',
    // Describes trivia as streak-only, which it has been since the 10 and 20
    // question rounds were removed, and Memory as player photos, which it has
    // been since the venue images came out of the deck. Both read as stale
    // the moment someone opens the arcade and finds neither on offer.
    body: "Sports games you can play right now. Memory, dealt from IKB's own player photos, and Trivia — pick a sport or take all of them, then keep answering until you miss one. Every game keeps high scores and a leaderboard for each sport, so the board is the thing to chase.",
  },
  // Opens the Hall of Fame itself. It briefly pointed at the Hub's fourth
  // mark instead, on the reasoning that where it lives is what a new player
  // doesn't know — but Royalty and the record book are the draw, and a mark
  // with a label cannot show them. Fullscreen for the same reason as the
  // arcade: the page is one long board, not a single element to spotlight.
  {
    page: '/hall-of-fame',
    targetSelector: null,
    position: 'center',
    title: 'Hall of Fame & Record Book',
    body: "IKB Royalty shows the current leaders in every category, alongside the all-time record book \u2014 longest win streaks, biggest underdog hits, the lot. Chase a record and your name goes up there.",
  },
  // Opens Settings rather than spotlighting the hamburger. The menu is a
  // list of links a player will find on their own; what they will not do
  // unprompted is set an avatar and a backdrop — and of the 88 accounts that
  // signed up and went quiet, NOT ONE had set either. A tutorial that ends
  // having shown someone their own blank profile is a better prompt than one
  // that points at a button.
  {
    page: '/settings',
    targetSelector: null,
    position: 'center',
    title: 'Customize Your Profile',
    body: 'Establish your identity on IKB. Upload a profile picture, and choose a backdrop from the library or upload your own. The menu up top is also where the FAQ, Share IKB, notification preferences and the rest of your settings live.',
    freeScroll: true,
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

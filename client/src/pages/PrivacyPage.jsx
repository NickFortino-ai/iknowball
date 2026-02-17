export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl text-text-primary mb-1">Privacy Policy</h1>
      <p className="text-sm text-text-muted mb-6">Last Updated: February 17, 2026</p>

      <div className="space-y-6">
        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Overview</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            I KNOW BALL ("the App") is a sports prediction competition platform. This privacy policy explains what information we collect, how we use it, and your rights regarding your data.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Information We Collect</h2>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Account Information</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                When you create an account, we collect your email address, username, and password. Passwords are securely hashed and never stored in plain text.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Prediction Data</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                We collect and store the picks you make, including which teams or players you selected, the odds at the time of your pick, and the outcome. This data is used to calculate your points, status tier, and leaderboard ranking.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Payment Information</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                If you purchase access to the App, payment is processed through Stripe. We do not store your credit card number or payment details — Stripe handles all payment information securely. We only receive confirmation that your payment was successful.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Usage Data</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                We may collect basic usage information such as pages visited, features used, and general app interaction patterns to improve the App experience.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">How We Use Your Information</h2>
          <ul className="space-y-1.5 text-sm text-text-secondary leading-relaxed list-disc list-inside">
            <li>To create and maintain your account</li>
            <li>To track your predictions, calculate points, and update your status tier</li>
            <li>To display your username, tier, and stats on leaderboards and within leagues</li>
            <li>To send you notifications about pick results, league invites, and connection requests</li>
            <li>To process payments through Stripe</li>
            <li>To improve the App's features and performance</li>
          </ul>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Information Shared With Others</h2>
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Public by Design</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Your username, status tier, leaderboard ranking, and pick record are visible to other users. This is core to the App's competitive nature.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">League Members</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                When you join a league, other league members can see your picks, points, and standings within that league.
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-primary mb-1">Connections</h3>
              <p className="text-sm text-text-secondary leading-relaxed">
                Users you are connected with can see your recent activity and notable picks in their activity feed.
              </p>
            </div>
            <div>
              <p className="text-sm text-text-secondary leading-relaxed font-medium">
                We do not sell your personal information to third parties, share your email address with other users, or use your data for third-party advertising.
              </p>
            </div>
          </div>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Third-Party Services</h2>
          <ul className="space-y-1.5 text-sm text-text-secondary leading-relaxed list-disc list-inside">
            <li>Supabase — Database hosting and authentication</li>
            <li>Stripe — Payment processing</li>
            <li>The Odds API — Sports odds data (no user data is shared with this service)</li>
            <li>Vercel — Frontend hosting</li>
            <li>Render — Backend hosting</li>
          </ul>
          <p className="text-sm text-text-secondary leading-relaxed mt-3">
            These services have their own privacy policies governing their handling of data.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Data Retention</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            Your account data and prediction history are retained for as long as your account is active. If you wish to delete your account and associated data, contact us at the email below.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Children's Privacy</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            The App is not intended for children under the age of 13. We do not knowingly collect personal information from children under 13.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Not Gambling</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            I KNOW BALL is a points-based prediction tracking platform for entertainment purposes only. No real money is wagered, collected, or distributed based on prediction outcomes. The App does not facilitate gambling.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Changes to This Policy</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            We may update this privacy policy from time to time. Any changes will be reflected by updating the "Last Updated" date at the top of this page.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-2">Contact</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            If you have questions about this privacy policy or your data, contact us at:{' '}
            <a href="mailto:admin@iknowball.club" className="text-accent hover:underline">
              admin@iknowball.club
            </a>
          </p>
        </section>
      </div>
    </div>
  )
}

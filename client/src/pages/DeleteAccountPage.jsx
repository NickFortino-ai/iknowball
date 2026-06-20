export default function DeleteAccountPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-2xl text-text-primary mb-1">Delete Your Account</h1>
      <p className="text-sm text-text-muted mb-6">Last Updated: June 20, 2026</p>

      <div className="space-y-6">
        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Delete from inside the app</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            The fastest way to delete your I KNOW BALL account is from inside the app:
          </p>
          <ol className="space-y-2 text-sm text-text-secondary leading-relaxed list-decimal list-inside">
            <li>Open I KNOW BALL on your phone or visit <a href="https://www.iknowball.club" className="text-accent hover:underline">iknowball.club</a> in your browser.</li>
            <li>Sign in to your account.</li>
            <li>Open the menu (hamburger icon, top right) and tap <strong>Settings</strong>.</li>
            <li>Scroll to the bottom and tap <strong>Delete Account</strong>.</li>
            <li>Confirm the deletion when prompted.</li>
          </ol>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Delete by email request</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            If you no longer have access to your account, you can request deletion by email:
          </p>
          <ul className="space-y-2 text-sm text-text-secondary leading-relaxed list-disc list-inside">
            <li>Send an email to <a href="mailto:admin@iknowball.club?subject=Account%20Deletion%20Request" className="text-accent hover:underline">admin@iknowball.club</a></li>
            <li>Use the subject line: <strong>Account Deletion Request</strong></li>
            <li>Send the email from the address registered to your I KNOW BALL account (or include your username in the email body) so we can verify your identity</li>
          </ul>
          <p className="text-sm text-text-secondary leading-relaxed mt-3">
            We will process your request within 7 business days and confirm by email once your account has been deleted.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">What gets deleted</h2>
          <p className="text-sm text-text-secondary leading-relaxed mb-3">
            When your account is deleted, we permanently remove:
          </p>
          <ul className="space-y-1.5 text-sm text-text-secondary leading-relaxed list-disc list-inside">
            <li>Your account profile (username, email, display name, bio, avatar)</li>
            <li>Your authentication credentials</li>
            <li>Your direct messages and chat history</li>
            <li>Your profile reactions, comments, and connections</li>
            <li>Your device tokens used for push notifications</li>
            <li>Your subscription state</li>
          </ul>
          <p className="text-sm text-text-secondary leading-relaxed mt-3">
            Picks, league memberships, and aggregate scoring history may be retained in an anonymized form for league integrity and historical leaderboards. This anonymized data cannot be linked back to you.
          </p>
        </section>

        <section className="bg-bg-card rounded-xl p-5">
          <h2 className="font-display text-lg text-text-primary mb-3">Questions</h2>
          <p className="text-sm text-text-secondary leading-relaxed">
            For any questions about account deletion or your data, contact us at{' '}
            <a href="mailto:admin@iknowball.club" className="text-accent hover:underline">admin@iknowball.club</a>{' '}
            or review our{' '}
            <a href="/privacy" className="text-accent hover:underline">Privacy Policy</a>.
          </p>
        </section>
      </div>
    </div>
  )
}

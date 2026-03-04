export default function GuidelinesPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="font-display text-3xl mb-2">Community Guidelines</h1>
      <p className="text-text-secondary mb-8">Keep it competitive, keep it fun, keep it clean. These are the rules.</p>

      <div className="space-y-6">
        <section>
          <h2 className="font-display text-xl text-correct mb-3">What's encouraged</h2>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2"><span className="text-correct shrink-0">+</span>Hot takes, trash talk, and bold predictions</li>
            <li className="flex gap-2"><span className="text-correct shrink-0">+</span>Celebrating wins and clowning losses (it's part of the game)</li>
            <li className="flex gap-2"><span className="text-correct shrink-0">+</span>Friendly competition and banter with your squad</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-incorrect mb-3">What's NOT allowed</h2>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Hate speech, slurs, or discrimination of any kind</li>
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Harassment, threats, or personal attacks beyond sports banter</li>
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Explicit, sexual, or violent content</li>
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Spam, scams, or promotional content</li>
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Impersonation of other users</li>
            <li className="flex gap-2"><span className="text-incorrect shrink-0">&times;</span>Sharing personal/private information about others</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-xl text-accent mb-3">What happens if you break the rules</h2>
          <ul className="space-y-2 text-sm text-text-secondary">
            <li className="flex gap-2"><span className="text-accent shrink-0">1.</span>Reported content is reviewed by our team</li>
            <li className="flex gap-2"><span className="text-accent shrink-0">2.</span>Content that violates guidelines will be removed</li>
            <li className="flex gap-2"><span className="text-accent shrink-0">3.</span>Repeated violations may result in account suspension or permanent ban</li>
          </ul>
        </section>

        <div className="bg-bg-card border border-border rounded-xl p-4 text-sm text-text-secondary">
          <p className="font-semibold text-text-primary mb-1">See something? Report it.</p>
          <p>Every post, comment, and profile has a report option. Use it.</p>
        </div>

        <p className="text-xs text-text-muted text-center">
          Questions? Contact{' '}
          <a href="mailto:admin@iknowball.club" className="text-accent hover:underline">admin@iknowball.club</a>
        </p>
      </div>
    </div>
  )
}

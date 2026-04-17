import { Link } from 'react-router-dom'

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-6">Terms of Service</h1>
      <p className="text-xs text-text-muted mb-6">Last Updated: March 23, 2026</p>

      <div className="space-y-6 text-sm text-text-primary leading-relaxed">
        <section>
          <h2 className="font-display text-lg text-accent mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using I KNOW BALL ("the App"), you agree to be bound by these Terms of Service. If you do not agree to these terms, do not use the App.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">2. Description of Service</h2>
          <p>I KNOW BALL is a sports prediction and social platform. The App is not a gambling service. No real money is wagered, won, or lost. Points earned within the App have no monetary value.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">3. User Accounts</h2>
          <p>You must be at least 13 years old to use the App. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">4. User Content</h2>
          <p>You retain ownership of content you post to the App, including text, images, and videos. By posting content, you grant I KNOW BALL a non-exclusive, royalty-free license to display and distribute your content within the App.</p>
          <p className="mt-2">You are solely responsible for the content you upload. You agree not to post content that:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-text-secondary">
            <li>Infringes on any third party's intellectual property rights</li>
            <li>Contains full-length copyrighted broadcasts or recordings</li>
            <li>Is abusive, harassing, threatening, or otherwise objectionable</li>
            <li>Violates any applicable law or regulation</li>
          </ul>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">5. Video Content Guidelines</h2>
          <p>Video uploads are limited to 200MB. Short highlight clips shared for commentary, criticism, or discussion purposes are permitted. Full-length game recordings, broadcasts, or extended copyrighted content are prohibited and will be removed.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">6. DMCA / Copyright Takedown Policy</h2>
          <p>I KNOW BALL respects the intellectual property rights of others and complies with the Digital Millennium Copyright Act (DMCA).</p>
          <p className="mt-2">If you believe that content on the App infringes your copyright, please submit a takedown request to:</p>
          <p className="mt-2 font-semibold text-accent">admin@iknowball.club</p>
          <p className="mt-2">Your notice must include:</p>
          <ul className="list-disc list-inside mt-2 space-y-1 text-text-secondary">
            <li>A description of the copyrighted work you claim has been infringed</li>
            <li>A description of where the infringing content is located on the App</li>
            <li>Your contact information (name, address, email, phone number)</li>
            <li>A statement that you have a good faith belief that the use is not authorized</li>
            <li>A statement, under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act on their behalf</li>
            <li>Your physical or electronic signature</li>
          </ul>
          <p className="mt-2">We will respond to valid takedown requests promptly and remove infringing content. Repeat infringers may have their accounts terminated.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">7. Content Moderation</h2>
          <p>I KNOW BALL reserves the right to remove any content and suspend or terminate any account at our discretion, with or without notice, for any reason including violation of these Terms.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">8. Disclaimer</h2>
          <p>The App is provided "as is" without warranties of any kind. I KNOW BALL does not guarantee the accuracy of sports data, scores, or odds displayed within the App.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">9. Limitation of Liability</h2>
          <p>I KNOW BALL shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">10. Changes to Terms</h2>
          <p>We may update these Terms at any time. Continued use of the App after changes constitutes acceptance of the updated Terms.</p>
        </section>

        <section>
          <h2 className="font-display text-lg text-accent mb-2">11. Contact</h2>
          <p>For questions about these Terms, contact us at <span className="text-accent">admin@iknowball.club</span></p>
        </section>

        <div className="pt-4 border-t border-border">
          <Link to="/privacy" className="text-accent hover:text-accent-hover text-sm">Privacy Policy</Link>
        </div>
      </div>
    </div>
  )
}

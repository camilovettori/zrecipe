import type { Metadata } from 'next'
import LegalPageShell, {
  legalHeading2,
  legalHeading3,
  legalParagraph,
  legalList,
  legalLink,
} from '@/components/legal/LegalPageShell'

export const metadata: Metadata = {
  title: 'Privacy Policy — ZRecipe',
  description: 'How ZRecipe collects, uses, and protects your data.',
}

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell title="Privacy Policy" lastUpdated="23 July 2026">
      <h2 className={legalHeading2}>1. Introduction</h2>
      <p className={legalParagraph}>
        This Privacy Policy describes how {'Ziffera'} (&ldquo;ZRecipe&rdquo;,
        &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;) collects, uses, discloses, and
        protects the personal data of visitors and users of our recipe costing platform
        available at zrecipe.ie.
      </p>
      <p className={legalParagraph}>
        We are the data controller for the personal data collected through the ZRecipe
        service. If you have any questions about this policy or your data, contact us at{' '}
        {'hello@zrecipe.ie'}.
      </p>

      <h2 className={legalHeading2}>2. What data we collect</h2>

      <h3 className={legalHeading3}>Account data</h3>
      <p className={legalParagraph}>
        Email address, name, business name, business type, hashed password. Collected when
        you create an account.
      </p>

      <h3 className={legalHeading3}>Business operational data</h3>
      <p className={legalParagraph}>
        Recipes, ingredients, invoices you upload, supplier information, cost calculations.
        This data belongs to your business — we process it on your behalf to provide the
        service.
      </p>

      <h3 className={legalHeading3}>Payment data</h3>
      <p className={legalParagraph}>
        Payment card details are collected and processed by our payment processor, Stripe.
        We do not store card details on our servers. We store only the Stripe customer ID
        and subscription status.
      </p>

      <h3 className={legalHeading3}>Technical data</h3>
      <p className={legalParagraph}>
        IP address, browser type, device information, pages visited, timestamps. Collected
        automatically via server logs and used for security and service improvement.
      </p>

      <h3 className={legalHeading3}>AI-processed content</h3>
      <p className={legalParagraph}>
        When you upload an invoice or recipe for AI extraction, the file is sent to our AI
        processing partner Anthropic (Claude) for the sole purpose of extracting structured
        data. Files are not retained by Anthropic beyond the processing window and are not
        used to train their models per our commercial agreement.
      </p>

      <h2 className={legalHeading2}>3. Legal basis for processing (GDPR Article 6)</h2>
      <ul className={legalList}>
        <li>Contract: to provide the service you signed up for</li>
        <li>Legitimate interest: security, fraud prevention, service improvement</li>
        <li>Consent: for optional communications (marketing emails, if any)</li>
        <li>Legal obligation: tax records, invoicing law compliance</li>
      </ul>

      <h2 className={legalHeading2}>4. How we use your data</h2>
      <ul className={legalList}>
        <li>Provide and improve the ZRecipe service</li>
        <li>Process payments and manage subscriptions</li>
        <li>Send transactional emails (account confirmations, ticket updates, invoices)</li>
        <li>Respond to support requests</li>
        <li>Detect and prevent fraud or abuse</li>
        <li>Comply with legal obligations</li>
      </ul>
      <p className={legalParagraph}>
        We do not sell your data. We do not use your business data for advertising or share
        it with third parties for commercial purposes.
      </p>

      <h2 className={legalHeading2}>5. Who we share data with (Sub-processors)</h2>
      <ul className={legalList}>
        <li>Supabase (database + auth hosting) — EU region</li>
        <li>Vercel (application hosting)</li>
        <li>Stripe (payments)</li>
        <li>Resend (transactional email)</li>
        <li>Anthropic (AI processing)</li>
        <li>Zoho Mail (email inbox for support)</li>
      </ul>
      <p className={legalParagraph}>
        Each of these providers has signed a Data Processing Agreement with us and is
        contractually bound to protect your data. We do not share your data with any other
        third parties except when required by law.
      </p>

      <h2 className={legalHeading2}>6. Where we store data</h2>
      <p className={legalParagraph}>
        Your data is stored in the European Union (Ireland region) on Supabase
        infrastructure. We do not transfer personal data outside the EU/EEA except to
        sub-processors listed above who provide equivalent safeguards under the EU-US Data
        Privacy Framework or Standard Contractual Clauses.
      </p>

      <h2 className={legalHeading2}>7. How long we keep data</h2>
      <ul className={legalList}>
        <li>
          Account data: for as long as your account is active, plus 30 days after
          cancellation (for account recovery), then deleted
        </li>
        <li>
          Business data (recipes, invoices): same retention as account data. You can export
          or delete this anytime from within your account.
        </li>
        <li>Support tickets: retained for 2 years for record-keeping</li>
        <li>Server logs: 90 days</li>
        <li>Payment records: 7 years (Irish tax law requirement)</li>
      </ul>

      <h2 className={legalHeading2}>8. Your rights under GDPR</h2>
      <ul className={legalList}>
        <li>Right of access: request a copy of your data</li>
        <li>Right to rectification: correct inaccurate data</li>
        <li>Right to erasure (&ldquo;right to be forgotten&rdquo;): delete your data</li>
        <li>Right to restrict processing</li>
        <li>Right to data portability: export your data in a machine-readable format</li>
        <li>Right to object to processing</li>
        <li>Right to withdraw consent</li>
        <li>
          Right to lodge a complaint with the Irish Data Protection Commission
          (dataprotection.ie)
        </li>
      </ul>
      <p className={legalParagraph}>
        To exercise any of these rights, contact us at {'hello@zrecipe.ie'}. We will
        respond within 30 days.
      </p>

      <h2 className={legalHeading2}>9. Cookies</h2>
      <p className={legalParagraph}>
        ZRecipe uses only strictly necessary cookies to keep you logged in and provide core
        functionality. We do not use tracking, advertising, or analytics cookies without
        your explicit consent.
      </p>
      {/* If a cookie banner or analytics is added later, this section needs updating. */}

      <h2 className={legalHeading2}>10. Data security</h2>
      <p className={legalParagraph}>
        We use industry-standard technical measures to protect your data: TLS encryption in
        transit, encryption at rest, row-level security policies isolating each
        business&rsquo;s data, hashed passwords, and regular backups. Access to production
        data is restricted to authorised personnel only.
      </p>

      <h2 className={legalHeading2}>11. Changes to this policy</h2>
      <p className={legalParagraph}>
        We may update this policy from time to time. Material changes will be notified via
        email or in-app notice at least 30 days before taking effect. The &ldquo;Last
        updated&rdquo; date at the top reflects the most recent change.
      </p>

      <h2 className={legalHeading2}>12. Contact</h2>
      <p className={legalParagraph}>
        For privacy questions, data requests, or complaints:
      </p>
      <p className={legalParagraph}>
        {'Ziffera (CRO No. 784151)'}
        <br />
        {'Kilmartin Grove, Dublin 15, D15R2NF, Ireland'}
        <br />
        Email: {'hello@zrecipe.ie'}
        <br />
        Data Protection Commission (Ireland):{' '}
        <a href="https://www.dataprotection.ie" className={legalLink} target="_blank" rel="noreferrer">
          dataprotection.ie
        </a>
      </p>
    </LegalPageShell>
  )
}

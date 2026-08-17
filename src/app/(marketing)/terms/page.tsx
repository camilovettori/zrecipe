import type { Metadata } from 'next'
import { AlertTriangle } from 'lucide-react'
import LegalPageShell, {
  legalHeading2,
  legalParagraph,
  legalList,
  legalLink,
} from '@/components/legal/LegalPageShell'
import { SITE_URL } from '@/lib/site-url'

export const metadata: Metadata = {
  title: { absolute: 'Terms of Service | ZRecipe' },
  description: 'Read the terms governing ZRecipe accounts, subscriptions, AI features, food costing tools, and acceptable use.',
  alternates: { canonical: `${SITE_URL}/terms` },
}

export default function TermsOfServicePage() {
  return (
    <LegalPageShell title="Terms of Service" lastUpdated="23 July 2026">
      <h2 className={legalHeading2}>1. Introduction</h2>
      <p className={legalParagraph}>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of ZRecipe, a recipe
        costing and food business management platform operated by {'Ziffera'}. By
        creating an account or using ZRecipe, you agree to these Terms. If you do not agree,
        do not use the service.
      </p>

      <h2 className={legalHeading2}>2. The service</h2>
      <p className={legalParagraph}>
        ZRecipe provides tools for recipe costing, ingredient tracking, invoice management,
        allergen compliance, and related food business operations. The service is provided
        on a subscription basis, with a limited free tier and paid Pro tier as described on
        our pricing page.
      </p>

      <h2 className={legalHeading2}>3. Your account</h2>
      <ul className={legalList}>
        <li>You must be at least 18 and legally capable of entering into a contract</li>
        <li>You must provide accurate account information</li>
        <li>You are responsible for keeping your password secure</li>
        <li>You are responsible for all activity under your account</li>
        <li>You must notify us of any unauthorised access</li>
      </ul>

      <h2 className={legalHeading2}>4. Subscription and billing</h2>
      <ul className={legalList}>
        <li>
          Free tier: no charge, limited to feature caps described on the pricing page
        </li>
        <li>Pro tier: €25/month (or as displayed at checkout), billed monthly by Stripe</li>
        <li>
          14-day free trial: no credit card required to start; you may cancel anytime
          before the trial ends without charge
        </li>
        <li>Automatic renewal: paid subscriptions renew automatically until cancelled</li>
        <li>
          Cancellation: you may cancel anytime from the Billing settings. Access continues
          until the end of the current billing period. No refunds for partial months.
        </li>
        <li>Price changes: 30 days&rsquo; notice via email before any price change takes effect</li>
      </ul>

      <h2 className={legalHeading2}>5. Acceptable use</h2>
      <p className={legalParagraph}>You may not:</p>
      <ul className={legalList}>
        <li>Use the service for any illegal purpose</li>
        <li>Attempt to reverse engineer, decompile, or bypass technical protections</li>
        <li>Scrape data or run automated queries beyond normal use</li>
        <li>Upload malicious files or attempt to compromise the service</li>
        <li>Impersonate another person or business</li>
        <li>Resell or redistribute the service without written authorisation</li>
        <li>Use the service to violate the rights of any third party</li>
      </ul>
      <p className={legalParagraph}>
        We may suspend or terminate accounts that violate these rules.
      </p>

      <h2 className={legalHeading2}>6. Your content</h2>
      <p className={legalParagraph}>
        You retain ownership of all data you upload to ZRecipe (recipes, ingredients,
        invoices, business information). By using the service, you grant us a limited
        licence to store, process, and display this data solely to provide the service to
        you.
      </p>
      <p className={legalParagraph}>
        You are responsible for the accuracy of your data. ZRecipe provides tools to help
        you calculate costs and manage allergens, but final responsibility for pricing,
        allergen compliance, and business decisions rests with you.
      </p>

      <h2 className={legalHeading2}>7. AI features</h2>
      <p className={legalParagraph}>
        ZRecipe uses AI to extract data from uploaded invoices and recipes. AI extraction is
        a convenience tool and may make mistakes. You must review AI-extracted data before
        relying on it for business decisions. We are not liable for errors in AI-extracted
        data.
      </p>

      <h2 className={legalHeading2}>8. Allergen compliance disclaimer</h2>
      <div className="mt-3 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-[15px] leading-relaxed text-amber-900">
          ZRecipe provides tools to help you track and label ingredient allergens in
          accordance with EU Regulation 1169/2011. However, the accuracy of allergen
          information depends on the data you enter. ZRecipe is not a substitute for
          professional food safety guidance and does not guarantee compliance with any
          specific regulation. You are solely responsible for the accuracy of allergen
          information on your products and for complying with all applicable food safety
          laws.
        </p>
      </div>

      <h2 className={legalHeading2}>9. Service availability</h2>
      <p className={legalParagraph}>
        We aim for high availability but do not guarantee uninterrupted service. Scheduled
        maintenance will be announced in advance where practical. We are not liable for
        downtime caused by third-party service providers (hosting, payments, email).
      </p>

      <h2 className={legalHeading2}>10. Intellectual property</h2>
      <p className={legalParagraph}>
        ZRecipe, including the software, branding, design, and documentation, is owned by
        {' '}{'Ziffera'}. You are granted a limited, non-exclusive,
        non-transferable licence to use the service under these Terms.
      </p>

      <h2 className={legalHeading2}>11. Limitation of liability</h2>
      <p className={legalParagraph}>
        To the maximum extent permitted by law, {'Ziffera'}&rsquo;s total
        liability arising from your use of ZRecipe is limited to the amount you have paid
        for the service in the 12 months preceding the claim. We are not liable for
        indirect, incidental, or consequential damages including lost profits or business
        interruption.
      </p>
      <p className={legalParagraph}>
        Ziffera is a business name registered in Ireland under the Registration of Business
        Names Act 1963 (CRO No. 784151) and is operated by an individual sole trader.
        Nothing in these Terms affects any statutory rights you may have as a consumer
        under Irish or EU law.
      </p>

      <h2 className={legalHeading2}>12. Termination</h2>
      <p className={legalParagraph}>
        Either party may terminate your account at any time. Upon termination, your data
        will be retained for 30 days for account recovery, then deleted. You may export
        your data before termination via the Billing settings.
      </p>

      <h2 className={legalHeading2}>13. Governing law</h2>
      <p className={legalParagraph}>
        These Terms are governed by the laws of Ireland. Any disputes will be resolved in
        the courts of Ireland.
      </p>

      <h2 className={legalHeading2}>14. Changes to Terms</h2>
      <p className={legalParagraph}>
        We may update these Terms. Material changes will be notified at least 30 days in
        advance. Continued use after changes constitutes acceptance.
      </p>

      <h2 className={legalHeading2}>15. Contact</h2>
      <p className={legalParagraph}>
        For questions about these Terms:
      </p>
      <p className={legalParagraph}>
        {'Ziffera'}
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

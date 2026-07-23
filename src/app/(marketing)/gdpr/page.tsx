import type { Metadata } from 'next'
import Link from 'next/link'
import LegalPageShell, {
  legalHeading2,
  legalParagraph,
  legalList,
  legalLink,
} from '@/components/legal/LegalPageShell'

export const metadata: Metadata = {
  title: 'GDPR Compliance — ZRecipe',
  description: 'How ZRecipe complies with GDPR and how to exercise your rights.',
}

const DATA_TABLE = [
  {
    category: 'Account data',
    purpose: 'Create and manage your account',
    basis: 'Contract',
    retention: 'Active account + 30 days',
  },
  {
    category: 'Business data (recipes, ingredients, invoices)',
    purpose: 'Provide the ZRecipe service',
    basis: 'Contract',
    retention: 'Active account + 30 days',
  },
  {
    category: 'Payment metadata',
    purpose: 'Process payments, manage subscriptions',
    basis: 'Contract / legal obligation',
    retention: '7 years',
  },
  {
    category: 'Support tickets',
    purpose: 'Respond to support requests',
    basis: 'Contract / legitimate interest',
    retention: '2 years',
  },
  {
    category: 'Server logs',
    purpose: 'Security, fraud prevention',
    basis: 'Legitimate interest',
    retention: '90 days',
  },
  {
    category: 'AI-processed uploads',
    purpose: 'Extract structured data from invoices/recipes',
    basis: 'Contract',
    retention: 'Not retained by AI provider beyond processing',
  },
]

export default function GdprPage() {
  return (
    <LegalPageShell title="GDPR Compliance" lastUpdated="23 July 2026">
      <h2 className={legalHeading2}>1. GDPR at a glance</h2>
      <p className={legalParagraph}>
        The General Data Protection Regulation (GDPR) is EU law protecting the personal
        data of EU residents. ZRecipe is fully committed to GDPR compliance. This page
        summarises our obligations and your rights. For the full detail, see our{' '}
        <Link href="/privacy" className={legalLink}>Privacy Policy</Link>.
      </p>

      <h2 className={legalHeading2}>2. Who is the data controller?</h2>
      <p className={legalParagraph}>
        {'Ziffera'} is the data controller for personal data collected through
        ZRecipe. Contact: {'hello@zrecipe.ie'}
      </p>

      <h2 className={legalHeading2}>3. Data Protection Officer</h2>
      <p className={legalParagraph}>
        We have not appointed a formal Data Protection Officer as we are not required to
        under Article 37 GDPR. For any data protection matters, contact us at{' '}
        {'hello@zrecipe.ie'}.
      </p>
      {/*
        Note: if the business ever grows past the scale where a DPO is legally
        required (e.g. large-scale systematic monitoring or large-scale
        processing of special-category data), this section needs updating.
      */}

      <h2 className={legalHeading2}>4. What data we process — quick reference</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead>
            <tr className="bg-slate-50">
              <th className="border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-900">Category</th>
              <th className="border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-900">Purpose</th>
              <th className="border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-900">Legal basis</th>
              <th className="border-b border-slate-200 px-4 py-2.5 font-semibold text-slate-900">Retention</th>
            </tr>
          </thead>
          <tbody>
            {DATA_TABLE.map((row) => (
              <tr key={row.category} className="odd:bg-white even:bg-slate-50/60">
                <td className="border-b border-slate-100 px-4 py-2.5 align-top text-slate-700">{row.category}</td>
                <td className="border-b border-slate-100 px-4 py-2.5 align-top text-slate-700">{row.purpose}</td>
                <td className="border-b border-slate-100 px-4 py-2.5 align-top text-slate-700">{row.basis}</td>
                <td className="border-b border-slate-100 px-4 py-2.5 align-top text-slate-700">{row.retention}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={legalHeading2}>5. Your GDPR rights — how to exercise them</h2>
      <ul className={legalList}>
        <li>Access: email {'hello@zrecipe.ie'} with &ldquo;Access request&rdquo; in the subject</li>
        <li>Rectification: edit your data directly in the app, or email us</li>
        <li>
          Erasure: request account deletion via {'hello@zrecipe.ie'} — processed within 30
          days
        </li>
        <li>
          Portability: use the &ldquo;Export data&rdquo; button in Settings → Account
          {/* Note: if this export button doesn't exist yet, it needs to be built before this claim is accurate. */}
        </li>
        <li>Restrict processing: email {'hello@zrecipe.ie'}</li>
        <li>Object: email {'hello@zrecipe.ie'}</li>
        <li>
          Withdraw consent (for marketing): unsubscribe link on any marketing email, or
          email {'hello@zrecipe.ie'}
        </li>
        <li>
          Complain: contact the Irish Data Protection Commission at{' '}
          <a href="https://www.dataprotection.ie" className={legalLink} target="_blank" rel="noreferrer">
            dataprotection.ie
          </a>{' '}
          — you can also complain to your local supervisory authority in your EU country of
          residence
        </li>
      </ul>

      <h2 className={legalHeading2}>6. Data Processing Addendum (DPA) for business customers</h2>
      <p className={legalParagraph}>
        If you are a business customer processing personal data of your own users,
        employees, or contacts through ZRecipe, you may need to sign a Data Processing
        Addendum with us. We provide a standard DPA on request — email{' '}
        {'hello@zrecipe.ie'}.
      </p>

      <h2 className={legalHeading2}>7. Sub-processors</h2>
      <p className={legalParagraph}>
        The following sub-processors act under Article 28 GDPR on our behalf:
      </p>
      <ul className={legalList}>
        <li>Supabase (database + auth hosting) — EU region</li>
        <li>Vercel (application hosting)</li>
        <li>Stripe (payments)</li>
        <li>Resend (transactional email)</li>
        <li>Anthropic (AI processing)</li>
        <li>Zoho Mail (email inbox for support)</li>
      </ul>

      <h2 className={legalHeading2}>8. International transfers</h2>
      <p className={legalParagraph}>
        Your data is stored in the EU. Some sub-processors (Anthropic, Vercel, Stripe) may
        process data outside the EU. Where this happens, transfers are protected by
        Standard Contractual Clauses or the EU-US Data Privacy Framework as applicable.
      </p>

      <h2 className={legalHeading2}>9. Data breach notification</h2>
      <p className={legalParagraph}>
        In the unlikely event of a personal data breach affecting you, we will notify you
        and the Irish Data Protection Commission within 72 hours as required by Article 33
        GDPR, providing details of the breach, its likely impact, and steps taken.
      </p>

      <h2 className={legalHeading2}>10. Contact</h2>
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

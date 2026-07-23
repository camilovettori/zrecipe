import Link from 'next/link'
import Image from 'next/image'
import type { ReactNode } from 'react'
import LandingNav from '@/components/landing/LandingNav'

interface LegalPageShellProps {
  title: string
  lastUpdated: string
  children: ReactNode
}

// Shared prose-style classNames for legal page content. Tailwind Typography
// isn't installed in this project, so headings/paragraphs are styled by hand
// here instead of adding a new dependency for three static pages.
export const legalHeading2 = 'mt-10 text-xl font-semibold text-slate-900 first:mt-0'
export const legalHeading3 = 'mt-6 text-base font-semibold text-slate-900'
export const legalParagraph = 'mt-3 text-[15px] leading-relaxed text-slate-700'
export const legalList = 'mt-3 list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed text-slate-700'
export const legalLink = 'text-emerald-600 hover:underline'

export default function LegalPageShell({ title, lastUpdated, children }: LegalPageShellProps) {
  return (
    <>
      <LandingNav />

      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-slate-500">Last updated: {lastUpdated}</p>

        <div className="mt-8">{children}</div>
      </main>

      {/* ══ FOOTER — duplicated from src/app/page.tsx so this shell doesn't
          depend on (or risk destabilising) the landing page's own footer ══ */}
      <footer className="bg-dark border-t border-white/5 py-12">
        <div className="mx-auto max-w-7xl px-5 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row">
            <div>
              <Image
                src="/images/logo4.png"
                alt="ZRecipe"
                width={140}
                height={47}
                style={{ height: '32px', width: 'auto', objectFit: 'contain' }}
              />
              <p className="mt-3 max-w-xs text-sm text-slate-400">
                Recipe costing and allergen compliance for independent food businesses.
              </p>
            </div>

            <div className="flex gap-12">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Product</p>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                  <li><a href="/#features" className="transition-colors hover:text-white">Features</a></li>
                  <li><a href="/#pricing" className="transition-colors hover:text-white">Pricing</a></li>
                  <li><a href="/#faq" className="transition-colors hover:text-white">FAQ</a></li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Account</p>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                  <li><Link href="/login" className="transition-colors hover:text-white">Log in</Link></li>
                  <li><Link href="/register" className="transition-colors hover:text-white">Start free trial</Link></li>
                </ul>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Legal</p>
                <ul className="mt-3 flex flex-col gap-2 text-sm text-slate-400">
                  <li><Link href="/privacy" className="transition-colors hover:text-white">Privacy Policy</Link></li>
                  <li><Link href="/terms" className="transition-colors hover:text-white">Terms of Service</Link></li>
                  <li><Link href="/gdpr" className="transition-colors hover:text-white">GDPR</Link></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-10 border-t border-white/5 pt-6">
            <p className="text-xs text-slate-500">
              © {new Date().getFullYear()} Ziffera. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </>
  )
}

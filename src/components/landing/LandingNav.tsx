'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import PrimaryCTALink from './PrimaryCTALink'

const LINKS = [
  { href: '#features', label: 'Features' },
  { href: '#about', label: 'About' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#faq', label: 'FAQ' },
]

export default function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/85 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src="/images/fundobranco2.png"
            alt="ZRecipe"
            width={140}
            height={47}
            priority
            style={{ height: '34px', width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 lg:flex">
          <Link
            href="/login"
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
          >
            Log in
          </Link>
          <PrimaryCTALink
            href="/register"
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-primary-700"
          >
            Start Free Trial
          </PrimaryCTALink>
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center justify-center rounded-lg p-2 text-slate-600 lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </nav>

      {open && (
        <div className="border-t border-slate-100 bg-white px-5 py-4 lg:hidden">
          <div className="flex flex-col gap-4">
            {LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-600"
              >
                {l.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-3 border-t border-slate-100 pt-4">
              <Link href="/login" onClick={() => setOpen(false)} className="text-sm font-medium text-slate-600">
                Log in
              </Link>
              <PrimaryCTALink
                href="/register"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-semibold text-white"
              >
                Start Free Trial
              </PrimaryCTALink>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Menu, X } from 'lucide-react'
import PrimaryCTALink from './PrimaryCTALink'
import SupportModal from '@/components/support/SupportModal'

const LINKS = [
  { href: '/#features', label: 'Features' },
  { href: '/#about', label: 'About' },
  { href: '/vat-calculator-ireland', label: 'VAT Calculator' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
]

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-all duration-300 ${
        scrolled
          ? 'border-slate-100 bg-white/80 shadow-sm backdrop-blur-md'
          : 'border-transparent bg-transparent'
      }`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-8">
        <Link href="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <Image
            src="/images/fundobranco2.png"
            alt="ZRecipe logo"
            width={140}
            height={47}
            priority
            style={{ height: '34px', width: 'auto', objectFit: 'contain' }}
          />
        </Link>

        <div className="hidden items-center gap-8 lg:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
            >
              {l.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setSupportOpen(true)}
            className="text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
          >
            Contact
          </button>
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
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-600"
              >
                {l.label}
              </Link>
            ))}
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setSupportOpen(true)
              }}
              className="text-left text-sm font-medium text-slate-600"
            >
              Contact
            </button>
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

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} mode="public" source="contact" />
    </header>
  )
}

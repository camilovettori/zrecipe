'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Apple, ArrowRight, Calculator, ChevronDown, Menu, Scale, X } from 'lucide-react'
import PrimaryCTALink from './PrimaryCTALink'
import SupportModal from '@/components/support/SupportModal'
import { PUBLIC_TOOLS } from '@/lib/public-tools'

const LINKS_BEFORE_TOOLS = [
  { href: '/#features', label: 'Features' },
  { href: '/#about', label: 'About' },
]

const LINKS_AFTER_TOOLS = [
  { href: '/#pricing', label: 'Pricing' },
  { href: '/#faq', label: 'FAQ' },
  { href: '/blog', label: 'Blog' },
]

const TOOL_ICONS = {
  vat: Calculator,
  'yield-calculator': Scale,
  'yield-reference': Apple,
}

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [supportOpen, setSupportOpen] = useState(false)
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false)

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
          {LINKS_BEFORE_TOOLS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
            >
              {l.label}
            </Link>
          ))}
          <div className="group relative">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1.5 py-3 text-sm font-medium text-slate-600 transition-colors hover:text-primary-600"
            >
              Free Tools
              <ChevronDown className="h-4 w-4 transition-transform group-hover:rotate-180 group-focus-within:rotate-180" />
            </Link>
            <div className="invisible absolute left-1/2 top-full w-[390px] -translate-x-1/2 translate-y-2 pt-2 opacity-0 transition-all duration-200 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
              <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_50px_rgba(15,23,42,0.14)]">
                {PUBLIC_TOOLS.map((tool) => {
                  const Icon = TOOL_ICONS[tool.id]
                  return (
                    <Link
                      key={tool.id}
                      href={tool.href}
                      className="flex items-start gap-3 rounded-xl p-3 transition-colors hover:bg-emerald-50"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                        <Icon className="h-5 w-5" />
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-slate-900">{tool.name}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{tool.description}</span>
                      </span>
                    </Link>
                  )
                })}
                <Link
                  href="/tools"
                  className="mt-1 flex items-center justify-between rounded-xl border-t border-slate-100 px-3 py-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                >
                  View all free tools <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
          {LINKS_AFTER_TOOLS.map((l) => (
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
            {LINKS_BEFORE_TOOLS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="text-sm font-medium text-slate-600"
              >
                {l.label}
              </Link>
            ))}
            <div>
              <button
                type="button"
                onClick={() => setMobileToolsOpen((value) => !value)}
                className="flex w-full items-center justify-between text-sm font-medium text-slate-600"
                aria-expanded={mobileToolsOpen}
                aria-controls="mobile-free-tools"
              >
                Free Tools
                <ChevronDown className={`h-4 w-4 transition-transform ${mobileToolsOpen ? 'rotate-180' : ''}`} />
              </button>
              {mobileToolsOpen && (
                <div id="mobile-free-tools" className="mt-3 space-y-1 rounded-2xl bg-slate-50 p-2">
                  {PUBLIC_TOOLS.map((tool) => {
                    const Icon = TOOL_ICONS[tool.id]
                    return (
                      <Link
                        key={tool.id}
                        href={tool.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-slate-800"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          <Icon className="h-4 w-4" />
                        </span>
                        {tool.name}
                      </Link>
                    )
                  })}
                  <Link
                    href="/tools"
                    onClick={() => setOpen(false)}
                    className="flex items-center justify-between px-3 py-2 text-sm font-semibold text-emerald-700"
                  >
                    View all free tools <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              )}
            </div>
            {LINKS_AFTER_TOOLS.map((l) => (
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

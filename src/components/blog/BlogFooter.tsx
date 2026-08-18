import Link from 'next/link'
import Image from 'next/image'

// Duplicated from src/components/legal/LegalPageShell.tsx (which itself notes
// it's duplicated from src/app/page.tsx) rather than shared, so this page
// never risks destabilising the landing page's own footer.
export default function BlogFooter() {
  return (
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
                <li><Link href="/#features" className="transition-colors hover:text-white">Features</Link></li>
                <li><Link href="/#pricing" className="transition-colors hover:text-white">Pricing</Link></li>
                <li><Link href="/blog" className="transition-colors hover:text-white">Blog</Link></li>
                <li><Link href="/tools" className="transition-colors hover:text-white">Free Tools</Link></li>
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
  )
}

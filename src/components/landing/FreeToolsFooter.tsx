import Link from 'next/link'

export default function FreeToolsFooter() {
  return (
    <footer className="border-t border-white/5 bg-dark py-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 text-sm text-slate-400 sm:px-8 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Ziffera. Free food business tools by ZRecipe.</p>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          <Link href="/" className="hover:text-white">ZRecipe</Link>
          <Link href="/tools" className="hover:text-white">Free Tools</Link>
          <Link href="/#pricing" className="hover:text-white">Pricing</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
        </nav>
      </div>
    </footer>
  )
}

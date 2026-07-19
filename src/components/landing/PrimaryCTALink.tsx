'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

// Shared hover/tap micro-interaction for every primary (emerald, filled)
// call-to-action on the landing page — scale + a soft emerald glow.
export default function PrimaryCTALink({
  href,
  className = '',
  children,
  onClick,
}: {
  href: string
  className?: string
  children: ReactNode
  onClick?: () => void
}) {
  return (
    <motion.span
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 17 }}
      className="block"
    >
      <Link
        href={href}
        onClick={onClick}
        className={`transition-shadow duration-300 hover:shadow-[0_0_28px_rgba(5,150,105,0.45)] ${className}`}
      >
        {children}
      </Link>
    </motion.span>
  )
}

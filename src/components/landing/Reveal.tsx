'use client'

import { motion } from 'framer-motion'
import type { ReactNode } from 'react'

// Short, subtle fade+slide-up entrance used to give scroll-triggered polish
// to landing-page sections without feeling sluggish.
export default function Reveal({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-80px' }}
      transition={{ duration: 0.45, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { LifeBuoy, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Ticket {
  id: string
  subject: string
  status: 'open' | 'closed'
  last_message_at: string
  user_unread: boolean
}

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('support_tickets')
        .select('id, subject, status, last_message_at, user_unread')
        .eq('user_id', user.id)
        .order('last_message_at', { ascending: false })
      if (!cancelled) setTickets((data ?? []) as Ticket[])
    }

    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-center gap-2.5">
        <LifeBuoy className="h-5 w-5 text-emerald-600" />
        <h1 className="text-lg font-semibold text-slate-900">Support</h1>
      </div>

      {tickets === null ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : tickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-slate-500">
            No support tickets yet. Use the &ldquo;Support&rdquo; link in the sidebar to reach out.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/support/${t.id}`}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                  {t.user_unread && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={t.user_unread ? 'truncate text-sm font-semibold text-slate-900' : 'truncate text-sm font-medium text-slate-700'}>
                    {t.subject}
                  </p>
                </div>
                {t.status === 'closed' && (
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                    Closed
                  </span>
                )}
                <span className="shrink-0 text-xs text-slate-400">
                  {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

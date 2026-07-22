'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNowStrict } from 'date-fns'
import { LifeBuoy, Loader2, MessageCircle, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import SupportModal from '@/components/support/SupportModal'
import { toast } from '@/components/shared/Toaster'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

interface Ticket {
  id: string
  number: number
  created_at: string
  subject: string
  status: 'open' | 'closed'
  last_message_preview: string | null
  last_message_at: string
  user_unread: boolean
}

type StatusTab = 'all' | 'open' | 'closed'

const TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null)
  const [activeTab, setActiveTab] = useState<StatusTab>('open')
  const [newTicketOpen, setNewTicketOpen] = useState(false)

  const loadTickets = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setTickets([])
      return
    }

    const { data } = await supabase
      .from('support_tickets')
      .select('id, number, created_at, subject, status, last_message_preview, last_message_at, user_unread')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false })

    setTickets((data ?? []) as Ticket[])
  }, [])

  useEffect(() => {
    loadTickets()
  }, [loadTickets])

  const counts = useMemo(() => {
    const rows = tickets ?? []
    return {
      all: rows.length,
      open: rows.filter((ticket) => ticket.status === 'open').length,
      closed: rows.filter((ticket) => ticket.status === 'closed').length,
    }
  }, [tickets])

  const filteredTickets = useMemo(() => {
    if (!tickets) return []
    if (activeTab === 'all') return tickets
    return tickets.filter((ticket) => ticket.status === activeTab)
  }, [activeTab, tickets])

  const handleTicketCreated = async (ticket: { ticketId: string; ticketNumber?: string }) => {
    setNewTicketOpen(false)
    toast.success(`${ticket.ticketNumber ?? 'Ticket'} opened`)
    await loadTickets()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <LifeBuoy className="h-5 w-5 text-emerald-600" />
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Support</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">Your ticket history and conversations with ZRecipe.</p>
        </div>

        <button
          type="button"
          onClick={() => setNewTicketOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          New ticket
        </button>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              activeTab === tab.value
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label} ({counts[tab.value]})
          </button>
        ))}
      </div>

      {tickets === null ? (
        <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white py-16 text-slate-400 shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <MessageCircle className="mx-auto mb-3 h-10 w-10 text-slate-200" />
          <p className="text-sm font-semibold text-slate-700">No tickets yet</p>
          <p className="mt-1 text-sm text-slate-400">
            {tickets.length === 0 ? 'Contact support when you need a hand.' : `No ${activeTab} tickets right now.`}
          </p>
          <button
            type="button"
            onClick={() => setNewTicketOpen(true)}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Contact support
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="divide-y divide-slate-100">
            {filteredTickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/support/${ticket.id}`}
                className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-emerald-50/40"
              >
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                  {ticket.user_unread && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {formatTicketNumber(ticket.number, ticket.created_at)}
                  </p>
                  <p className={cn(
                    'truncate text-sm',
                    ticket.user_unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'
                  )}>
                    {ticket.subject}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {ticket.last_message_preview || 'No messages yet.'}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-xs text-slate-400">
                    {formatDistanceToNowStrict(new Date(ticket.last_message_at), { addSuffix: true })}
                  </span>
                  <span
                    className={cn(
                      'rounded-full px-2.5 py-1 text-[10px] font-semibold',
                      ticket.status === 'open'
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    )}
                  >
                    {ticket.status === 'open' ? 'Open' : 'Closed'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <SupportModal
        open={newTicketOpen}
        onOpenChange={setNewTicketOpen}
        mode="internal"
        onTicketCreated={handleTicketCreated}
      />
    </div>
  )
}

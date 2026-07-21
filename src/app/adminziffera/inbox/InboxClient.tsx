'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { Mail, MessageSquare } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getChannelSourceBadge } from '@/lib/support/channelSource'
import { formatTicketNumber } from '@/lib/support/formatTicketNumber'

export interface InboxTicket {
  id: string
  number: number
  channel: 'email' | 'internal'
  channel_source?: string | null
  status: 'open' | 'closed'
  requester_name: string
  requester_email: string
  subject: string
  last_message_preview: string | null
  last_message_at: string
  admin_unread: boolean
}

type StatusTab = 'all' | 'open' | 'closed'
type ChannelFilter = 'all' | 'email' | 'internal'

const STATUS_TABS: { value: StatusTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
]

const CHANNEL_CHIPS: { value: ChannelFilter; label: string }[] = [
  { value: 'all', label: 'All channels' },
  { value: 'email', label: 'Email only' },
  { value: 'internal', label: 'Internal only' },
]

export default function InboxClient({ tickets }: { tickets: InboxTicket[] }) {
  const [statusTab, setStatusTab] = useState<StatusTab>('all')
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>('all')

  const filtered = useMemo(() => {
    return tickets.filter((t) => {
      if (statusTab !== 'all' && t.status !== statusTab) return false
      if (channelFilter !== 'all' && t.channel !== channelFilter) return false
      return true
    })
  }, [tickets, statusTab, channelFilter])

  return (
    <div>
      {/* Status tabs */}
      <div className="mb-3 flex items-center gap-1 border-b border-slate-200">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setStatusTab(tab.value)}
            className={cn(
              'border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              statusTab === tab.value
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Channel filter chips */}
      <div className="mb-4 flex items-center gap-2">
        {CHANNEL_CHIPS.map((chip) => (
          <button
            key={chip.value}
            onClick={() => setChannelFilter(chip.value)}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              channelFilter === chip.value
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {filtered.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">No tickets here.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((t) => {
              const badge = getChannelSourceBadge(t.channel, t.channel_source)
              return (
              <Link
                key={t.id}
                href={`/adminziffera/inbox/${t.id}`}
                className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50"
              >
                <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                  {t.admin_unread && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                </span>

                <span
                  className={cn(
                    'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
                    badge.className
                  )}
                >
                  {badge.icon === 'mail' ? <Mail className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                  {badge.label}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className={cn('truncate text-sm', t.admin_unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>
                      <span className="text-slate-400">{formatTicketNumber(t.number)} · </span>
                      {t.subject}
                    </p>
                    {t.status === 'closed' && (
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                        Closed
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {t.requester_name} · {t.requester_email}
                  </p>
                </div>

                <span className="shrink-0 text-xs text-slate-400">
                  {formatDistanceToNow(new Date(t.last_message_at), { addSuffix: true })}
                </span>
              </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

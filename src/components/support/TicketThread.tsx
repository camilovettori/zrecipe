'use client'

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

export interface ThreadMessage {
  id: string
  author_role: 'user' | 'admin'
  author_name: string
  body: string
  created_at: string
}

export default function TicketThread({ messages }: { messages: ThreadMessage[] }) {
  if (messages.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">No messages yet.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {messages.map((m) => (
        <div
          key={m.id}
          className={cn(
            'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm',
            m.author_role === 'admin'
              ? 'ml-auto bg-emerald-600 text-white'
              : 'bg-slate-100 text-slate-800'
          )}
        >
          <p
            className={cn(
              'mb-1 text-xs font-semibold',
              m.author_role === 'admin' ? 'text-emerald-50/80' : 'text-slate-500'
            )}
          >
            {m.author_name} · {formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.body}</p>
        </div>
      ))}
    </div>
  )
}

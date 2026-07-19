'use client'

import { useEffect, useState, type ComponentType } from 'react'
import Link from 'next/link'
import {
  Building2,
  ChevronRight,
  CreditCard,
  ImageIcon,
  KeyRound,
  Shield,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantContext } from '@/hooks/useTenant'
import { getEffectiveSubscriptionStatus } from '@/lib/tenant'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, { label: string; tone: string }> = {
  trialing: { label: 'Trial', tone: 'bg-emerald-50 text-emerald-700' },
  active: { label: 'Pro', tone: 'bg-emerald-100 text-emerald-700' },
  past_due: { label: 'Past due', tone: 'bg-amber-100 text-amber-700' },
  canceled: { label: 'Canceled', tone: 'bg-red-100 text-red-600' },
  inactive: { label: 'Free', tone: 'bg-slate-100 text-slate-600' },
}

function SettingsTile({
  href,
  icon: Icon,
  iconClass,
  title,
  description,
  badge,
}: {
  href: string
  icon: ComponentType<{ className?: string }>
  iconClass: string
  title: string
  description: string
  badge?: { label: string; tone: string } | null
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconClass)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {badge && (
            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', badge.tone)}>
              {badge.label}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
    </Link>
  )
}

export default function SettingsPage() {
  const [memberCount, setMemberCount] = useState<number | null>(null)
  const [subStatus, setSubStatus] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const supabase = createClient()
        const ctx = await resolveTenantContext()
        setSubStatus(getEffectiveSubscriptionStatus(ctx.tenant.subscriptionStatus, ctx.tenant.createdAt))

        const { count } = await supabase
          .from('tenant_users')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', ctx.tenantId)
        setMemberCount(count ?? 0)
      } catch {
        // Non-fatal — tiles just render without a badge.
      }
    }
    load()
  }, [])

  const billingBadge = subStatus ? STATUS_BADGE[subStatus] ?? STATUS_BADGE.inactive : null
  const teamBadge =
    memberCount != null
      ? { label: `${memberCount} member${memberCount !== 1 ? 's' : ''}`, tone: 'bg-gray-100 text-gray-500' }
      : null

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          <Shield className="h-3.5 w-3.5" />
          Settings
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-2 text-sm text-slate-500">Manage your account and subscription.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <SettingsTile
          href="/settings/business"
          icon={Building2}
          iconClass="bg-emerald-50 text-emerald-600"
          title="Business Details"
          description="Update your workspace information."
        />
        <SettingsTile
          href="/settings/security"
          icon={KeyRound}
          iconClass="bg-slate-100 text-slate-700"
          title="Security"
          description="Set a new password for your account."
        />
        <SettingsTile
          href="/settings/branding"
          icon={ImageIcon}
          iconClass="bg-emerald-50 text-emerald-600"
          title="Kitchen Card Branding"
          description="Choose the logo shown in the header of your printed Kitchen Cards."
        />
        <SettingsTile
          href="/settings/team"
          icon={Users}
          iconClass="bg-emerald-50 text-emerald-600"
          title="Team Members"
          description="Invite your team to access the workspace."
          badge={teamBadge}
        />
        <SettingsTile
          href="/settings/billing"
          icon={CreditCard}
          iconClass="bg-emerald-50 text-emerald-600"
          title="Billing & Plan"
          description="Manage your subscription, usage and billing history."
          badge={billingBadge}
        />
      </div>
    </div>
  )
}

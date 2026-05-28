'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import * as Tabs from '@radix-ui/react-tabs'
import {
  Building2,
  CalendarClock,
  CreditCard,
  FileText,
  KeyRound,
  Loader2,
  Package,
  Shield,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantId } from '@/hooks/useTenant'
import { ZRECIPE_PRO } from '@/lib/stripe/plans'
import {
  getEffectiveSubscriptionStatus,
  getTrialEndsAt,
  type TenantSubscriptionStatus,
} from '@/lib/tenant'
import { cn } from '@/lib/utils'

type TeamMember = {
  id: string
  userId: string
  email: string | null
  role: 'owner' | 'admin' | 'member' | 'viewer'
  createdAt: string
  isOwner: boolean
}

type TenantSettings = {
  id: string
  name: string
  business_type: string | null
  owner_email: string | null
  plan: string | null
  subscription_status: string | null
  stripe_customer_id: string | null
  subscription_current_period_end: string | null
  subscription_trial_end: string | null
  created_at: string
}

type UsageStats = {
  recipes: number
  ingredients: number
  invoices: number
}

const TABS = ['account', 'billing', 'team'] as const
type SettingsTab = (typeof TABS)[number]

function statusTone(status: TenantSubscriptionStatus | string) {
  switch (status) {
    case 'active':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
    case 'trialing':
      return 'bg-blue-50 text-blue-700 ring-blue-200'
    case 'past_due':
      return 'bg-amber-50 text-amber-700 ring-amber-200'
    case 'canceled':
    case 'inactive':
    default:
      return 'bg-red-50 text-red-700 ring-red-200'
  }
}

function roleTone(role: TeamMember['role']) {
  switch (role) {
    case 'owner':
      return 'bg-slate-900 text-white'
    case 'admin':
      return 'bg-emerald-50 text-emerald-700'
    case 'member':
      return 'bg-blue-50 text-blue-700'
    case 'viewer':
    default:
      return 'bg-slate-100 text-slate-600'
  }
}

function formatDate(value?: string | null) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-IE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function statCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: ComponentType<{ className?: string }>
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{value}</p>
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const [tenant, setTenant] = useState<TenantSettings | null>(null)
  const [usage, setUsage] = useState<UsageStats>({ recipes: 0, ingredients: 0, invoices: 0 })
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [currentUserEmail, setCurrentUserEmail] = useState<string>('')
  const [currentUserRole, setCurrentUserRole] = useState<TeamMember['role']>('member')
  const [loading, setLoading] = useState(true)
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [inviteBusy, setInviteBusy] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<TeamMember['role']>('member')
  const [tab, setTab] = useState<SettingsTab>('account')

  const tenantTrialStatus = useMemo(() => {
    if (!tenant) return 'inactive'
    return getEffectiveSubscriptionStatus(tenant.subscription_status, tenant.created_at)
  }, [tenant])

  const nextBillingDate = useMemo(() => {
    if (tenant?.subscription_current_period_end) {
      return tenant.subscription_current_period_end
    }

    if (tenant?.subscription_status === 'trialing') {
      return getTrialEndsAt(tenant.created_at).toISOString()
    }

    return null
  }, [tenant])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const queryTab = params.get('tab')
    if (queryTab && TABS.includes(queryTab as SettingsTab)) {
      setTab(queryTab as SettingsTab)
    }

    const notice = params.get('notice')
    if (!notice) return

    if (notice === 'checkout_success') {
      toast.success('Subscription checkout completed')
    } else if (notice === 'checkout_canceled') {
      toast('Subscription checkout canceled')
    } else if (notice === 'subscription_locked') {
      toast.error('Your subscription needs attention to continue.')
    }

    params.delete('notice')
    params.set('tab', queryTab && TABS.includes(queryTab as SettingsTab) ? queryTab : tab)
    router.replace(`/settings?${params.toString()}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const supabase = createClient()
        const [{ data: userData }, tenantId] = await Promise.all([
          supabase.auth.getUser(),
          resolveTenantId(),
        ])

        const user = userData.user
        setCurrentUserEmail(user?.email ?? '')

        const { data: tenantRow, error: tenantError } = await supabase
          .from('tenants')
          .select(
            'id, name, business_type, owner_email, plan, subscription_status, stripe_customer_id, subscription_current_period_end, subscription_trial_end, created_at'
          )
          .eq('id', tenantId)
          .maybeSingle()

        if (tenantError || !tenantRow) {
          throw tenantError ?? new Error('Unable to load tenant settings')
        }

        const { count: recipeCount } = await supabase
          .from('recipes')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)

        const { count: ingredientCount } = await supabase
          .from('ingredients')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)

        const { count: invoiceCount } = await supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)

        setTenant(tenantRow as TenantSettings)
        setAccountName(tenantRow.name)
        setBusinessType(tenantRow.business_type ?? '')
        setUsage({
          recipes: recipeCount ?? 0,
          ingredients: ingredientCount ?? 0,
          invoices: invoiceCount ?? 0,
        })

        const teamResponse = await fetch('/api/team')
        if (teamResponse.ok) {
          const payload = (await teamResponse.json()) as {
            members: TeamMember[]
            currentUserRole: TeamMember['role']
          }
          setTeamMembers(payload.members)
          setCurrentUserRole(payload.currentUserRole)
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load settings')
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [])

  const handleAccountSave = async () => {
    if (!tenant) return
    try {
      setSavingAccount(true)
      const supabase = createClient()
      const { error } = await supabase
        .from('tenants')
        .update({
          name: accountName,
          business_type: businessType || null,
        })
        .eq('id', tenant.id)

      if (error) throw error

      setTenant((current) =>
        current
          ? {
              ...current,
              name: accountName,
              business_type: businessType || null,
            }
          : current
      )
      toast.success('Account updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to update account')
    } finally {
      setSavingAccount(false)
    }
  }

  const handlePasswordChange = async () => {
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    try {
      setSavingPassword(true)
      const supabase = createClient()
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) throw error
      setNewPassword('')
      setConfirmPassword('')
      toast.success('Password updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to change password')
    } finally {
      setSavingPassword(false)
    }
  }

  const handleSubscriptionAction = async () => {
    try {
      setBillingBusy(true)
      const endpoint = tenant?.stripe_customer_id ? '/api/billing/portal' : '/api/billing/checkout'
      const response = await fetch(endpoint, { method: 'POST' })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to open billing portal')
      }

      if (payload.url) {
        window.location.assign(payload.url as string)
      } else {
        throw new Error('Missing billing portal URL')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open billing portal')
    } finally {
      setBillingBusy(false)
    }
  }

  const refreshTeam = async () => {
    const response = await fetch('/api/team')
    if (!response.ok) return
    const payload = (await response.json()) as {
      members: TeamMember[]
      currentUserRole: TeamMember['role']
    }
    setTeamMembers(payload.members)
    setCurrentUserRole(payload.currentUserRole)
  }

  const handleInvite = async () => {
    try {
      setInviteBusy(true)
      const response = await fetch('/api/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      })
      const payload = await response.json()

      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to invite member')
      }

      setInviteEmail('')
      setInviteRole('member')
      await refreshTeam()
      toast.success('Invitation sent')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to invite member')
    } finally {
      setInviteBusy(false)
    }
  }

  const handleRemoveMember = async (member: TeamMember) => {
    const confirmed = window.confirm(`Remove ${member.email ?? 'this member'}?`)
    if (!confirmed) return

    try {
      const response = await fetch(`/api/team/${member.id}`, { method: 'DELETE' })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.message ?? 'Unable to remove member')
      }

      await refreshTeam()
      toast.success('Member removed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to remove member')
    }
  }

  const planLabel = `${tenant?.plan === 'free' ? 'ZRecipe Pro' : 'ZRecipe Pro'} — €${(
    ZRECIPE_PRO.amount / 100
  ).toFixed(0)}/month`

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded-full bg-slate-100" />
        <div className="h-[34rem] animate-pulse rounded-3xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
          <Shield className="h-3.5 w-3.5" />
          Settings
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold text-slate-900">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Manage your account, billing, and team from one place.
        </p>
      </div>

        <Tabs.Root
          value={tab}
          onValueChange={(value) => {
            const next = value as SettingsTab
            setTab(next)
            router.replace(`/settings?tab=${next}`)
          }}
        >
        <Tabs.List className="inline-flex rounded-full border border-slate-200 bg-white p-1 shadow-sm">
          <Tabs.Trigger
            value="account"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Account
          </Tabs.Trigger>
          <Tabs.Trigger
            value="billing"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Billing
          </Tabs.Trigger>
          <Tabs.Trigger
            value="team"
            className="rounded-full px-4 py-2 text-sm font-medium text-slate-500 transition data-[state=active]:bg-emerald-600 data-[state=active]:text-white"
          >
            Team
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="account" className="mt-6 space-y-6">
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Business Details</h2>
                  <p className="text-sm text-slate-500">Update your workspace information.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Business name
                  </span>
                  <input
                    value={accountName}
                    onChange={(event) => setAccountName(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Business type
                  </span>
                  <input
                    value={businessType}
                    onChange={(event) => setBusinessType(event.target.value)}
                    placeholder="restaurant, cafe, bakery..."
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Owner email
                  </span>
                  <input
                    value={currentUserEmail || tenant?.owner_email || ''}
                    readOnly
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-600 outline-none"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAccountSave}
                  disabled={savingAccount}
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingAccount ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save Changes
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Change Password</h2>
                  <p className="text-sm text-slate-500">Set a new password for your account.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    New password
                  </span>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium text-slate-700">
                    Confirm password
                  </span>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                  />
                </label>

                <button
                  type="button"
                  onClick={handlePasswordChange}
                  disabled={savingPassword}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Update Password
                </button>
              </div>
            </section>
          </div>
        </Tabs.Content>

        <Tabs.Content value="billing" className="mt-6 space-y-6">
          <section className="grid gap-4 xl:grid-cols-3">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                    <CreditCard className="h-3.5 w-3.5" />
                    Current Plan
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-900">{planLabel}</h2>
                  <p className="mt-2 text-sm text-slate-500">
                    {tenant?.stripe_customer_id
                      ? 'Your subscription is linked to Stripe and ready to manage.'
                      : 'Start your Pro subscription when you are ready.'}
                  </p>
                </div>
                <span
                  className={cn(
                    'inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1',
                    statusTone(tenantTrialStatus)
                  )}
                >
                  {tenantTrialStatus}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleSubscriptionAction}
                  disabled={billingBusy}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {billingBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {tenant?.stripe_customer_id ? 'Manage Subscription' : 'Start Subscription'}
                </button>
                <span className="text-sm text-slate-500">
                  Next billing date: {formatDate(nextBillingDate)}
                </span>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <CalendarClock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Trial Window</h3>
                  <p className="text-sm text-slate-500">Free trial length is 14 days.</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-slate-600">
                Trial ends on {formatDate(getTrialEndsAt(tenant?.created_at ?? new Date().toISOString()).toISOString())}
              </p>
            </div>
          </section>

          <section className="grid gap-4 md:grid-cols-3">
            {statCard({ label: 'Recipes created', value: usage.recipes, icon: FileText })}
            {statCard({ label: 'Ingredients', value: usage.ingredients, icon: Package })}
            {statCard({ label: 'Invoices', value: usage.invoices, icon: CreditCard })}
          </section>
        </Tabs.Content>

        <Tabs.Content value="team" className="mt-6 space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  <Users className="h-3.5 w-3.5" />
                  Team Members
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-slate-900">Manage your team</h2>
                <p className="mt-2 text-sm text-slate-500">
                  Invite colleagues, review roles, and remove access when needed.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="overflow-hidden rounded-2xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Member</th>
                      <th className="px-4 py-3 font-semibold">Role</th>
                      <th className="px-4 py-3 font-semibold">Added</th>
                      <th className="px-4 py-3 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {teamMembers.map((member) => (
                      <tr key={member.id}>
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-slate-900">
                              {member.email ?? 'Unknown user'}
                            </p>
                            <p className="text-xs text-slate-500">{member.userId}</p>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-3 py-1 text-xs font-semibold',
                              roleTone(member.role)
                            )}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-500">
                          {formatDate(member.createdAt)}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(member)}
                            disabled={currentUserRole !== 'owner' || member.isOwner}
                            className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm ring-1 ring-slate-200">
                    <UserPlus className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Invite Member</h3>
                    <p className="text-sm text-slate-500">Add someone to the workspace.</p>
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Email</span>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                      placeholder="teammate@example.com"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium text-slate-700">Role</span>
                    <select
                      value={inviteRole}
                      onChange={(event) => setInviteRole(event.target.value as TeamMember['role'])}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </label>

                  <button
                    type="button"
                    onClick={handleInvite}
                    disabled={inviteBusy || currentUserRole === 'viewer'}
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {inviteBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Invite Member
                  </button>
                </div>
              </div>
            </div>
          </section>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  )
}

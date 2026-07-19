'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Loader2, Mail, RefreshCw, Send, Users, X } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { resolveTenantContext } from '@/hooks/useTenant'
import { useSubscription } from '@/hooks/useSubscription'
import { cn } from '@/lib/utils'
import { CustomSelect } from '@/components/ui/CustomSelect'

type TeamMember = { id: string; user_id: string; role: string; created_at: string; email: string; full_name: string | null }
type PendingInvite = { id: string; email: string; role: string; invited_at: string; status: string }

export default function TeamSettingsPage() {
  const { limits, hasFullAccess } = useSubscription()
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<TeamMember[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<string>('owner')
  const [currentTenantId, setCurrentTenantId] = useState<string>('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('staff')
  const [isSending, setIsSending] = useState(false)

  // ── Data load ────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const supabase = createClient()

        const [{ data: authData }, ctx] = await Promise.all([
          supabase.auth.getUser(),
          resolveTenantContext(),
        ])

        setCurrentTenantId(ctx.tenantId)

        const [{ data: tuRow }, { data: membersData }, { data: invitesData }] = await Promise.all([
          supabase.from('tenant_users').select('role').eq('tenant_id', ctx.tenantId).eq('user_id', authData.user?.id ?? '').maybeSingle(),
          supabase.rpc('get_tenant_user_profiles', { p_tenant_id: ctx.tenantId }),
          supabase.from('tenant_invites').select('id, email, role, invited_at, status').eq('tenant_id', ctx.tenantId).eq('status', 'pending'),
        ])
        setCurrentUserRole((tuRow as { role: string } | null)?.role ?? 'owner')
        setMembers((membersData as TeamMember[] | null) ?? [])
        setPendingInvites((invitesData as PendingInvite[] | null) ?? [])
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Unable to load team')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Handlers ─────────────────────────────────────────────────────────────
  const refetchTeam = async (tenantId?: string) => {
    const id = tenantId ?? currentTenantId
    if (!id) return
    const supabase = createClient()
    const [{ data: membersData }, { data: invitesData }] = await Promise.all([
      supabase.rpc('get_tenant_user_profiles', { p_tenant_id: id }),
      supabase.from('tenant_invites').select('id, email, role, invited_at, status').eq('tenant_id', id).eq('status', 'pending'),
    ])
    setMembers((membersData as TeamMember[] | null) ?? [])
    setPendingInvites((invitesData as PendingInvite[] | null) ?? [])
  }

  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) return
    setIsSending(true)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole, tenantId: currentTenantId }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Failed to send invite')
      toast.success(`Invite sent to ${inviteEmail.trim()}`)
      setInviteEmail('')
      refetchTeam()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite')
    } finally {
      setIsSending(false)
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Remove this team member?')) return
    const supabase = createClient()
    await supabase.from('tenant_users').delete().eq('tenant_id', currentTenantId).eq('user_id', userId)
    toast.success('Member removed')
    refetchTeam()
  }

  const handleCancelInvite = async (inviteId: string) => {
    const supabase = createClient()
    await supabase.from('tenant_invites').update({ status: 'expired' }).eq('id', inviteId)
    refetchTeam()
  }

  const atTeamLimit = hasFullAccess && members.length >= limits.maxTeamMembers
  const inviteBlocked = !hasFullAccess || atTeamLimit

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-slate-100" />
        <div className="h-10 w-56 animate-pulse rounded-full bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Link
        href="/settings"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <div>
        <h1 className="font-display text-2xl font-semibold text-slate-900">Team Members</h1>
        <p className="mt-1 text-sm text-slate-500">Invite your team to access the workspace.</p>
      </div>

      <section className="max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Team Members</h2>
              <p className="text-sm text-slate-500">Invite your team to access the workspace.</p>
            </div>
          </div>
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Current members */}
        <div className="mb-5 space-y-2">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <span className="text-xs font-semibold text-emerald-700">
                    {(member.full_name ?? member.email ?? '?').charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{member.full_name ?? member.email}</p>
                  {member.full_name && <p className="text-xs text-gray-400">{member.email}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  member.role === 'owner' ? 'bg-emerald-100 text-emerald-700'
                    : member.role === 'manager' ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                )}>
                  {member.role}
                </span>
                {member.role !== 'owner' && currentUserRole === 'owner' && (
                  <button
                    onClick={() => handleRemoveMember(member.user_id)}
                    className="p-1 text-gray-300 transition-colors hover:text-red-400"
                    title="Remove member"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Pending invites */}
        {pendingInvites.length > 0 && (
          <div className="mb-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Pending invites</p>
            <div className="space-y-2">
              {pendingInvites.map((invite) => (
                <div key={invite.id} className="flex items-center justify-between rounded-xl border border-dashed border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
                      <Mail className="h-3.5 w-3.5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">{invite.email}</p>
                      <p className="text-xs text-gray-400">
                        Invited {format(new Date(invite.invited_at), 'MMM d, yyyy')} · {invite.role}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-600">
                      Pending
                    </span>
                    <button
                      onClick={() => { setInviteEmail(invite.email); setInviteRole(invite.role); handleSendInvite() }}
                      className="p-1 text-gray-300 transition-colors hover:text-emerald-500"
                      title="Resend invite"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleCancelInvite(invite.id)}
                      className="p-1 text-gray-300 transition-colors hover:text-red-400"
                      title="Cancel invite"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-slate-100 pt-5">
          {currentUserRole === 'owner' ? (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">Invite a team member</p>

              {inviteBlocked && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {!hasFullAccess ? (
                    <>
                      Team members require a Pro plan —{' '}
                      <Link href="/settings/billing" className="font-semibold underline">Upgrade</Link>
                    </>
                  ) : (
                    <>Team limit reached ({members.length}/{limits.maxTeamMembers}) on the Pro plan.</>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !inviteBlocked && handleSendInvite()}
                  placeholder="colleague@restaurant.com"
                  disabled={inviteBlocked}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                />
                <CustomSelect
                  value={inviteRole}
                  onChange={setInviteRole}
                  className="w-36"
                  disabled={inviteBlocked}
                  options={[
                    { value: 'manager', label: 'Manager', description: 'Edit recipes, view costs' },
                    { value: 'staff', label: 'Chef / Staff', description: 'View recipes only' },
                  ]}
                />
                <button
                  onClick={handleSendInvite}
                  disabled={inviteBlocked || !inviteEmail.trim() || isSending}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />}
                  Send Invite
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-blue-50 p-2.5">
                  <p className="mb-1 text-xs font-semibold text-blue-700">Manager</p>
                  <p className="text-xs text-blue-600">Can create and edit recipes, view ingredient costs. Cannot access billing.</p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2.5">
                  <p className="mb-1 text-xs font-semibold text-gray-600">Chef / Staff</p>
                  <p className="text-xs text-gray-500">Can view recipes and ingredients. No access to costs, prices, or settings.</p>
                </div>
              </div>
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-slate-400">Only the workspace owner can invite team members.</p>
          )}
        </div>
      </section>
    </div>
  )
}

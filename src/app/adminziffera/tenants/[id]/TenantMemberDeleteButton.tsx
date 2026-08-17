'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { Loader2, Trash2 } from 'lucide-react'
import { deleteTenantMember } from '@/app/adminziffera/actions'

interface Props {
  tenantId: string
  userId: string
  memberName: string
}

export default function TenantMemberDeleteButton({ tenantId, userId, memberName }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleRemove() {
    if (!window.confirm(`Remove ${memberName} from this tenant?`)) return

    startTransition(async () => {
      try {
        await deleteTenantMember(tenantId, userId)
        router.refresh()
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Failed to remove member.')
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleRemove}
      disabled={isPending}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      title="Remove member"
      aria-label={`Remove ${memberName} from tenant`}
    >
      {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  )
}

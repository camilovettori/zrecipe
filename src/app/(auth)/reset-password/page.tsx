import AuthSplitShell from '@/components/auth/AuthSplitShell'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export const metadata = { title: 'Reset Password - ZRecipe' }

export default function ResetPasswordPage() {
  return (
    <AuthSplitShell
      variant="recovery"
      formBadge="New Password"
      formTitle="Set a new password."
      formSubtitle="Enter and confirm your new password below."
    >
      <ResetPasswordForm />
    </AuthSplitShell>
  )
}

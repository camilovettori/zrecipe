import AuthSplitShell from '@/components/auth/AuthSplitShell'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export const metadata = { title: 'Forgot Password - ZRecipe' }

export default function ForgotPasswordPage() {
  return (
    <AuthSplitShell
      variant="recovery"

      formTitle="Forgot your password?"
      formSubtitle="Enter your email and we'll send a reset link."
    >
      <ForgotPasswordForm />
    </AuthSplitShell>
  )
}

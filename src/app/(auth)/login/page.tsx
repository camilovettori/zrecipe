import AuthSplitShell from '@/components/auth/AuthSplitShell'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = { title: 'Sign In - ZRecipe' }

export default function LoginPage() {
  return (
    <AuthSplitShell
      variant="login"
      formBadge="Sign In"
      formTitle="Welcome back."
      formSubtitle="Sign in to your kitchen."
    >
      <LoginForm />
    </AuthSplitShell>
  )
}

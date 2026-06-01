import AuthSplitShell from '@/components/auth/AuthSplitShell'
import RegisterForm from '@/components/auth/RegisterForm'

export const metadata = { title: 'Start Free Trial - ZRecipe' }

export default function RegisterPage() {
  return (
    <AuthSplitShell
      variant="signup"
      formBadge="Start Your Trial"
      formTitle="Create your kitchen."
      formSubtitle="Two minutes. One kitchen. Zero credit card."
      formId="signup-form"
    >
      <RegisterForm />
    </AuthSplitShell>
  )
}

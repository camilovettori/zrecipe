import AuthSplitShell from '@/components/auth/AuthSplitShell'
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm'

export const metadata = { title: 'Forgot Password - ZRecipe' }

export default function ForgotPasswordPage() {
  return (
    <AuthSplitShell
      badge="Account recovery"
      leftTitle="Reset your password"
      leftSubtitle="We will send a secure link to your inbox so you can get back into your workspace."
      features={['Secure email-based recovery', 'Keeps your workspace protected']}
      footerText="If you need help, reach out to your team admin or support."
      rightTitle="Forgot your password?"
      rightSubtitle="Enter your email and we will send you a reset link."
      featureStyle="subtle"
      modelPath="/models/flour_aridll.glb"
    >
      <ForgotPasswordForm />
    </AuthSplitShell>
  )
}

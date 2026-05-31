import AuthSplitShell from '@/components/auth/AuthSplitShell'
import ResetPasswordForm from '@/components/auth/ResetPasswordForm'

export const metadata = { title: 'Reset Password - ZRecipe' }

export default function ResetPasswordPage() {
  return (
    <AuthSplitShell
      badge="Account recovery"
      leftTitle="Set a new password"
      leftSubtitle="Choose a new password to secure your ZRecipe account and get back to work."
      features={['Your workspace stays protected', 'One quick step to restore access']}
      footerText="Once saved, you will be sent back to sign in."
      rightTitle="Reset password"
      rightSubtitle="Enter and confirm your new password below."
      featureStyle="subtle"
      modelPath="/models/flour_aridll.glb"
    >
      <ResetPasswordForm />
    </AuthSplitShell>
  )
}

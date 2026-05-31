import AuthSplitShell from '@/components/auth/AuthSplitShell'
import RegisterForm from '@/components/auth/RegisterForm'

export const metadata = { title: 'Start Free Trial - ZRecipe' }

export default function SignupPage() {
  return (
    <AuthSplitShell
      badge="START YOUR TRIAL"
      leftTitle="Start your free 14-day Pro trial"
      leftSubtitle="No credit card required. Full Pro access from day one."
      features={[
        'Unlimited recipes',
        'AI invoice imports',
        'Price tracking',
        'EU allergens',
        'Kitchen PDFs',
      ]}
      footerText="Set up takes under 2 minutes. Cancel anytime."
      rightTitle="Create your account"
      rightSubtitle="Set up your kitchen workspace and start your free trial in under two minutes."
      featureStyle="check"
      modelPath="/models/croissant.glb"
      ctaHref="#signup-form"
      ctaLabel="Start free trial"
      pricingNote="Cancel anytime"
      formId="signup-form"
    >
      <RegisterForm />
    </AuthSplitShell>
  )
}

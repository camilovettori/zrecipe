import AuthSplitShell from '@/components/auth/AuthSplitShell'
import LoginForm from '@/components/auth/LoginForm'

export const metadata = { title: 'Sign In - ZRecipe' }

export default function LoginPage() {
  return (
    <AuthSplitShell
      badge="FOOD COSTING SOFTWARE"
      leftTitle="Recipe costing made simple"
      leftSubtitle="Stop guessing your food costs. Track ingredients, import invoices with AI, and stay EU-compliant - all in one place."
      features={[
        'AI invoice imports',
        'Food cost calculations',
        'EU allergen compliance',
      ]}
      footerText="Built for bakeries, restaurants, and food businesses across Ireland and the EU."
      rightTitle="Welcome back"
      rightSubtitle="Sign in to continue costing recipes, managing suppliers, and exporting kitchen-ready PDFs."
      featureStyle="subtle"
      modelPath="/models/croissant.glb"
      ctaHref="/signup"
      ctaLabel="Start free trial"
      pricingNote="No credit card required"
    >
      <LoginForm />
    </AuthSplitShell>
  )
}

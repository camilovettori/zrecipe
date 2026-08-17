import { permanentRedirect } from 'next/navigation'

export const metadata = { title: 'Start Free Trial - ZRecipe' }

export default function SignupPage() {
  permanentRedirect('/register')
}

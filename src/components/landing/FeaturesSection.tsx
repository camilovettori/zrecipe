import {
  ChefHat, Layers, Scale, Clock3, Percent,
  Receipt, TrendingUp, Repeat, Truck,
  Apple, FileText, Tag, BarChart3, Sparkles, Users,
} from 'lucide-react'
import Reveal from './Reveal'

const GROUPS = [
  {
    heading: 'Cost every dish, automatically',
    intro: 'The full cost of a recipe, recalculated the instant anything changes.',
    features: [
      {
        Icon: ChefHat,
        title: 'Automated recipe costing',
        description: 'Every recipe recalculates its true cost the instant an ingredient price changes.',
      },
      {
        Icon: Layers,
        title: 'Sub-recipes',
        description:
          'Use one recipe as an ingredient in another (like a pastry cream base) — costs roll up automatically through every recipe that uses it.',
      },
      {
        Icon: Scale,
        title: 'Yield & batch scaling',
        description: 'Scale a recipe from one portion to a full batch with USDA-referenced yield factors baked in.',
      },
      {
        Icon: Clock3,
        title: 'Labor & overhead, your way',
        description:
          'Turn on labor and overhead cost tracking per recipe, with your own job titles and hourly rates — not a generic default.',
      },
      {
        Icon: Percent,
        title: 'VAT-aware pricing',
        description:
          "Set your selling price inclusive of VAT and see your true margin, calculated against Ireland's current VAT rates.",
      },
    ],
  },
  {
    heading: 'Never lose track of a price change',
    intro: 'Prices move constantly — ZRecipe keeps up so you don’t have to.',
    features: [
      {
        Icon: Receipt,
        title: 'AI-powered invoice import',
        description:
          'Snap a photo or upload a PDF — ZRecipe extracts suppliers, prices, and packaging automatically. Import a single invoice or a whole batch at once.',
      },
      {
        Icon: TrendingUp,
        title: 'Ingredient price history',
        description:
          "Every price you've ever paid for an ingredient, charted over time, so you spot a supplier's creeping prices before they eat your margin.",
      },
      {
        Icon: Repeat,
        title: 'Substitute an ingredient everywhere',
        description:
          'Swap a discontinued or renamed ingredient across every recipe that uses it, in one action — not one recipe at a time.',
      },
      {
        Icon: Truck,
        title: 'Supplier & brand tracking',
        description:
          "Know exactly which supplier and brand you're paying for, with autocomplete that keeps your data consistent.",
      },
    ],
  },
  {
    heading: 'Run the business, not just the kitchen',
    intro: 'Compliance, reporting, and team tools that scale with you.',
    features: [
      {
        Icon: Apple,
        title: 'EU allergen compliance',
        description: 'Allergens roll up from ingredients to recipes automatically, ready for Regulation 1169/2011 labels.',
      },
      {
        Icon: FileText,
        title: 'Kitchen Cards',
        description:
          'Print clean, standardised recipe and prep cards for the line — with your own branding once you’re on Pro.',
      },
      {
        Icon: Tag,
        title: 'Label printing',
        description: 'Batch-print ingredient and allergen labels for Brother, Dymo, and Zebra printers, or standard A4 sheets.',
      },
      {
        Icon: BarChart3,
        title: 'Reports & margin health',
        description:
          "See every recipe's margin at a glance, color-coded from healthy to risky, sorted by what needs your attention first.",
      },
      {
        Icon: Sparkles,
        title: 'AI recipe ideas',
        description:
          'Stuck on what to do with surplus ingredients? Describe what you have and the style you want — ZRecipe suggests recipe ideas to try.',
      },
      {
        Icon: Users,
        title: 'Team access',
        description: 'Bring your kitchen and management team in, with role-based access to costs and settings.',
      },
    ],
  },
]

export default function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-16 bg-slate-50/60 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-700">
            <Sparkles className="h-3.5 w-3.5" />
            Everything for margin-conscious kitchens
          </span>
          <h2 className="mt-3 font-display text-3xl font-bold text-slate-900 sm:text-4xl">
            Built for how food businesses actually work
          </h2>
        </Reveal>

        <div className="mt-14 flex flex-col gap-14">
          {GROUPS.map((group) => (
            <Reveal key={group.heading}>
              <div className="mx-auto max-w-2xl text-center">
                <h3 className="font-sans text-xl font-bold text-slate-900">{group.heading}</h3>
                <p className="mt-1.5 text-sm text-slate-500">{group.intro}</p>
              </div>

              <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {group.features.map(({ Icon, title, description }) => (
                  <div key={title} className="rounded-2xl bg-white p-6 shadow-sm">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-50">
                      <Icon className="h-5 w-5 text-primary-600" />
                    </div>
                    <h4 className="mt-4 font-sans text-base font-semibold text-slate-900">{title}</h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
                  </div>
                ))}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

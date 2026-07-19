import Reveal from './Reveal'

const FOUNDERS = [
  {
    initials: 'IV',
    name: 'Iriana Rosa Vettori',
    role: 'Founder',
    bio: 'A culinary graduate since 2012, Iriana has worked across Relais & Château kitchens worldwide, managed cafés and bakeries, and developed and standardised recipes and fiches techniques for professional kitchens. She shapes how ZRecipe thinks about real kitchen workflows — not just spreadsheets.',
  },
  {
    initials: 'CV',
    name: 'Camilo Vettori',
    role: 'Co-Founder',
    bio: 'Over 20 years in hospitality, across restaurant operations, management, and technology. Camilo built ZRecipe to bring real financial visibility to kitchens that have always run on instinct and spreadsheets.',
  },
]

export default function AboutSection() {
  return (
    <section id="about" className="scroll-mt-16 mx-auto max-w-7xl px-5 py-16 sm:px-8 sm:py-20">
      <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
        <Reveal>
          <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">
            Why we built ZRecipe
          </h2>

          <div className="mt-6 flex flex-col gap-4 text-base leading-relaxed text-slate-600">
            <p>
              ZRecipe started at a kitchen table, not a whiteboard. Between us, we&apos;ve spent
              over three decades in hospitality — running kitchens, managing bakeries and cafés,
              and watching good businesses lose money on dishes nobody ever priced properly.
            </p>
            <p>
              Every recipe we ever costed by hand told the same story: ingredient prices crept
              up, the fiche technique never got updated, and by the time anyone noticed, a
              &quot;profitable&quot; dish had been quietly losing money for months. Allergen
              labelling was worse — copied by hand from recipe to recipe, one typo away from a
              serious mistake.
            </p>
            <p>
              So we built the tool we always wished we had: recipe costing that updates itself
              the moment a supplier invoice changes, allergen labels that are never manually
              copied, and margins you can actually trust. ZRecipe is that tool — built by kitchen
              people, for kitchen people.
            </p>
          </div>
        </Reveal>

        <Reveal className="flex flex-col gap-5 sm:flex-row">
          {FOUNDERS.map((founder) => (
            <div
              key={founder.name}
              className="flex-1 rounded-2xl border border-slate-100 bg-slate-50/60 p-6"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                <span className="text-xl font-semibold text-emerald-700">{founder.initials}</span>
              </div>
              <h3 className="mt-4 font-sans text-base font-semibold text-slate-900">
                {founder.name}
              </h3>
              <p className="text-sm font-medium text-primary-600">{founder.role}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{founder.bio}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  )
}

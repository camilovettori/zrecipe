import RecipeBuilder from '@/components/recipes/RecipeBuilder'

export default function RecipeDetailPage({
  params,
}: {
  params: { id: string }
}) {
  return <RecipeBuilder recipeId={params.id} />
}


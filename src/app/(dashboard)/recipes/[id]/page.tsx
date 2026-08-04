import RecipeBuilder from '@/components/recipes/RecipeBuilder'

export default async function RecipeDetailPage(
  props: {
    params: Promise<{ id: string }>
  }
) {
  const params = await props.params;
  return <RecipeBuilder recipeId={params.id} />
}


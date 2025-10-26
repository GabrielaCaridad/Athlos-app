// Utilidades de nutrición compartidas

export type MacroLike = { protein?: number; carbs?: number; fats?: number };

export function aggregateMacros<T extends MacroLike>(items: T[]): { protein: number; carbs: number; fats: number } {
  const protein = items.reduce((sum, it) => sum + (it.protein || 0), 0);
  const carbs = items.reduce((sum, it) => sum + (it.carbs || 0), 0);
  const fats = items.reduce((sum, it) => sum + (it.fats || 0), 0);
  return { protein, carbs, fats };
}

// Utilidades de nutrición.
// aggregateMacros: suma proteína/carbs/grasas; ignora undefined (usa 0).
// Ejemplo: [{protein:10, carbs:20}, {fats:5}] ⇒ {protein:10, carbs:20, fats:5}

export type MacroLike = { protein?: number; carbs?: number; fats?: number };

export function aggregateMacros<T extends MacroLike>(items: T[]): { protein: number; carbs: number; fats: number } {
  const protein = items.reduce((sum, it) => sum + (it.protein || 0), 0);
  const carbs = items.reduce((sum, it) => sum + (it.carbs || 0), 0);
  const fats = items.reduce((sum, it) => sum + (it.fats || 0), 0);
  return { protein, carbs, fats };
}

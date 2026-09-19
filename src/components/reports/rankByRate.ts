/** Davomat foizi bo'yicha tartib raqami (null — oxirida). */
export function rankByRate<T extends { rate: number | null; name: string }>(rows: readonly T[]): Array<T & { rank: number }> {
  return [...rows]
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

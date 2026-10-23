export interface RaceRatings {
  ratings: Map<string, number>;
  scanned: number;
}

export const raceRatingsPageSize = 100;
export const raceRatingsMaxPages = 20;

/** The global leaderboard is paginated; never make individual player requests. */
export async function collectRaceRatings(
  players: ReadonlySet<string>,
  page: (offset: number, limit: number) => Promise<unknown>,
  signal: AbortSignal,
  progress: (found: number, scanned: number) => void = () => {},
): Promise<RaceRatings> {
  const ratings = new Map<string, number>();
  const seen = new Set<string>();
  let scanned = 0;
  for (let index = 0; index < raceRatingsMaxPages && ratings.size < players.size; index++) {
    signal.throwIfAborted();
    const data = await page(index * raceRatingsPageSize, raceRatingsPageSize);
    signal.throwIfAborted();
    if (!Array.isArray(data)) throw new Error('Unexpected global leaderboard response.');
    const before = seen.size;
    for (const row of data) {
      if (
        !row ||
        typeof row.userId !== 'string' ||
        typeof row.rating !== 'number' ||
        !Number.isFinite(row.rating)
      )
        throw new Error('Unexpected global leaderboard player.');
      seen.add(row.userId);
      if (players.has(row.userId)) ratings.set(row.userId, row.rating);
    }
    scanned += data.length;
    progress(ratings.size, scanned);
    // A repeated page must not cause an endless scan if the API ignores the offset.
    if (data.length < raceRatingsPageSize || seen.size === before) break;
  }
  return { ratings, scanned };
}

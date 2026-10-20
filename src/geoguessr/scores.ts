const endpoint = /^\/api\/v3\/scores\/([^/]+)\/me\/games\/?$/;
export class ScoreIndex {
  private maps = new Map<string, Map<string, Set<string>>>();
  matches(path: string) {
    return endpoint.test(path);
  }
  private key(timestamp: number, points: number) {
    return `${Math.floor(timestamp / 1000)}:${points}`;
  }
  accept(path: string, data: unknown) {
    const map = path.match(endpoint)?.[1];
    if (
      !map ||
      !data ||
      typeof data !== 'object' ||
      !('items' in data) ||
      !Array.isArray(data.items)
    )
      return;
    let games = this.maps.get(map);
    if (!games) {
      games = new Map();
      this.maps.set(map, games);
      // Evict complete maps, preserving ambiguous matches within retained maps.
      if (this.maps.size > 32) this.maps.delete(this.maps.keys().next().value!);
    }
    for (const item of data.items as unknown[]) {
      if (!item || typeof item !== 'object') continue;
      const game = item as Record<string, unknown>;
      const timestamp = typeof game.playedAt === 'string' ? Date.parse(game.playedAt) : NaN;
      if (
        typeof game.gameToken !== 'string' ||
        !game.gameToken.length ||
        !Number.isFinite(timestamp) ||
        typeof game.points !== 'number' ||
        !Number.isFinite(game.points)
      )
        continue;
      const key = this.key(timestamp, game.points);
      if (!games.has(key)) games.set(key, new Set());
      games.get(key)!.add(game.gameToken);
    }
  }
  lookup(map: string, timestamp: number, points: number) {
    return this.maps.get(map)?.get(this.key(timestamp, points));
  }
}

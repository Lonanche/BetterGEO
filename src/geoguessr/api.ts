import { historyResponse, finishedDuelResponse } from './responses';
import { countryCodes } from './countries';
import { ScoreIndex } from './scores';
import { RaceTrackerClient } from './race-tracker';
import type {
  Duel,
  GameHistory,
  PageWindow,
  UserModerationStatus,
  RankedCountryStats,
} from './types';
/** Deduplicate concurrent calls and briefly cache successful reads. Errors are never cached. */
export class RequestCache {
  private entries = new Map<string, { promise: Promise<unknown>; expires: number }>();
  get<T>(key: string, load: () => Promise<T>, ttl = 30_000): Promise<T> {
    const existing = this.entries.get(key);
    if (existing && existing.expires > Date.now()) return existing.promise as Promise<T>;
    const entry = { promise: Promise.resolve().then(load) as Promise<unknown>, expires: Infinity };
    this.entries.set(key, entry);
    entry.promise.then(
      () => {
        entry.expires = Date.now() + ttl;
        if (this.entries.size > 100)
          for (const [key, cached] of this.entries) {
            if (cached.expires !== Infinity) this.entries.delete(key);
            if (this.entries.size <= 100) break;
          }
      },
      () => {
        if (this.entries.get(key) === entry) this.entries.delete(key);
      },
    );
    return entry.promise as Promise<T>;
  }
}
export class GeoGuessrApi {
  readonly scores = new ScoreIndex();
  private cache = new RequestCache();
  private raceTracker = new RaceTrackerClient();
  constructor(private page: PageWindow) {}
  onlineRacePlayers(signal?: AbortSignal, force = false) {
    return this.raceTracker.get(signal, force);
  }
  private async json(path: string, label: string, options: RequestInit = {}): Promise<unknown> {
    const response = await this.page.fetch(path, {
      credentials: 'same-origin',
      signal: AbortSignal.timeout(20_000),
      ...options,
    });
    if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
    return response.json();
  }
  async randomMapUrl(): Promise<string> {
    // Random choices must bypass both our read cache and the browser HTTP cache.
    const data = await this.json('/api/v3/social/maps/browse/random', 'Random map API', {
      cache: 'no-store',
    });
    if (!data || typeof data !== 'object' || !('url' in data) || typeof data.url !== 'string')
      throw new Error('Random map URL unavailable.');
    const url = new URL(data.url.trim(), this.page.location.origin);
    if (
      url.origin !== this.page.location.origin ||
      !/^\/maps\/[^/]+\/?$/.test(url.pathname) ||
      url.username ||
      url.password
    )
      throw new Error('Unexpected random map URL.');
    return url.href;
  }
  userStatus(userId: string): Promise<UserModerationStatus> {
    return this.cache.get(`user-status:${userId}`, async () => {
      const data = await this.json(`/api/v3/users/${encodeURIComponent(userId)}`, 'Profile API');
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Unexpected profile response.');
      const user = data as Record<string, unknown>;
      if (
        (user.isBanned !== undefined && typeof user.isBanned !== 'boolean') ||
        (user.suspendedUntil !== undefined &&
          user.suspendedUntil !== null &&
          typeof user.suspendedUntil !== 'string')
      )
        throw new Error('Unexpected moderation status.');
      return {
        isBanned: user.isBanned as boolean | undefined,
        suspendedUntil: user.suspendedUntil as string | null | undefined,
      };
    });
  }
  rankedCountries(userId: string): Promise<RankedCountryStats> {
    return this.cache.get(`ranked-countries:${userId}`, async () => {
      const data = await this.json(
        `/api/v4/ranked-system/progress/${encodeURIComponent(userId)}`,
        'Ranked progress API',
      );
      if (!data || typeof data !== 'object' || Array.isArray(data))
        throw new Error('Unexpected ranked progress response.');
      const progress = data as Record<string, unknown>;
      return {
        bestCountries: countryCodes(progress.bestCountries),
        worstCountries: countryCodes(progress.worstCountries),
      };
    });
  }
  history(userId: string): Promise<GameHistory> {
    return this.cache.get(`history:${userId}`, async () => {
      const data = await this.json(
        `/api/v4/game-history/${encodeURIComponent(userId)}?gameMode=None`,
        'History API',
      );
      return historyResponse(data);
    });
  }
  finishedDuel(id: string): Promise<Duel> {
    return this.cache.get(
      `duel:${id}`,
      () =>
        new Promise<Duel>((resolve, reject) => {
          GM_xmlhttpRequest({
            method: 'GET',
            url: `https://game-server.geoguessr.com/api/duels/${encodeURIComponent(id)}`,
            timeout: 20_000,
            onload(response) {
              try {
                if (response.status !== 200) throw new Error(`Duel API: HTTP ${response.status}`);
                resolve(finishedDuelResponse(JSON.parse(response.responseText), id));
              } catch (error) {
                reject(error);
              }
            },
            onerror: () => reject(new Error('Duel API request failed.')),
            ontimeout: () => reject(new Error('Duel API request timed out.')),
            onabort: () => reject(new Error('Duel API request aborted.')),
          });
        }),
    );
  }
}

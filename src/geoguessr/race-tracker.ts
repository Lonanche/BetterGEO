import type { RaceParticipant, RaceProjection } from './online-race';

export const raceTrackerUrl = 'https://elorace.lonanche.workers.dev';
export const raceTrackerApi = `${raceTrackerUrl}/api/v1/standings`;
const FIVE_MINUTES = 300_000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Unexpected race tracker data.');
  return value as Record<string, unknown>;
}
function integer(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum)
    throw new Error('Invalid race tracker number.');
  return value;
}
function optionalInteger(value: unknown): number | undefined {
  return value === null ? undefined : integer(value);
}

/** Trust only explicitly validated fields; render nicknames as text, never HTML. */
export function raceTrackerPlayers(data: unknown, now = Date.now()) {
  const root = object(data);
  const updatedAt = integer(root.updatedAt, 1);
  if (
    root.schemaVersion !== 1 ||
    updatedAt > now + FIVE_MINUTES ||
    typeof root.stale !== 'boolean' ||
    typeof root.completed !== 'boolean' ||
    !Array.isArray(root.players) ||
    !root.players.length ||
    root.players.length > 1000
  )
    throw new Error('Unexpected race tracker snapshot.');
  const weekIndex = integer(root.weekIndex);
  if (weekIndex > 3) throw new Error('Invalid race week.');
  const waitingForWeek = root.waitingForWeek === null ? null : integer(root.waitingForWeek, 1);
  const stale = root.stale || (!root.completed && now - updatedAt > 2 * FIVE_MINUTES);
  const players = new Map<string, RaceParticipant>();
  for (const value of root.players) {
    const p = object(value);
    if (
      typeof p.id !== 'string' ||
      !/^[a-f0-9]{24}$/i.test(p.id) ||
      players.has(p.id) ||
      typeof p.nick !== 'string' ||
      p.nick.length > 200 ||
      !['EMEA', 'APAC', 'Americas'].includes(String(p.region)) ||
      !Array.isArray(p.points) ||
      p.points.length !== 4 ||
      typeof p.eligible !== 'boolean'
    )
      throw new Error('Invalid race tracker player.');
    const games = integer(p.gamesPlayed),
      weekPoints = integer(p.weekPoints);
    if ((games < 10 && weekPoints !== 0) || p.eligible !== games >= 10)
      throw new Error('Invalid race eligibility.');
    const projection: RaceProjection = {
      position: integer(p.position, 1),
      total: integer(p.projectedPoints),
      weekPoints,
      weekIndex,
      gamesWeek: String(games),
      updatedAt,
      stale,
      waitingForWeek,
      completed: root.completed,
    };
    const official = p.officialPosition === null ? undefined : integer(p.officialPosition, 1);
    players.set(p.id, {
      region: String(p.region),
      name: `World League 2027 race - ${p.region}`,
      nick: p.nick,
      avatar:
        typeof p.avatar === 'string' && /^pin\/[\w.-]+$/.test(p.avatar) ? p.avatar : undefined,
      countryCode:
        typeof p.countryCode === 'string' && /^[a-z]{2}$/i.test(p.countryCode)
          ? p.countryCode.toLowerCase()
          : undefined,
      position: official,
      total: integer(p.officialPoints),
      points: p.points.map((n) => integer(n)),
      rating: optionalInteger(p.rating),
      projection,
    });
  }
  const nextRefreshAt = integer(root.nextRefreshAt, 1);
  return {
    players,
    expires: stale
      ? now + 60_000
      : Math.min(now + FIVE_MINUTES, Math.max(now + 10_000, nextRefreshAt)),
  };
}

function requestSnapshot(signal: AbortSignal): Promise<unknown> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    let request: { abort(): void } | undefined;
    let settled = false;
    const finish = (error?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(value);
    };
    const abort = () => {
      finish(new Error('Race tracker request aborted.'));
      request?.abort();
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      request = GM_xmlhttpRequest({
        method: 'GET',
        url: raceTrackerApi,
        timeout: 20_000,
        anonymous: true,
        onload(response) {
          try {
            if (response.status !== 200) throw new Error(`Race tracker: HTTP ${response.status}`);
            if (response.responseText.length > 2_000_000)
              throw new Error('Race tracker response is too large.');
            finish(undefined, JSON.parse(response.responseText));
          } catch (error) {
            finish(error instanceof Error ? error : new Error('Invalid race tracker response.'));
          }
        },
        onerror: () => finish(new Error('Race tracker request failed.')),
        ontimeout: () => finish(new Error('Race tracker request timed out.')),
        onabort: () => finish(new Error('Race tracker request aborted.')),
      });
    } catch {
      finish(new Error('Race tracker request failed.'));
    }
  });
}

/** One anonymous request shared by badges and the tab, with independent cancellation. */
export class RaceTrackerClient {
  private cache?: ReturnType<typeof raceTrackerPlayers>;
  private pending?: {
    controller: AbortController;
    promise: Promise<Map<string, RaceParticipant>>;
    readers: number;
  };
  get(signal?: AbortSignal, force = false): Promise<Map<string, RaceParticipant>> {
    if (signal?.aborted) return Promise.reject(new Error('Race tracker request aborted.'));
    if (!force && this.cache && this.cache.expires > Date.now())
      return Promise.resolve(this.cache.players);
    let pending = this.pending;
    if (!pending) {
      const controller = new AbortController();
      pending = { controller, readers: 0, promise: Promise.resolve(new Map()) };
      const current = pending;
      current.promise = requestSnapshot(controller.signal)
        .then((data) => {
          controller.signal.throwIfAborted();
          const parsed = raceTrackerPlayers(data);
          this.cache = parsed;
          return parsed.players;
        })
        .finally(() => {
          if (this.pending === current) this.pending = undefined;
        });
      this.pending = current;
    }
    const current = pending;
    current.readers++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const finish = (error?: unknown, players?: Map<string, RaceParticipant>) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener('abort', abort);
        if (--current.readers === 0 && this.pending === current) {
          this.pending = undefined;
          current.controller.abort();
        }
        if (error) reject(error);
        else resolve(players!);
      };
      const abort = () => finish(new Error('Race tracker request aborted.'));
      signal?.addEventListener('abort', abort, { once: true });
      current.promise.then(
        (players) => finish(undefined, players),
        (error) => finish(error),
      );
    });
  }
}

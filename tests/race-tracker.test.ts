import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  raceTrackerPlayers,
  RaceTrackerClient,
  raceTrackerApi,
} from '../src/geoguessr/race-tracker';
const id = 'a'.repeat(24);
function snapshot() {
  const now = Date.now();
  return {
    schemaVersion: 1,
    weekIndex: 1,
    updatedAt: now,
    nextRefreshAt: now + 300000,
    stale: false,
    completed: false,
    waitingForWeek: null as number | null,
    players: [
      {
        id,
        nick: '<b>Alice</b>',
        region: 'EMEA',
        officialPosition: 7,
        position: 2,
        officialPoints: 10,
        projectedPoints: 31,
        weekPoints: 21,
        gamesPlayed: 10,
        eligible: true,
        rating: 1800 as number | null,
        points: [10, 0, 0, 0],
        countryCode: 'DE',
        avatar: 'pin/a.png',
      },
    ],
  };
}
function mockRequest(
  callback: (details: Parameters<typeof GM_xmlhttpRequest>[0]) => { abort(): void },
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'GM_xmlhttpRequest');
  Reflect.set(globalThis, 'GM_xmlhttpRequest', callback);
  return () => {
    if (previous) Object.defineProperty(globalThis, 'GM_xmlhttpRequest', previous);
    else Reflect.deleteProperty(globalThis, 'GM_xmlhttpRequest');
  };
}
test('tracker maps official and projected ranks by ID and preserves missing Elo', () => {
  const data = snapshot();
  data.players[0]!.rating = null;
  const players = raceTrackerPlayers(data).players;
  const p = players.get(id)!;
  assert.equal(p.position, 7);
  assert.equal(p.projection!.position, 2);
  assert.equal(p.projection!.total, 31);
  assert.equal(p.total, 10);
  assert.equal(p.rating, undefined);
  assert.equal(p.countryCode, 'de');
  assert.equal(p.nick, '<b>Alice</b>');
  data.stale = true;
  data.waitingForWeek = 1792972800000;
  assert.equal(raceTrackerPlayers(data).players.get(id)!.projection!.stale, true);
  assert.equal(raceTrackerPlayers(data).players.get(id)!.projection!.waitingForWeek, 1792972800000);
});
test('tracker rejects wrong schema, malformed/duplicate players and invalid eligibility', () => {
  assert.throws(() => raceTrackerPlayers({ ...snapshot(), schemaVersion: 2 }));
  assert.throws(() => raceTrackerPlayers({ ...snapshot(), updatedAt: Date.now() + 600000 }));
  const data = snapshot();
  data.players.push(data.players[0]!);
  assert.throws(() => raceTrackerPlayers(data));
  const invalid = snapshot();
  invalid.players[0]!.gamesPlayed = 9;
  assert.throws(() => raceTrackerPlayers(invalid));
  assert.throws(() => raceTrackerPlayers({ players: [] }));
});
test('shared cache uses one anonymous request, force reloads, and errors never replace good data', async () => {
  let requests = 0,
    fail = false;
  const restore = mockRequest((details) => {
    requests++;
    assert.equal(details.url, raceTrackerApi);
    assert.equal(details.anonymous, true);
    queueMicrotask(() =>
      details.onload({ status: fail ? 503 : 200, responseText: JSON.stringify(snapshot()) }),
    );
    return { abort() {} };
  });
  try {
    const client = new RaceTrackerClient();
    const [first, second] = await Promise.all([client.get(), client.get()]);
    assert.equal(first, second);
    assert.equal(requests, 1);
    await client.get();
    assert.equal(requests, 1);
    await client.get(undefined, true);
    assert.equal(requests, 2);
    fail = true;
    await assert.rejects(client.get(undefined, true), /HTTP 503/);
    await client.get();
    assert.equal(requests, 3);
  } finally {
    restore();
  }
});
test('independent consumers cancel safely; transport aborts only after every reader leaves', async () => {
  let aborted = 0;
  let response: Parameters<typeof GM_xmlhttpRequest>[0] | undefined;
  const restore = mockRequest((details) => {
    response = details;
    return {
      abort() {
        aborted++;
        details.onabort();
      },
    };
  });
  try {
    const client = new RaceTrackerClient(),
      one = new AbortController(),
      two = new AbortController();
    const a = client.get(one.signal),
      b = client.get(two.signal);
    one.abort();
    await assert.rejects(a, /aborted/);
    assert.equal(aborted, 0);
    response!.onload({ status: 200, responseText: JSON.stringify(snapshot()) });
    assert.equal((await b).size, 1);
    assert.equal(aborted, 0);
    const all = new AbortController();
    const pending = client.get(all.signal, true);
    all.abort();
    await assert.rejects(pending, /aborted/);
    assert.equal(aborted, 1);
  } finally {
    restore();
  }
});
test('transport rejects malformed JSON, oversized payloads and timeouts', async () => {
  for (const result of ['malformed', 'oversized', 'timeout']) {
    const restore = mockRequest((details) => {
      queueMicrotask(() =>
        result === 'timeout'
          ? details.ontimeout()
          : details.onload({
              status: 200,
              responseText: result === 'malformed' ? 'not JSON' : 'a'.repeat(2000001),
            }),
      );
      return { abort() {} };
    });
    try {
      await assert.rejects(new RaceTrackerClient().get());
    } finally {
      restore();
    }
  }
});

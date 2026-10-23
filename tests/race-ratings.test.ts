import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectRaceRatings,
  raceRatingsMaxPages,
  raceRatingsPageSize,
} from '../src/geoguessr/race-ratings';

const signal = () => new AbortController().signal;
const page = (offset: number) =>
  Array.from({ length: raceRatingsPageSize }, (_, i) => ({
    userId: String(offset + i),
    rating: 2000 - offset - i,
  }));

test('race ratings paginate globally and stop as soon as all participants are found', async () => {
  const offsets: number[] = [];
  const result = await collectRaceRatings(
    new Set(['1', '105']),
    async (offset, limit) => {
      assert.equal(limit, 100);
      offsets.push(offset);
      return page(offset);
    },
    signal(),
  );
  assert.deepEqual(offsets, [0, 100]);
  assert.deepEqual(
    [...result.ratings],
    [
      ['1', 1999],
      ['105', 1895],
    ],
  );
});

test('race ratings preserve missing players and stop at the end, repeated pages, or request limit', async () => {
  let calls = 0;
  const result = await collectRaceRatings(
    new Set(['1', 'missing']),
    async (offset) => {
      calls++;
      return offset ? [] : page(0);
    },
    signal(),
  );
  assert.equal(calls, 2);
  assert.equal(result.ratings.has('missing'), false);
  calls = 0;
  await collectRaceRatings(
    new Set(['missing']),
    async () => {
      calls++;
      return page(0);
    },
    signal(),
  );
  assert.equal(calls, 2);
  calls = 0;
  await collectRaceRatings(
    new Set(['missing']),
    async (offset) => {
      calls++;
      return page(offset);
    },
    signal(),
  );
  assert.equal(calls, raceRatingsMaxPages);
});

test('race ratings reject malformed responses and stop work when aborted', async () => {
  await assert.rejects(
    collectRaceRatings(new Set(['1']), async () => ({}), signal()),
    /Unexpected/,
  );
  await assert.rejects(
    collectRaceRatings(new Set(['1']), async () => [{ userId: '1', rating: null }], signal()),
    /Unexpected/,
  );
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    collectRaceRatings(
      new Set(['missing']),
      async () => {
        calls++;
        controller.abort();
        return page(0);
      },
      controller.signal,
    ),
    { name: 'AbortError' },
  );
  assert.equal(calls, 1);
});

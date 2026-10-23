import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { refreshRaceBadge } from '../src/features/race-badge';
import type { RaceParticipant } from '../src/geoguessr/online-race';
function player(): RaceParticipant {
  return {
    nick: 'Alice',
    region: 'EMEA',
    name: 'Race EMEA',
    position: 7,
    total: 25,
    points: [25, 0, 0, 0],
    projection: {
      position: 2,
      total: 46,
      weekIndex: 1,
      weekPoints: 21,
      gamesWeek: '12',
      updatedAt: Date.now(),
    },
  };
}
test('tooltip distinguishes official completed weeks from the current projected week and its games', () => {
  const dom = new JSDOM();
  try {
    const badge = dom.window.document.createElement('span');
    refreshRaceBadge(badge, player());
    assert.equal(badge.textContent, 'EMEA #2');
    assert.match(badge.title, /Week 1: 25 points \(official\)/);
    assert.match(badge.title, /Week 2: 21 points \(projected\) · Games played: 12/);
    assert.doesNotMatch(badge.title, /Week 2: 0 points|Week 3:|Week 4:/);
    assert.equal(badge.getAttribute('aria-label'), badge.title);
  } finally {
    dom.window.close();
  }
});
test('previous-week and completed snapshots keep their actual week labels', () => {
  const dom = new JSDOM();
  try {
    const badge = dom.window.document.createElement('span'),
      p = player();
    p.projection!.weekIndex = 0;
    p.projection!.waitingForWeek = 1792972800000;
    refreshRaceBadge(badge, p);
    assert.match(badge.title, /Waiting for this week’s leaderboard/);
    assert.match(badge.title, /Week 1: 21 points \(projected\) · Games played: 12/);
    assert.doesNotMatch(badge.title, /Week 2:/);
    p.projection!.waitingForWeek = null;
    p.projection!.completed = true;
    p.projection!.weekIndex = 3;
    refreshRaceBadge(badge, p);
    assert.match(badge.title, /Week 4: 21 points \(completed snapshot\) · Games played: 12/);
    assert.doesNotMatch(badge.title, /If week 4 ended now/);
  } finally {
    dom.window.close();
  }
});

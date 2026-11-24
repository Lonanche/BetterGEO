import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { RequestCache, GeoGuessrApi } from '../src/geoguessr/api';
import { ScoreIndex } from '../src/geoguessr/scores';
import { summaryProps, summaryShape } from '../src/geoguessr/summary';
import { duelId, mapId, profileId } from '../src/geoguessr/routes';
import { Scope } from '../src/core/scope';
import { Network } from '../src/core/network';
import { PageEvents } from '../src/core/page';
import { FeatureManager } from '../src/core/settings';
import { gameResults } from '../src/features/game-results';
import { matchHistory } from '../src/features/match-history';
import { summaryRecovery } from '../src/features/summary-recovery';
import type { Duel, GameHistory, PageWindow } from '../src/geoguessr/types';
import type { Services } from '../src/core/feature';
import * as css from '../src/geoguessr/styles';
import { cls, nativeCss, sel } from './native';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const fixtures = new Set<() => void>();
afterEach(() => {
  for (const close of fixtures) close();
});
/** A GeoGuessr page; its stylesheets are loaded unless `styled` is false. */
function fixture(path: string, html = '', { styled = true } = {}) {
  const dom = new JSDOM((styled ? nativeCss : '') + html, {
    url: `https://www.geoguessr.com${path}`,
    pretendToBeVisual: true,
  });
  const page = dom.window as unknown as PageWindow;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['GM_getValue', 'GM_setValue', 'GM_xmlhttpRequest'])
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of [
    'window',
    'document',
    'location',
    'MutationObserver',
    'HTMLElement',
    'Element',
    'Node',
    'DOMParser',
    'requestAnimationFrame',
  ]) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    const value = name === 'window' ? page : Reflect.get(page, name);
    Reflect.set(
      globalThis,
      name,
      typeof value === 'function' && name === 'requestAnimationFrame' ? value.bind(page) : value,
    );
  }
  page.Response = Response;
  page.fetch = async () => new Response('{}');
  // jsdom has no React: report the page as past the hydration fallback.
  Object.defineProperty(page.performance, 'now', { value: () => 60_000, writable: true });
  const events = new PageEvents(page),
    network = new Network(page),
    api = new GeoGuessrApi(page);
  const services: Services = { page, events, network, api };
  const close = () => {
    if (!fixtures.delete(close)) return;
    events.dispose();
    network.dispose();
    dom.window.close();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  };
  fixtures.add(close);
  return { ...services, close };
}
const id = 'a'.repeat(24);
const duel: Duel = {
  gameId: id,
  status: 'Finished',
  rounds: [
    {
      roundNumber: 1,
      endTime: '2026-01-01T12:00:00Z',
      panorama: { lat: 1, lng: 2 },
      damageMultiplier: 2,
    },
    { roundNumber: 2, lat: 99, lng: 99 },
  ],
  teams: [{ id: 'one', players: [{ playerId: 'user' }], roundResults: [{ roundNumber: 1 }] }],
};
test('shared cache deduplicates concurrent reads and retries errors', async () => {
  const cache = new RequestCache();
  let calls = 0;
  const load = async () => {
    calls++;
    return { value: 1 };
  };
  const [a, b] = await Promise.all([cache.get('same', load), cache.get('same', load)]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  await assert.rejects(
    cache.get('bad', async () => {
      throw new Error('offline');
    }),
  );
  assert.equal(await cache.get('bad', async () => 42), 42);
});

test('summary excludes unplayed locations and preserves other loader props', () => {
  const result = summaryShape(duel);
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0]?.multiplier, 2);
  assert.equal(result.rounds[0]?.panorama.lat, 1);
  assert.equal(result.options.maxRoundTime, 0);
  const props = summaryProps(duel, 'user', { statusCode: 404, seo: { title: 'Duel' } });
  assert.equal(props.statusCode, 200);
  assert.equal(props.userId, 'user');
  assert.deepEqual(props.seo, { title: 'Duel' });
  assert.equal((props.game as { gameId: string }).gameId, id);
});

test('routes support locales and team duels without matching replay pages', () => {
  assert.equal(duelId(`/en/team-duels/${id}/summary`), id);
  assert.equal(duelId(`/duels/${id}/replay`), undefined);
  assert.equal(profileId('/en/user/person'), 'person');
  assert.equal(mapId('/en/maps/world'), 'world');
});

test('one network hook supports observation, temporary interception, and restoration', async () => {
  const f = fixture('/');
  let seen = 0;
  const off = f.network.observe(
    (url) => url.pathname === '/api/test',
    (_, data) => {
      assert.deepEqual(data, {});
      seen++;
    },
  );
  await f.page.fetch('/api/test');
  await tick();
  assert.equal(seen, 1);
  const remove = f.network.intercept((url) =>
    url.pathname === '/summary' ? new Response('{"recovered":true}') : undefined,
  );
  assert.deepEqual(await (await f.page.fetch('/summary')).json(), { recovered: true });
  remove();
  assert.deepEqual(await (await f.page.fetch('/summary')).json(), {});
  off();
  await f.page.fetch('/api/test');
  await tick();
  assert.equal(seen, 1);
  f.close();
});

test('result links are added, removed for ambiguity, and cleaned on disable', async () => {
  const f = fixture(
    '/maps/world',
    `<div id="row"><button class="${cls(css.mapScores, 'row')}" aria-expanded="false"><span class="${cls(css.mapScores, 'cellDate')}"><span title="2026-01-01T00:00:00Z">date</span></span><span class="${cls(css.mapScores, 'cellPoints')}">25,000 pts</span><i>arrow</i></button></div>`,
  );
  const scope = new Scope();
  const item = { playedAt: '2026-01-01T00:00:00Z', points: 25000, gameToken: 'one' };
  f.api.scores.accept('/api/v3/scores/world/me/games', { items: [item] });
  gameResults.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(
    document.querySelector('a')?.getAttribute('href'),
    'https://www.geoguessr.com/results/one',
  );
  scope.dispose();
  assert.equal(document.querySelector('.gg-result-action'), null);
  assert.equal(document.querySelector('.gg-result-row'), null);
  const second = new Scope();
  gameResults.enable(f, second);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.ok(document.querySelector('.gg-result-action'));
  f.api.scores.accept('/api/v3/scores/world/me/games', { items: [{ ...item, gameToken: 'two' }] });
  f.events.schedule();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelector('.gg-result-action'), null);
  second.dispose();
  assert.equal(document.querySelector('.gg-result-row'), null);
  f.close();
});

function history(user: string): GameHistory {
  return {
    entries: [
      {
        gameId: id,
        players: [{ id: user, nick: '<img src=x onerror=alert(1)>', rating: 0 }],
        duel: { winnerId: user, gameMode: 'NmpzDuels' },
      },
    ],
  };
}
test('profile requests cannot insert stale widgets after navigation or disabling', async () => {
  const f = fixture('/user/old', `<div class="${cls(css.profile, 'staticWidgets')}"></div>`);
  const pending = new Map<string, (data: GameHistory) => void>();
  f.api.history = (user) => new Promise((resolve) => pending.set(user, resolve));
  const scope = new Scope();
  matchHistory.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  f.page.history.pushState({}, '', '/user/new');
  await new Promise((resolve) => setTimeout(resolve, 110));
  pending.get('old')!(history('old'));
  await tick();
  assert.equal(document.getElementById('bettergeo-match-history'), null);
  pending.get('new')!(history('new'));
  await tick();
  const widget = document.getElementById('bettergeo-match-history');
  assert.ok(widget);
  assert.ok(widget.textContent?.includes('<img src=x'));
  assert.equal(widget.querySelector('[onerror]'), null);
  scope.dispose();
  assert.equal(document.getElementById('bettergeo-match-history'), null);
  const second = new Scope();
  matchHistory.enable(f, second);
  await new Promise((resolve) => setTimeout(resolve, 110));
  second.dispose();
  pending.get('new')!(history('new'));
  await tick();
  assert.equal(document.getElementById('bettergeo-match-history'), null);
  f.close();
});

const errorMarkup = `<div class="${cls(css.errorPage, 'errorPage')}"><h1>Game not found</h1><p>This game couldn't be found</p></div>`;
function summaryRouter(invalidate: () => Promise<unknown>, routeId = '/duels/$token/summary') {
  return {
    state: { matches: [{ routeId, loaderData: { props: { statusCode: 404, seo: { t: 1 } } } }] },
    invalidate,
  };
}
const loaderUrl = (route: string, href: string) =>
  `/_serverFn/abc123?payload=${encodeURIComponent(JSON.stringify({ data: { routeId: route, href } }))}`;
test('summary uses shared middleware and disabling blocks late recovery', async () => {
  const f = fixture(`/duels/${id}/summary`, errorMarkup);
  let resolve!: (game: Duel) => void;
  let invalidations = 0;
  f.api.finishedDuel = () =>
    new Promise((done) => {
      resolve = done;
    });
  f.api.currentUserId = async () => 'user';
  f.page.__TSR_ROUTER__ = summaryRouter(async () => {
    invalidations++;
  });
  const scope = new Scope();
  summaryRecovery.enable(f, scope);
  await new Promise((done) => setTimeout(done, 110));
  assert.ok(document.querySelector('[data-summary-recovery]'));
  scope.dispose();
  resolve(duel);
  await tick();
  assert.equal(invalidations, 0);
  assert.equal(document.querySelector('[data-summary-recovery]'), null);
  f.close();
});

test('settings persist toggles and release each feature enable cycle exactly once', () => {
  const f = fixture('/');
  let enabled = 0,
    disposed = 0;
  let saved: unknown;
  Reflect.set(globalThis, 'GM_getValue', () => ({ example: false }));
  Reflect.set(globalThis, 'GM_setValue', (_: string, value: unknown) => {
    saved = value;
  });
  const manager = new FeatureManager(
    [
      {
        id: 'example',
        name: 'Example',
        description: '',
        enable(_, scope) {
          enabled++;
          scope.own(() => {
            disposed++;
          });
        },
      },
    ],
    f,
  );
  manager.start();
  assert.equal(enabled, 0);
  manager.set('example', true);
  manager.set('example', true);
  assert.equal(enabled, 1);
  manager.set('example', false);
  assert.equal(disposed, 1);
  assert.deepEqual(saved, { example: false });
  f.close();
});

test('summary recovery answers only its own loader request and leaves the URL alone', async () => {
  const f = fixture(`/en/team-duels/${id}/summary?keep=1`, errorMarkup);
  f.api.finishedDuel = async () => duel;
  f.api.currentUserId = async () => 'user';
  let payload: Record<string, unknown> | undefined;
  const own = loaderUrl('team-duels/[token]/summary', `/en/team-duels/${id}/summary?keep=1`);
  f.page.__TSR_ROUTER__ = summaryRouter(async () => {
    // Other loaders, and summaries of other games, still reach GeoGuessr.
    assert.deepEqual(await (await f.page.fetch(loaderUrl('_root', '/'))).json(), {});
    const other = loaderUrl('team-duels/[token]/summary', '/team-duels/other/summary');
    assert.deepEqual(await (await f.page.fetch(other)).json(), {});
    payload = (await (await f.page.fetch(own)).json()) as Record<string, unknown>;
    document.querySelector(sel(css.errorPage, 'errorPage'))?.remove();
  }, '/team-duels/$token/summary');
  const scope = new Scope();
  summaryRecovery.enable(f, scope);
  await new Promise((done) => setTimeout(done, 190));
  assert.equal(payload?.statusCode, 200);
  assert.equal(payload?.userId, 'user');
  assert.deepEqual(payload?.seo, { t: 1 });
  assert.equal((payload?.game as { gameId: string }).gameId, id);
  assert.equal(location.pathname + location.search, `/en/team-duels/${id}/summary?keep=1`);
  assert.deepEqual(await (await f.page.fetch(own)).json(), {});
  scope.dispose();
  f.close();
});

test('summary recovery reports failures on the error page', async () => {
  const f = fixture(`/duels/${id}/summary`, errorMarkup);
  f.api.finishedDuel = async () => duel;
  f.api.currentUserId = async () => {
    throw new Error('Sign in to recover this summary.');
  };
  f.page.__TSR_ROUTER__ = summaryRouter(async () => {});
  const log = console.error;
  console.error = () => {};
  const scope = new Scope();
  try {
    summaryRecovery.enable(f, scope);
    await new Promise((done) => setTimeout(done, 130));
    assert.match(
      document.querySelector('[data-summary-recovery]')?.textContent ?? '',
      /Could not display this summary: Sign in/,
    );
  } finally {
    console.error = log;
    scope.dispose();
    f.close();
  }
});

test('React-owned markup is left alone until React hydrates it', async () => {
  const f = fixture('/');
  const { hydrated } = await import('../src/core/page');
  const early = { performance: { now: () => 100 } } as Window;
  const node = document.createElement('div');
  assert.equal(hydrated(node, early), false);
  Object.assign(node, { __reactFiber$abc123: {} });
  assert.equal(hydrated(node, early), true);
  assert.equal(
    hydrated(document.createElement('div'), { performance: { now: () => 60_000 } } as Window),
    true,
  );
  assert.equal(hydrated(null, early), false);
  f.close();
});

test('class names parse in both the current Vite format and the old Next.js format', async () => {
  const { parseClass } = await import('../src/core/native-styles');
  assert.deepEqual(parseClass('_widgetRow_63pfr_232'), { module: '63pfr', local: 'widgetRow' });
  assert.deepEqual(parseClass('_gameData_side_1txp7_9'), {
    module: '1txp7',
    local: 'gameData_side',
  });
  assert.deepEqual(parseClass('profile-v2_widgetRow__n1A_N'), {
    module: 'profile-v2',
    local: 'widgetRow',
  });
  assert.deepEqual(parseClass('widget_header___ZOfT'), { module: 'widget', local: 'header' });
  assert.equal(parseClass('bettergeo-history'), undefined);
});

test('modules resolve by signature, tell same-named classes apart, and break ties by stylesheet', async () => {
  const f = fixture(
    '/',
    // Two modules export `header`; a third duplicates the nick module in another sheet.
    '<style>._header_aaaaa_1{}._widgetInner_aaaaa_2{}._rightSlot_aaaaa_3{}._header_bbbbb_1{}._widgetData_bbbbb_2{}</style>' +
      '<style>._root_ccccc_1{}._identity_ccccc_2{}._nick_ccccc_3{}</style>' +
      '<style>._card_ddddd_1{}._gameData_ddddd_2{}._root_eeeee_1{}._identity_eeeee_2{}._nick_eeeee_3{}</style>',
    { styled: false },
  );
  const { nativeStyles } = await import('../src/core/native-styles');
  const styles = nativeStyles();
  const frame = { name: 'frame', signature: ['header', 'widgetInner', 'rightSlot'] };
  const body = { name: 'body', signature: ['header', 'widgetData'] };
  assert.equal(styles.module(frame).cls('header'), '_header_aaaaa_1');
  assert.equal(styles.module(body).cls('header'), '_header_bbbbb_1');
  const item = { name: 'item', signature: ['card', 'gameData'] };
  const nick = { name: 'nick', signature: ['root', 'identity', 'nick'], near: item };
  assert.equal(styles.module(nick).cls('nick'), '_nick_eeeee_3');
  assert.equal(styles.module(frame).styled, true);
  f.close();
});

test('unloaded modules fall back to format-agnostic selectors and add no classes', async () => {
  const f = fixture('/', '<div class="_widgetRow_zzzzz_9"></div>', { styled: false });
  const { nativeStyles, nativeSelector } = await import('../src/core/native-styles');
  const profile = nativeStyles().module(css.profile);
  assert.equal(profile.styled, false);
  assert.equal(profile.cls('staticWidgets'), '');
  assert.equal(nativeSelector(css.profile, 'widgetRow'), '[class*="_widgetRow_"]');
  assert.ok(document.querySelector(nativeSelector(css.profile, 'widgetRow')));
  // Old Next.js class names match the same selector.
  document.body.innerHTML = '<div class="profile-v2_widgetRow__n1A_N"></div>';
  assert.ok(document.querySelector(nativeSelector(css.profile, 'widgetRow')));
  f.close();
});

test('the test stylesheet resolves every registry module to its own classes', async () => {
  const f = fixture('/');
  const { nativeStyles } = await import('../src/core/native-styles');
  const styles = nativeStyles();
  for (const spec of css.allModules) {
    const module = styles.module(spec);
    assert.equal(module.styled, true, spec.name);
    assert.equal(module.cls(...spec.signature), cls(spec, ...spec.signature), spec.name);
  }
  f.close();
});

test('native history layout mirrors players, links cards to summaries, and browses safely', async () => {
  const f = fixture(
    '/user/me',
    '<div data-qa="user-card-title"><h1><div class="_wrapper_nnnnn_2"><span class="_nick_nnnnn_3">Me</span><img title="France" class="_flag_nnnnn_4"></div></h1></div>',
  );
  const { historyView } = await import('../src/features/match-history-view');
  const entries: GameHistory['entries'] = [
    {
      gameId: 'first',
      players: [
        { id: 'other', nick: 'Opponent' },
        { id: 'me', nick: 'Me', rating: 0, pin: { url: 'pin/me.png' } },
      ],
      duel: { winnerId: 'me', gameMode: 'NoMoveDuels' },
    },
    {
      gameId: 'second',
      players: [
        { id: 'me', nick: 'Me' },
        { id: 'other', nick: 'Opponent' },
      ],
      duel: { winnerId: 'other', gameMode: 'NmpzDuels' },
    },
  ];
  let opened = 0;
  const widget = historyView(entries, 'me', () => {
    opened++;
  });
  document.body.append(widget);
  const left = widget.querySelector(sel(css.historyItem, 'gameDataSideLeft'))!;
  const right = widget.querySelector(sel(css.historyItem, 'gameDataSideRight'))!;
  assert.ok(left.firstElementChild?.classList.contains(cls(css.historyPlayer, 'left')));
  assert.ok(left.lastElementChild?.classList.contains(cls(css.historyItem, 'avatarCell')));
  const portrait = left.querySelector<HTMLImageElement>(
    `${sel(css.avatar, 'titleAvatarImage')} img`,
  )!;
  assert.ok(portrait.classList.contains(cls(css.avatar, 'image')));
  assert.equal(portrait.getAttribute('src'), '/images/resize:fit:96:0/gravity:ce/plain/pin/me.png');
  assert.ok(left.querySelector(sel(css.avatar, 'titleAvatarBorderImage')));
  assert.ok(right.firstElementChild?.classList.contains(cls(css.historyItem, 'avatarCell')));
  const nick = left.querySelector('a')!;
  assert.equal(nick.textContent, 'Me');
  // Nick classes are borrowed from the profile header's native nick.
  assert.ok(nick.classList.contains('_nick_nnnnn_3'));
  assert.ok(nick.classList.contains(cls(css.historyNick, 'nick')));
  assert.ok(nick.parentElement?.classList.contains('_wrapper_nnnnn_2'));
  assert.ok(left.textContent?.includes('VICTORY!'));
  assert.ok(left.textContent?.includes('Rating 0'));
  assert.equal(widget.querySelector(sel(css.historyItem, 'vs'))?.textContent, 'VS');
  assert.equal(widget.querySelector(sel(css.historyItem, 'mode'))?.textContent, 'No move');
  assert.ok(widget.querySelector(sel(css.historyItem, 'primaryUserWon')));
  assert.ok(
    widget.querySelector(`${sel(css.historyItem, 'card')} > ${sel(css.historyItem, 'arrow')}`),
  );
  assert.equal(
    widget.querySelector('[aria-label="Game analysis"]')?.getAttribute('href'),
    '/duels/first/summary',
  );
  assert.equal(widget.classList.contains('bettergeo-history-fallback'), false);
  assert.equal(widget.querySelector('a button'), null);
  (widget.querySelector('[aria-label="Next duel"]') as HTMLButtonElement).click();
  assert.equal(
    widget.querySelector('[aria-label="Game analysis"]')?.getAttribute('href'),
    '/duels/second/summary',
  );
  assert.equal(
    widget.querySelector('[aria-current="true"]')?.getAttribute('aria-label'),
    'Show duel 2',
  );
  (widget.querySelector('[aria-label="Show duel 1"]') as HTMLButtonElement).click();
  assert.equal(
    widget.querySelector('[aria-label="Game analysis"]')?.getAttribute('href'),
    '/duels/first/summary',
  );
  const all = [...widget.querySelectorAll('button')].find(
    (button) => button.textContent === 'View all',
  )!;
  all.click();
  assert.equal(opened, 1);
  f.close();
});

test('profile API deduplicates reads and rejects malformed moderation fields', async () => {
  const f = fixture('/user/me');
  let calls = 0;
  f.page.fetch = async (input) => {
    calls++;
    assert.equal(input, '/api/v3/users/person');
    return new Response('{"isBanned":true,"suspendedUntil":null}');
  };
  const [first, second] = await Promise.all([
    f.api.userStatus('person'),
    f.api.userStatus('person'),
  ]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(first.isBanned, true);
  f.page.fetch = async () => new Response('{"isBanned":"false"}');
  await assert.rejects(f.api.userStatus('bad'), /Unexpected moderation status/);
  f.page.fetch = async () => new Response('{}', { status: 403 });
  await assert.rejects(f.api.userStatus('forbidden'), /HTTP 403/);
  f.close();
});

test('profile badges handle stale requests, sit beside Pro, and clean up', async () => {
  const f = fixture(
    '/user/old',
    `<div class="${cls(css.profile, 'headerMainContent')}"><div class="${cls(css.profile, 'proBadgeWrapper')}"><div><p class="${cls(css.profile, 'proBadge')}" data-qa="pro-tier">Pro Unlimited</p></div></div></div>`,
  );
  const { profileStatus } = await import('../src/features/profile-status');
  const pending = new Map<
    string,
    (user: { isBanned: boolean; suspendedUntil: string | null }) => void
  >();
  let calls = 0;
  f.api.userStatus = (user) => {
    calls++;
    return new Promise((resolve) => pending.set(user, resolve));
  };
  const scope = new Scope();
  profileStatus.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  f.events.schedule();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(calls, 1);
  f.page.history.pushState({}, '', '/user/new');
  await new Promise((resolve) => setTimeout(resolve, 110));
  pending.get('old')!({ isBanned: true, suspendedUntil: null });
  await tick();
  assert.equal(document.getElementById('bettergeo-profile-status'), null);
  pending.get('new')!({
    isBanned: false,
    suspendedUntil: new Date(Date.now() + 3_600_000).toISOString(),
  });
  await tick();
  const panel = document.getElementById('bettergeo-profile-status')!;
  assert.equal(panel.textContent, 'Suspended');
  assert.ok(panel.title.includes('remaining'));
  assert.equal(
    panel.parentElement?.className,
    cls(css.profile, 'proBadgeWrapper') + ' bettergeo-badges-row',
  );
  assert.ok(panel.classList.contains(cls(css.profile, 'proBadge')));
  scope.dispose();
  assert.equal(document.getElementById('bettergeo-profile-status'), null);
  f.close();
});

test('profile widgets wait for React to hydrate the server-rendered profile', async () => {
  const f = fixture(
    '/user/person',
    `<div class="${cls(css.profile, 'headerMainContent')}"><div class="${cls(css.profile, 'proBadgeWrapper')}"></div></div>`,
  );
  f.page.performance.now = () => 100;
  const { profileStatus } = await import('../src/features/profile-status');
  f.api.userStatus = async () => ({ isBanned: true, suspendedUntil: null });
  const scope = new Scope();
  profileStatus.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(document.getElementById('bettergeo-profile-status'), null);
  // React tags the node once hydrated; no DOM mutation follows, so the retry must wake up.
  Object.assign(document.querySelector(sel(css.profile, 'headerMainContent'))!, {
    __reactFiber$test: {},
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  assert.ok(document.getElementById('bettergeo-profile-status'));
  scope.dispose();
  f.close();
});

test('own profile uses the copy-link ID and disabled status ignores a late response', async () => {
  const f = fixture(
    '/en/me/profile',
    `<input name="copy-link" value="https://www.geoguessr.com/user/self"><div class="${cls(css.profile, 'headerMainContent')}"></div>`,
  );
  const { viewedProfileId } = await import('../src/geoguessr/routes');
  const { profileStatus } = await import('../src/features/profile-status');
  assert.equal(viewedProfileId(), 'self');
  let finish!: (value: { isBanned: boolean; suspendedUntil: null }) => void;
  f.api.userStatus = async (user) => {
    assert.equal(user, 'self');
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  const scope = new Scope();
  profileStatus.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  scope.dispose();
  finish({ isBanned: true, suspendedUntil: null });
  await tick();
  assert.equal(document.getElementById('bettergeo-profile-status'), null);
  document.querySelector('input')!.value = 'https://other.example/user/wrong';
  assert.equal(viewedProfileId(), undefined);
  f.close();
});

test('restriction badges omit clean, expired, and unknown accounts and expose remaining time', async () => {
  const f = fixture('/user/me');
  const { statusBadge, remainingTime } = await import('../src/features/profile-status');
  assert.equal(statusBadge({ isBanned: false, suspendedUntil: null }), undefined);
  assert.equal(statusBadge({ isBanned: false, suspendedUntil: '2020-01-01T00:00:00Z' }), undefined);
  assert.equal(statusBadge({}), undefined);
  assert.equal(remainingTime(90_000), '2 minutes');
  assert.equal(remainingTime(90_000_000), '1 day, 1 hour');
  const banned = statusBadge({ isBanned: true, suspendedUntil: null })!;
  assert.equal(banned.textContent, 'Banned');
  assert.equal(banned.title, 'Account banned.');
  assert.equal(banned.tabIndex, 0);
  f.close();
});

test('ranked country API shares requests, normalizes codes, and preserves supplied order', async () => {
  const f = fixture('/user/me');
  let calls = 0;
  f.page.fetch = async (input) => {
    calls++;
    assert.equal(input, '/api/v4/ranked-system/progress/person');
    return new Response(
      JSON.stringify({
        bestCountries: ['MX', 'br', 'mx', null, '<img>', 'ru'],
        worstCountries: ['us', 'de', 'cy'],
      }),
    );
  };
  const [first, second] = await Promise.all([
    f.api.rankedCountries('person'),
    f.api.rankedCountries('person'),
  ]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.deepEqual(first, {
    bestCountries: ['mx', 'br', 'ru'],
    worstCountries: ['us', 'de', 'cy'],
  });
  f.page.fetch = async () => new Response('{"bestCountries":"mx"}');
  await assert.rejects(f.api.rankedCountries('bad'), /Unexpected country statistics/);
  f.page.fetch = async () => new Response('{}');
  assert.deepEqual(await f.api.rankedCountries('empty'), { bestCountries: [], worstCountries: [] });
  f.close();
});

test('country performance renders ordered countries below Ranked Duels and cleans up', async () => {
  const f = fixture(
    '/user/me',
    `<div class="${cls(css.profile, 'staticWidgets')}"><div id="ranked" class="${cls(css.profile, 'widgetRow')}"><h2>Ranked Duels</h2></div></div>`,
  );
  const { countryPerformance } = await import('../src/features/country-performance');
  f.api.rankedCountries = async () => ({
    bestCountries: ['mx', 'br', 'ru'],
    worstCountries: ['us', 'de', 'cy'],
  });
  const scope = new Scope();
  countryPerformance.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  const widget = document.getElementById('bettergeo-country-performance')!;
  assert.equal(widget.previousElementSibling?.id, 'ranked');
  assert.deepEqual(
    [...widget.querySelectorAll('[aria-label="Best countries"] li')].map((li) => li.textContent),
    ['Mexico', 'Brazil', 'Russia'],
  );
  assert.ok(
    widget.querySelector('[aria-label="Worst countries"]')?.textContent?.includes('Germany'),
  );
  assert.equal(
    widget.querySelector('li img')?.getAttribute('src'),
    'https://flagcdn.com/w40/mx.png',
  );
  scope.dispose();
  assert.equal(document.getElementById('bettergeo-country-performance'), null);
  f.close();
});

test('profiles with no ranked country data get no empty widget', async () => {
  const f = fixture('/user/me', `<div class="${cls(css.profile, 'staticWidgets')}"></div>`);
  const { countryPerformance } = await import('../src/features/country-performance');
  f.api.rankedCountries = async () => ({ bestCountries: [], worstCountries: [] });
  const scope = new Scope();
  countryPerformance.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.getElementById('bettergeo-country-performance'), null);
  scope.dispose();
  f.close();
});

test('random maps bypass cache and validate same-site map destinations', async () => {
  const f = fixture('/');
  let calls = 0;
  f.page.fetch = async (input, options) => {
    assert.equal(input, '/api/v3/social/maps/browse/random');
    assert.equal(options?.cache, 'no-store');
    calls++;
    return new Response(JSON.stringify({ url: ` /maps/map-${calls} ` }));
  };
  assert.equal(await f.api.randomMapUrl(), 'https://www.geoguessr.com/maps/map-1');
  assert.equal(await f.api.randomMapUrl(), 'https://www.geoguessr.com/maps/map-2');
  for (const url of [
    'https://other.example/maps/test',
    '//other.example/maps/test',
    'javascript:alert(1)',
    '/user/person',
  ]) {
    f.page.fetch = async () => new Response(JSON.stringify({ url }));
    await assert.rejects(f.api.randomMapUrl(), /Unexpected random map URL/);
  }
  f.page.fetch = async () => new Response('{}');
  await assert.rejects(f.api.randomMapUrl(), /unavailable/);
  f.close();
});
/** The new header: a nav item with its dropdown panel, entries, then secondary links. */
const menuPanel = (id: string, entries: string, secondary: string) =>
  `<div class="${cls(css.menu, 'dropdownContainer')}"><div id="${id}" class="${cls(css.menu, 'dropdown')}">${entries}<div class="_container_sssss_1">${secondary}</div></div></div>`;
const menuEntryMarkup = (href: string, title: string, icon = '') =>
  `<a class="${cls(css.menuItem, 'dropdownItem')}" href="${href}">${icon}<div class="${cls(css.menuItem, 'title')}">${title}</div><div class="${cls(css.menuItem, 'description')}">desc</div></a>`;
const randomMenuMarkup =
  `<header><div id="nav-item"><button>Singleplayer</button></div>` +
  menuPanel(
    'singleplayer-menu',
    menuEntryMarkup(
      '/maps?scope=all',
      'Maps',
      `<img class="${cls(css.menuItem, 'image')}" src="/maps-icon.webp">`,
    ),
    '<a href="/streaks">Streaks</a>',
  ) +
  '</header>';

test('random menu opens modified clicks synchronously and selects a fresh map on each click', async () => {
  const f = fixture('/', randomMenuMarkup);
  const { randomMap } = await import('../src/features/random-map');
  let opens = 0,
    requests = 0;
  const destinations: string[] = [];
  f.page.open = () => {
    opens++;
    return {
      opener: f.page,
      closed: false,
      location: {
        replace(url: string) {
          destinations.push(url);
        },
      },
      close() {},
    } as unknown as Window;
  };
  f.api.randomMapUrl = async () => {
    assert.equal(opens, ++requests);
    return `https://www.geoguessr.com/maps/${requests}`;
  };
  const scope = new Scope();
  randomMap.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  const button = document.querySelector<HTMLButtonElement>('.bettergeo-random-map-button')!;
  assert.ok(button);
  assert.equal(button.querySelector('img')?.getAttribute('src'), '/maps-icon.webp');
  assert.equal(button.closest(sel(css.menu, 'dropdown'))?.id, 'singleplayer-menu');
  assert.ok(button.classList.contains(cls(css.menuItem, 'dropdownItem')));
  assert.ok(button.querySelector(sel(css.menuItem, 'image')));
  assert.equal(button.previousElementSibling?.textContent?.startsWith('Maps'), true);
  assert.equal(button.nextElementSibling?.className, '_container_sssss_1');
  assert.equal(
    document.getElementById('nav-item')?.querySelector('.bettergeo-random-map-button'),
    null,
  );
  button.dispatchEvent(new f.page.MouseEvent('click', { ctrlKey: true, bubbles: true }));
  await tick();
  button.dispatchEvent(new f.page.MouseEvent('auxclick', { button: 1, bubbles: true }));
  await tick();
  assert.deepEqual(destinations, [
    'https://www.geoguessr.com/maps/1',
    'https://www.geoguessr.com/maps/2',
  ]);
  f.events.schedule();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelectorAll('.bettergeo-random-map-button').length, 1);
  scope.dispose();
  assert.equal(document.querySelector('.bettergeo-random-map-button'), null);
  f.close();
});

test('random menu closes pending tabs when disabled and never navigates late', async () => {
  const f = fixture('/', randomMenuMarkup);
  const { randomMap } = await import('../src/features/random-map');
  let finish!: (url: string) => void,
    closed = 0,
    navigated = 0;
  f.api.randomMapUrl = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  f.page.open = () =>
    ({
      opener: f.page,
      closed: false,
      location: {
        replace() {
          navigated++;
        },
      },
      close() {
        closed++;
      },
    }) as unknown as Window;
  const scope = new Scope();
  randomMap.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  document
    .querySelector('.bettergeo-random-map-button')!
    .dispatchEvent(new f.page.MouseEvent('click', { ctrlKey: true }));
  scope.dispose();
  assert.equal(closed, 1);
  finish('https://www.geoguessr.com/maps/late');
  await tick();
  assert.equal(navigated, 0);
  f.close();
});

test('random menu failures offer retry without leaving a blank tab', async () => {
  const f = fixture('/', randomMenuMarkup);
  const { randomMap } = await import('../src/features/random-map');
  let closed = 0;
  f.page.open = () =>
    ({
      opener: null,
      closed: false,
      close() {
        closed++;
      },
    }) as unknown as Window;
  f.api.randomMapUrl = async () => {
    throw new Error('offline');
  };
  const scope = new Scope();
  randomMap.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  const button = document.querySelector<HTMLButtonElement>('.bettergeo-random-map-button')!;
  const original = console.error;
  console.error = () => {};
  try {
    button.dispatchEvent(new f.page.MouseEvent('auxclick', { button: 1 }));
    await tick();
  } finally {
    console.error = original;
  }
  assert.equal(closed, 1);
  assert.equal(button.disabled, false);
  assert.equal(button.querySelector(sel(css.menuItem, 'title'))?.textContent, 'Retry random map');
  scope.dispose();
  f.close();
});

test('random map waits for the Singleplayer dropdown and remounts when reopened', async () => {
  const f = fixture('/', '<div id="nav-item"><button>Singleplayer</button></div>');
  const { randomMap } = await import('../src/features/random-map');
  const scope = new Scope();
  randomMap.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelector('.bettergeo-random-map-button'), null);
  const popup = document.createElement('div');
  popup.setAttribute('role', 'menu');
  popup.innerHTML = '<a href="/maps?scope=all">Maps</a>';
  document.body.append(popup);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(popup.querySelectorAll('.bettergeo-random-map-button').length, 1);
  popup.remove();
  await new Promise((resolve) => setTimeout(resolve, 110));
  document.body.append(popup);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(popup.querySelectorAll('.bettergeo-random-map-button').length, 1);
  scope.dispose();
  f.close();
});

test('Tournaments mounts only in Multiplayer, avoids native duplicates, and cleans up', async () => {
  const f = fixture(
    '/',
    randomMenuMarkup +
      menuPanel(
        'multiplayer-menu',
        menuEntryMarkup('/multiplayer', 'Ranked Duels'),
        '<a href="/battle-royale">Battle Royale</a>',
      ),
  );
  const { tournamentsLink } = await import('../src/features/tournaments-link');
  const scope = new Scope();
  tournamentsLink.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  const item = document.querySelector<HTMLAnchorElement>('[data-bettergeo-tournaments]')!;
  assert.ok(item);
  assert.equal(item.parentElement?.id, 'multiplayer-menu');
  assert.equal(item.getAttribute('href'), '/multiplayer/tournaments');
  assert.ok(item.querySelector('svg'));
  assert.equal(item.nextElementSibling?.className, '_container_sssss_1');
  assert.ok(item.classList.contains(cls(css.menuItem, 'dropdownItem')));
  f.events.schedule();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelectorAll('[data-bettergeo-tournaments]').length, 1);
  const native = document.createElement('a');
  native.href = '/multiplayer/tournaments';
  native.textContent = 'Native Tournaments';
  document.getElementById('multiplayer-menu')!.append(native);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelector('[data-bettergeo-tournaments]'), null);
  native.remove();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.ok(document.querySelector('[data-bettergeo-tournaments]'));
  scope.dispose();
  assert.equal(document.querySelector('[data-bettergeo-tournaments]'), null);
  f.close();
});

test('viewer filters the loaded 40 duels locally, preserves order, and handles empty modes', async () => {
  const f = fixture('/user/me');
  f.page.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  const { openHistoryDialog } = await import('../src/features/match-history-dialog');
  const modes = ['StandardDuels', 'NoMoveDuels', 'NmpzDuels', undefined];
  const entries = Array.from({ length: 40 }, (_, i) => ({
    ...history('me').entries[0]!,
    gameId: `game-${i}`,
    duel: { gameMode: modes[i % 4] },
  }));
  const calls: string[] = [];
  f.page.fetch = async (input) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ entries }));
  };
  const data = await f.api.history('me');
  let closed = 0;
  const close = openHistoryDialog(data.entries, 'me', () => {
    closed++;
  });
  const dialog = document.querySelector('.bettergeo-duels')!;
  assert.ok(dialog.querySelector(sel(css.overlayModal, 'content')));
  assert.equal(dialog.classList.contains('bettergeo-history-modal-fallback'), false);
  const select = dialog.querySelector('select')!;
  assert.deepEqual(
    [...select.options].map((option) => [option.value, option.text]),
    [
      ['None', 'All'],
      ['StandardDuels', 'Moving'],
      ['NoMoveDuels', 'No move'],
      ['NmpzDuels', 'NMPZ'],
    ],
  );
  const links = () =>
    [...dialog.querySelectorAll('[aria-label="Game analysis"]')].map((link) =>
      link.getAttribute('href'),
    );
  assert.equal(links().length, 40);
  for (const mode of ['NoMoveDuels', 'NmpzDuels', 'StandardDuels', 'None']) {
    const content = dialog.querySelector<HTMLElement>(sel(css.overlayModal, 'content'))!;
    const leaderboard = dialog.querySelector<HTMLElement>(
      sel(css.historyModal, 'leaderboardWrapper'),
    )!;
    content.scrollTop = 400;
    leaderboard.scrollTop = 200;
    select.value = mode;
    select.dispatchEvent(new f.page.Event('change'));
    assert.equal(content.scrollTop, 0);
    assert.equal(leaderboard.scrollTop, 0);
    assert.deepEqual(
      links(),
      entries
        .filter((entry) => mode === 'None' || entry.duel.gameMode === mode)
        .map((entry) => `/duels/${entry.gameId}/summary`),
    );
  }
  assert.equal(dialog.querySelector('.bettergeo-history-retry'), null);
  assert.equal(dialog.querySelector('[aria-busy]'), null);
  close();
  assert.equal(closed, 1);
  const closeEmpty = openHistoryDialog([entries[0]!], 'me', () => {});
  const emptySelect = document.querySelector('select')!;
  emptySelect.value = 'NmpzDuels';
  emptySelect.dispatchEvent(new f.page.Event('change'));
  assert.equal(document.querySelectorAll('[aria-label="Game analysis"]').length, 0);
  const status = document.querySelector<HTMLElement>('[role="status"]')!;
  assert.equal(status.hidden, false);
  assert.equal(status.textContent, 'No recent games in this mode.');
  closeEmpty();
  assert.deepEqual(calls, ['/api/v4/game-history/me?gameMode=None']);
  f.close();
});

test('duel cards show the native date beneath VS', async () => {
  const f = fixture('/user/me');
  const { gameCard } = await import('../src/features/match-history-view');
  const entry = history('me').entries[0]!;
  entry.duel!.rounds = [{ roundNumber: 1, startTime: '2026-10-20T00:03:08Z' }];
  const card = gameCard(entry, 'me');
  const center = card.querySelector(sel(css.historyItem, 'centerColumn'))!;
  assert.ok(center.lastElementChild?.classList.contains(cls(css.historyItem, 'date')));
  assert.ok(center.lastElementChild?.textContent);
  assert.ok(center.lastElementChild?.querySelector('[title]'));
  const { historyView } = await import('../src/features/match-history-view');
  const preview = historyView([entry], 'me', () => {});
  assert.equal(preview.querySelector(sel(css.historyItem, 'date')), null);
  f.close();
});

test('network middleware failures never fail a site fetch', async () => {
  const f = fixture('/maps/world');
  const log = console.error;
  console.error = () => {};
  try {
    f.network.observe(
      () => {
        throw new Error('bad matcher');
      },
      () => {},
    );
    f.network.intercept(() => {
      throw new Error('bad interceptor');
    });
    assert.deepEqual(await (await f.page.fetch('/api/test')).json(), {});
    const response = new Response('already used');
    await response.text();
    f.page.fetch = async () => response;
    const extra = new Network(f.page);
    extra.observe(
      () => true,
      () => {},
    );
    try {
      assert.equal(await f.page.fetch('/anything'), response);
    } finally {
      extra.dispose();
    }
  } finally {
    console.error = log;
    f.close();
  }
});

test('reused XHR objects emit once using their latest URL', () => {
  const f = fixture('/');
  const seen: string[] = [];
  f.network.observe(
    () => true,
    (url) => seen.push(url.pathname),
  );
  const xhr = new f.page.XMLHttpRequest();
  xhr.open('GET', '/old');
  xhr.abort();
  xhr.open('GET', '/new');
  Object.defineProperties(xhr, { status: { value: 200 }, responseText: { value: '{}' } });
  xhr.dispatchEvent(new f.page.Event('load'));
  assert.deepEqual(seen, ['/new']);
  f.close();
});

test('page events catch async render failures and cancel queued callbacks on disposal', async () => {
  const f = fixture('/');
  const log = console.error;
  let errors = 0;
  console.error = () => {
    errors++;
  };
  try {
    f.events.subscribe(async () => {
      throw new Error('render failed');
    });
    await new Promise((resolve) => setTimeout(resolve, 110));
    assert.equal(errors, 1);
    let calls = 0;
    f.events.subscribe(() => {
      calls++;
    });
    f.events.dispose();
    f.events.schedule();
    await new Promise((resolve) => setTimeout(resolve, 110));
    assert.equal(calls, 0);
  } finally {
    console.error = log;
    f.close();
  }
});

test('recycled map rows lose result links when their date or score disappears', async () => {
  const f = fixture(
    '/maps/world',
    `<div id="row"><button class="${cls(css.mapScores, 'row')}" aria-expanded="false"><span class="${cls(css.mapScores, 'cellDate')}"><span title="2026-01-01T00:00:00Z">date</span></span><span class="${cls(css.mapScores, 'cellPoints')}">25,000 pts</span><i>arrow</i></button></div>`,
  );
  f.api.scores.accept('/api/v3/scores/world/me/games', {
    items: [{ playedAt: '2026-01-01T00:00:00Z', points: 25000, gameToken: 'one' }],
  });
  const scope = new Scope();
  gameResults.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.ok(document.querySelector('.gg-result-action'));
  document.querySelector('[title]')!.removeAttribute('title');
  f.events.schedule();
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(document.querySelector('.gg-result-action'), null);
  assert.equal(document.getElementById('row')!.style.getPropertyValue('--gg-icon-right'), '');
  scope.dispose();
  f.close();
});

test('a late native history widget prevents duplicate injection and unnecessary reads', async () => {
  const f = fixture(
    '/user/me',
    `<div class="${cls(css.profile, 'staticWidgets')}"><div><h2>Recent Duels</h2></div></div>`,
  );
  let calls = 0;
  f.api.history = async () => {
    calls++;
    return history('me');
  };
  const scope = new Scope();
  matchHistory.enable(f, scope);
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(calls, 0);
  assert.equal(document.getElementById('bettergeo-match-history'), null);
  const container = document.querySelector(sel(css.profile, 'staticWidgets'))!;
  const native = container.firstElementChild!;
  native.remove();
  let finish!: (value: GameHistory) => void;
  f.api.history = () =>
    new Promise((resolve) => {
      calls++;
      finish = resolve;
    });
  await new Promise((resolve) => setTimeout(resolve, 110));
  assert.equal(calls, 1);
  container.append(native);
  finish(history('me'));
  await tick();
  assert.equal(document.getElementById('bettergeo-match-history'), null);
  scope.dispose();
  f.close();
});

test('history cards keep a usable fallback layout when GeoGuessr styles are missing', async () => {
  const f = fixture('/user/me', '', { styled: false });
  const { historyView } = await import('../src/features/match-history-view');
  const widget = historyView(history('me').entries, 'me', () => {});
  assert.ok(widget.classList.contains('bettergeo-history-fallback'));
  assert.ok(widget.querySelector('.bgh-card.bgh-primaryUserWon .bgh-overlay'));
  assert.equal(widget.querySelector('[class*="undefined"]'), null);
  f.close();
});

test('settings roll back failed startup and failed persistence', () => {
  const f = fixture('/');
  let cleanups = 0;
  Reflect.set(globalThis, 'GM_getValue', () => ({ example: false }));
  Reflect.set(globalThis, 'GM_setValue', () => {
    throw new Error('storage full');
  });
  const manager = new FeatureManager(
    [
      {
        id: 'example',
        name: 'Example',
        description: '',
        enable(_, scope) {
          scope.own(() => {
            cleanups++;
          });
        },
      },
    ],
    f,
  );
  assert.throws(() => manager.set('example', true), /storage full/);
  assert.equal(manager.enabled('example'), false);
  assert.equal(cleanups, 1);
  const broken = new FeatureManager(
    [
      {
        id: 'example',
        name: 'Example',
        description: '',
        enable(_, scope) {
          scope.own(() => {
            cleanups++;
          });
          throw new Error('startup failed');
        },
      },
    ],
    f,
  );
  assert.throws(() => broken.set('example', true), /startup failed/);
  assert.equal(broken.enabled('example'), false);
  assert.equal(cleanups, 2);
  Reflect.set(globalThis, 'GM_getValue', () => ({ example: true }));
  let healthyStarted = false;
  const startup = new FeatureManager(
    [
      ...broken.features,
      {
        id: 'healthy',
        name: 'Healthy',
        description: '',
        enable() {
          healthyStarted = true;
        },
      },
    ],
    f,
  );
  const log = console.error;
  console.error = () => {};
  try {
    startup.start();
  } finally {
    console.error = log;
  }
  assert.equal(startup.enabled('example'), false);
  assert.equal(startup.enabled('healthy'), true);
  assert.equal(healthyStarted, true);
  assert.equal(cleanups, 3);
  startup.dispose();
  f.close();
});

test('history accepts summary-only rounds and drops malformed records', async () => {
  const f = fixture('/');
  f.page.fetch = async () =>
    new Response(
      JSON.stringify({
        entries: [
          ...history('me').entries,
          {
            gameId: 'summary-only',
            players: [{ id: 'me' }],
            duel: { rounds: [{ startTime: '2026-10-20T12:00:00Z' }] },
          },
          { gameId: 'bad', players: [{ id: 'me', countryCode: 42 }], duel: {} },
          { gameId: 'bad-team', players: [], duel: { teams: [{ players: null }] } },
          null,
        ],
      }),
    );
  assert.deepEqual(
    (await f.api.history('me')).entries.map((entry) => entry.gameId),
    [id, 'summary-only'],
  );
  f.close();
});

test('released scoped resources are not cleaned twice', () => {
  const scope = new Scope();
  let calls = 0;
  const release = scope.own(() => {
    calls++;
  });
  release();
  release();
  scope.dispose();
  assert.equal(calls, 1);
});

test('cache pressure does not evict requests still in flight', async () => {
  const cache = new RequestCache();
  const resolve = new Map<string, (value: number) => void>();
  const pending = Array.from({ length: 101 }, (_, index) =>
    cache.get(
      `key${index}`,
      () =>
        new Promise<number>((done) => {
          resolve.set(`key${index}`, done);
        }),
    ),
  );
  await tick();
  resolve.get('key100')!(100);
  await pending[100];
  assert.equal(
    cache.get('key0', async () => -1),
    pending[0],
  );
  for (let index = 0; index < 100; index++) resolve.get(`key${index}`)!(index);
  await Promise.all(pending);
});

test('score history evicts whole maps while retaining ambiguity in active maps', () => {
  const index = new ScoreIndex(),
    playedAt = '2026-01-01T00:00:00Z';
  for (let map = 0; map < 33; map++)
    index.accept(`/api/v3/scores/map${map}/me/games`, {
      items: [
        { playedAt, points: 10, gameToken: 'one' },
        { playedAt, points: 10, gameToken: 'two' },
      ],
    });
  assert.equal(index.lookup('map0', Date.parse(playedAt), 10), undefined);
  assert.equal(index.lookup('map32', Date.parse(playedAt), 10)?.size, 2);
});

test('duel viewer accepts wheel input only over its content and restores page scrolling on close', async () => {
  const f = fixture('/user/me');
  f.page.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  document.body.style.setProperty('overflow', 'auto', 'important');
  const { openHistoryDialog } = await import('../src/features/match-history-dialog');
  const close = openHistoryDialog(history('me').entries, 'me', () => {});
  const wheel = (target: Element) => {
    const event = new f.page.WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 100 });
    target.dispatchEvent(event);
    return event.defaultPrevented;
  };
  assert.equal(document.body.style.overflow, 'hidden');
  assert.equal(wheel(document.querySelector('.bettergeo-duel-list')!), false);
  assert.equal(wheel(document.querySelector(sel(css.overlayModal, 'backlight'))!), true);
  assert.equal(wheel(document.body), true);
  close();
  assert.equal(document.body.style.overflow, 'auto');
  assert.equal(document.body.style.getPropertyPriority('overflow'), 'important');
  assert.equal(wheel(document.body), false);
  const closeAgain = openHistoryDialog([], 'me', () => {});
  closeAgain();
  assert.equal(wheel(document.body), false);
  f.close();
});

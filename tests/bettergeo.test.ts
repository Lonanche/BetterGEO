import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { RequestCache, GeoGuessrApi } from '../src/geoguessr/api';
import { ScoreIndex } from '../src/geoguessr/scores';
import { nativeProps, summaryShape } from '../src/geoguessr/summary';
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
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const fixtures = new Set<() => void>();
afterEach(() => {
  for (const close of fixtures) close();
});
function fixture(path: string, html = '') {
  const dom = new JSDOM(html, { url: `https://www.geoguessr.com${path}`, pretendToBeVisual: true });
  const page = dom.window as unknown as PageWindow;
  const originals = new Map<string, PropertyDescriptor | undefined>();
  for (const name of ['GM_getValue', 'GM_setValue'])
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of [
    'window',
    'document',
    'location',
    'MutationObserver',
    'HTMLElement',
    'Element',
    'Node',
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

test('summary excludes unplayed locations and preserves native app contexts', () => {
  const result = summaryShape(duel);
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0]?.multiplier, 2);
  assert.equal(result.rounds[0]?.panorama.lat, 1);
  const props = nativeProps(
    { props: { locale: 'en', pageProps: { old: true } } },
    {
      accountProps: { account: { user: { userId: 'user' } } },
      translations: { hello: 'hi' },
    },
    duel,
  );
  assert.equal(props.locale, 'en');
  assert.equal(props.pageProps.userId, 'user');
  assert.deepEqual(props.translations, { hello: 'hi' });
  assert.equal(props.pageProps.statusCode, 200);
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
    '<div id="row"><button aria-expanded="false"><span title="2026-01-01T00:00:00Z">date</span><span class="cellPoints__x">25,000</span><i>arrow</i></button></div>',
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
  const f = fixture('/user/old', '<div class="profile-v2_staticWidgets__x"></div>');
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

test('summary uses shared middleware and disabling blocks late recovery', async () => {
  const f = fixture(`/duels/${id}`, '<div class="error_errorPage__x">Game not found</div>');
  let resolve!: (game: Duel) => void;
  let replacements = 0;
  f.api.finishedDuel = () =>
    new Promise((done) => {
      resolve = done;
    });
  f.page.next = {
    router: {
      isReady: true,
      route: '/duels/[token]',
      replace: async () => {
        replacements++;
        return true;
      },
    },
  };
  const scope = new Scope();
  summaryRecovery.enable(f, scope);
  await new Promise((done) => setTimeout(done, 110));
  scope.dispose();
  resolve(duel);
  await tick();
  assert.equal(replacements, 0);
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

test('native summary recovery intercepts only its Next data URL and restores URL', async () => {
  const f = fixture(
    `/en/team-duels/${id}?keep=1`,
    '<div class="error_errorPage__x">Game not found</div>',
  );
  f.api.finishedDuel = async () => duel;
  let payload: Record<string, unknown> | undefined;
  f.page.next = {
    router: {
      isReady: true,
      route: '/team-duels/[token]',
      components: {},
      replace: async (target) => {
        f.page.history.replaceState({}, '', target);
        assert.deepEqual(
          await (await f.page.fetch(`/_next/data/build/en/team-duels/other/summary.json`)).json(),
          {},
        );
        const response = await f.page.fetch(
          `https://www.geoguessr.com/_next/data/build/en/team-duels/${id}/summary.json`,
        );
        payload = (await response.json()) as Record<string, unknown>;
        document.querySelector('[class*="error_errorPage__"]')?.remove();
        return true;
      },
    },
  };
  const scope = new Scope();
  summaryRecovery.enable(f, scope);
  await new Promise((done) => setTimeout(done, 190));
  assert.equal((payload?.pageProps as { statusCode: number })?.statusCode, 200);
  assert.equal(location.pathname + location.search, `/en/team-duels/${id}?keep=1`);
  assert.deepEqual(
    await (await f.page.fetch(`/_next/data/build/en/team-duels/${id}/summary.json`)).json(),
    {},
  );
  scope.dispose();
  f.close();
});

test('native class lookup finds hidden-widget stylesheet classes and distinguishes both headers', async () => {
  const f = fixture(
    '/',
    '<style>.game-history-list-item_card__NEW12{display:flex}.widget_header___OUT1{padding:1px}.widget_header__IN123{gap:1px}</style><div id=outer class=widget_header___OUT1></div><div id=inner class=widget_header__IN123></div>',
  );
  const { nativeStyles } = await import('../src/core/native-styles');
  const styles = nativeStyles({ widget_header___ZOfT: '#outer', widget_header__8mkus: '#inner' });
  assert.equal(
    styles.resolve('game-history-list-item_card__4tf1Q'),
    'game-history-list-item_card__NEW12',
  );
  assert.equal(styles.resolve('widget_header___ZOfT'), 'widget_header___OUT1');
  assert.equal(styles.resolve('widget_header__8mkus'), 'widget_header__IN123');
  assert.equal(styles.has('game-history-list-item_card__'), true);
  f.close();
});

test('native history layout mirrors players, keeps icon links, and browses carousel safely', async () => {
  const f = fixture('/user/me');
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
  const left = widget.querySelector('[class*="game-history-list-item_gameDataSideLeft__"]')!;
  const right = widget.querySelector('[class*="game-history-list-item_gameDataSideRight__"]')!;
  assert.ok(left.firstElementChild?.className.includes('game-history-player-column_left__'));
  assert.ok(left.lastElementChild?.className.includes('avatarCell__'));
  const portrait = left.querySelector<HTMLImageElement>(
    '[class*="avatar_titleAvatarImage__"] img',
  )!;
  const border = left.querySelector<HTMLImageElement>('[class*="avatar_titleAvatarBorder__"]')!;
  assert.equal(portrait.style.position, 'absolute');
  assert.equal(portrait.style.width, '100%');
  assert.equal(portrait.style.objectFit, 'cover');
  assert.equal(border.style.position, 'absolute');
  assert.equal(border.style.width, '100%');
  assert.equal(border.style.height, '100%');

  assert.ok(right.firstElementChild?.className.includes('avatarCell__'));
  assert.equal(left.querySelector('a')?.textContent, 'Me');
  assert.ok(left.textContent?.includes('Rating 0'));
  assert.equal(widget.querySelector('[class*="game-history-list-item_vs__"]')?.textContent, 'VS');
  assert.equal(
    widget.querySelector('[aria-label="Summary"]')?.getAttribute('href'),
    '/duels/first/summary',
  );
  assert.equal(widget.querySelector('a button'), null);
  (widget.querySelector('[aria-label="Next duel"]') as HTMLButtonElement).click();
  assert.equal(
    widget.querySelector('[aria-label="Summary"]')?.getAttribute('href'),
    '/duels/second/summary',
  );
  assert.equal(
    widget.querySelector('[aria-current="true"]')?.getAttribute('aria-label'),
    'Show duel 2',
  );
  (widget.querySelector('[aria-label="Show duel 1"]') as HTMLButtonElement).click();
  assert.equal(
    widget.querySelector('[aria-label="Summary"]')?.getAttribute('href'),
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
    '<div class="profile-v2_headerMainContent__x"><div class="profile-v2_proBadgeWrapper__x"><p class="profile-v2_proBadge__Wlpxj" data-qa="pro-tier">Pro Unlimited</p></div></div>',
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
  assert.equal(panel.previousElementSibling?.getAttribute('data-qa'), 'pro-tier');
  scope.dispose();
  assert.equal(document.getElementById('bettergeo-profile-status'), null);
  f.close();
});

test('own profile uses the copy-link ID and disabled status ignores a late response', async () => {
  const f = fixture(
    '/en/me/profile',
    '<input name="copy-link" value="https://www.geoguessr.com/user/self"><div class="profile-v2_headerMainContent__x"></div>',
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
    '<div class="profile-v2_staticWidgets__x"><div id="ranked" class="profile-v2_widgetRow__x"><h2>Ranked Duels</h2></div></div>',
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
  const f = fixture('/user/me', '<div class="profile-v2_staticWidgets__x"></div>');
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
const randomMenuMarkup =
  '<header><div class="header-desktop_desktopSectionLeft__x"><div class="menu-item_container__x"><div class="menu-item_itemContainer__x"><button class="menu-button_button__x">Singleplayer</button></div></div><div>Multiplayer</div><div class="menu-item_dropdownContainer__J_pqu"><div class="menu-item_dropdown___k8UR"><a class="link_anchor__TGl1_ menu-dropdown-item_dropdownItem__k29Nw" href="/maps?scope=all"><img class="menu-dropdown-item_image__r1egm" src="/maps-icon.webp"><div class="menu-dropdown-item_title__4U4eM">Maps</div><div class="menu-dropdown-item_description__uVic7">Community maps</div></a><div class="menu-dropdown-secondary_container__C89mR"><a href="/streaks">Streaks</a></div></div></div></div></header>';

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
  assert.ok(button.closest('[class*="menu-item_dropdown__"]'));
  assert.ok(button.className.includes('menu-dropdown-item_dropdownItem__'));
  assert.ok(button.nextElementSibling?.className.includes('menu-dropdown-secondary_container__'));
  assert.equal(
    document
      .querySelector('[class*="menu-item_container__"]')
      ?.querySelector('.bettergeo-random-map-button'),
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
  assert.equal(
    button.querySelector('[class*="menu-dropdown-item_title__"]')?.textContent,
    'Retry random map',
  );
  scope.dispose();
  f.close();
});

test('random map waits for the Singleplayer dropdown and remounts when reopened', async () => {
  const f = fixture('/', '<div class="menu-item_container__x"><button>Singleplayer</button></div>');
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
      '<div class="menu-item_dropdownContainer__x"><div id="multiplayer-menu" class="menu-item_dropdown___k8UR"><a class="menu-dropdown-item_dropdownItem__k29Nw" href="/multiplayer">Ranked Duels</a><div class="menu-dropdown-secondary_container__C89mR"><a href="/battle-royale">Battle Royale</a></div></div></div>',
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
  assert.ok(item.nextElementSibling?.className.includes('menu-dropdown-secondary_container__'));
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
  assert.ok(dialog.querySelector('[class*="overlay-modal_content__"]'));
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
    [...dialog.querySelectorAll('[aria-label="Summary"]')].map((link) => link.getAttribute('href'));
  assert.equal(links().length, 40);
  for (const mode of ['NoMoveDuels', 'NmpzDuels', 'StandardDuels', 'None']) {
    const content = dialog.querySelector<HTMLElement>('[class*="overlay-modal_content__"]')!;
    const leaderboard = dialog.querySelector<HTMLElement>(
      '[class*="game-history-modal_leaderboardWrapper__"]',
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
  assert.equal(document.querySelectorAll('[aria-label="Summary"]').length, 0);
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
  const center = card.querySelector('[class*="game-history-list-item_centerColumn__"]')!;
  assert.ok(center.lastElementChild?.className.includes('game-history-list-item_date__'));
  assert.ok(center.lastElementChild?.textContent);
  assert.ok(center.lastElementChild?.querySelector('[title]'));
  const { historyView } = await import('../src/features/match-history-view');
  const preview = historyView([entry], 'me', () => {});
  assert.equal(preview.querySelector('[class*="game-history-list-item_date__"]'), null);
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
    '<div id="row"><button aria-expanded="false"><span title="2026-01-01T00:00:00Z">date</span><span class="cellPoints__x">25,000</span><i>arrow</i></button></div>',
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
    '<div class="profile-v2_staticWidgets__x"><div><h2>Recent Duels</h2></div></div>',
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
  const container = document.querySelector('[class*="profile-v2_staticWidgets__"]')!;
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

test('native CSS hashes replace injected stale classes', async () => {
  const f = fixture(
    '/',
    '<style>.widget_root__NEW12{display:block}</style><div class="widget_root__KcxU_"></div>',
  );
  const { nativeStyles } = await import('../src/core/native-styles');
  assert.equal(nativeStyles().resolve('widget_root__KcxU_'), 'widget_root__NEW12');
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
  assert.equal(wheel(document.querySelector('[class*="overlay-modal_backlight__"]')!), true);
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

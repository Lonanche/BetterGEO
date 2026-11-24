import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import * as css from '../src/geoguessr/styles';
import { cls, nativeCss } from './native';

test('built userscript composes features, toggles settings, and survives a cached pagehide', async () => {
  const dom = new JSDOM(
    nativeCss +
      `
    <div class="${cls(css.menu, 'dropdown')}"><a class="${cls(css.menuItem, 'dropdownItem')}" href="/maps?scope=all">Maps</a></div>
    <div class="${cls(css.menu, 'dropdown')}"><a class="${cls(css.menuItem, 'dropdownItem')}" href="/multiplayer">Ranked Duels</a></div>
    <div class="${cls(css.profile, 'headerMainContent')}"><div class="${cls(css.profile, 'proBadgeWrapper')}"><p data-qa="pro-tier">Pro</p></div></div>
    <div class="${cls(css.profile, 'staticWidgets')}"><div class="${cls(css.profile, 'widgetRow')}"><h2>Ranked Duels</h2></div></div>`,
    {
      url: 'https://www.geoguessr.com/user/person',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    },
  );
  const page = dom.window,
    calls: string[] = [];
  let menu: (() => void) | undefined,
    stored: Record<string, boolean> = {};
  const fetch = async (input: unknown) => {
    const path = String(input);
    calls.push(path);
    const responses: Record<string, unknown> = {
      '/api/v4/game-history/person?gameMode=None': {
        entries: [
          {
            gameId: 'game',
            players: [{ id: 'person', nick: 'Person' }],
            duel: { winnerId: 'person' },
          },
        ],
      },
      '/api/v4/ranked-system/progress/person': { bestCountries: ['mx'], worstCountries: ['us'] },
      '/api/v3/users/person': { isBanned: true, suspendedUntil: null },
    };
    assert.ok(Object.hasOwn(responses, path), `Unexpected API request: ${path}`);
    const data = responses[path];
    return new Response(JSON.stringify(data));
  };
  Object.assign(page, {
    unsafeWindow: page,
    fetch,
    Response,
    AbortSignal,
    GM_getValue: () => ({}),
    GM_setValue: (_: string, value: Record<string, boolean>) => {
      stored = value;
    },
    GM_registerMenuCommand: (_: string, callback: () => void) => {
      menu = callback;
    },
  });
  // jsdom has no React: report the page as past the hydration fallback.
  Object.defineProperty(page.performance, 'now', { value: () => 60_000 });
  page.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  page.HTMLDialogElement.prototype.close = function () {
    this.open = false;
    this.dispatchEvent(new page.Event('close'));
  };
  function pagehide(persisted: boolean) {
    const event = new page.Event('pagehide');
    Object.defineProperty(event, 'persisted', { value: persisted });
    page.dispatchEvent(event);
  }
  try {
    page.eval(readFileSync(new URL('../dist/BetterGEO.user.js', import.meta.url), 'utf8'));
    await new Promise((resolve) => setTimeout(resolve, 180));
    assert.ok(page.document.getElementById('bettergeo-match-history'));
    assert.ok(page.document.getElementById('bettergeo-country-performance'));
    assert.ok(page.document.getElementById('bettergeo-profile-status'));
    assert.ok(page.document.querySelector('[data-bettergeo-tournaments]'));
    assert.ok(page.document.querySelector('[data-bettergeo-random-map]'));
    assert.deepEqual([...calls].sort(), [
      '/api/v3/users/person',
      '/api/v4/game-history/person?gameMode=None',
      '/api/v4/ranked-system/progress/person',
    ]);
    assert.ok(menu);
    menu();
    const shadow = page.document.getElementById('bettergeo-settings-host')!.shadowRoot!;
    assert.equal(shadow.activeElement, shadow.querySelector('h2'));
    assert.ok(shadow.querySelector('[aria-label="Close settings"] svg'));
    const label = [...shadow.querySelectorAll('label')].find((label) =>
      label.textContent?.includes('Country ranked stats'),
    )!;
    const toggle = label.querySelector('input')!;
    toggle.checked = false;
    toggle.dispatchEvent(new page.Event('change'));
    assert.equal(stored['country-performance'], false);
    assert.equal(page.document.getElementById('bettergeo-country-performance'), null);
    pagehide(true);
    assert.ok(page.document.getElementById('bettergeo-match-history'));
    pagehide(false);
    assert.equal(page.document.getElementById('bettergeo-match-history'), null);
    assert.equal(page.fetch, fetch);
  } finally {
    dom.window.close();
  }
});

import type { Feature } from '../core/feature';
import { duelId } from '../geoguessr/routes';
import { nativeProps } from '../geoguessr/summary';
import type { Duel, NextData, NextRouter } from '../geoguessr/types';
const errorSelector = '[class*="error_errorPage__"]';
export const summaryRecovery: Feature = {
  id: 'summary-recovery',
  name: 'Recover old duel summaries',
  description: 'Fix old duel summaries that show “Game not found”.',
  enable({ page, api, events, network }, scope) {
    let previousId: string | undefined,
      attempted = false,
      busy = false,
      visit = 0;
    function syncVisit() {
      const id = duelId();
      if (id !== previousId) {
        previousId = id;
        attempted = false;
        visit++;
      }
      return id;
    }
    const valid = (id: string, version: number) =>
      scope.active && visit === version && duelId() === id;
    function status(message: string) {
      const errorPage = document.querySelector(errorSelector);
      if (!errorPage) return;
      let line = errorPage.querySelector<HTMLElement>('[data-summary-recovery]');
      if (!line) {
        line = document.createElement('p');
        line.dataset.summaryRecovery = '';
        line.className = errorPage.querySelector('p')?.className || '';
        line.setAttribute('role', 'status');
        line.style.marginTop = '12px';
        errorPage.append(line);
      }
      if (line.textContent !== message) line.textContent = message;
    }
    async function repair(game: Duel, initial: NextData, router: NextRouter, version: number) {
      const payload = nativeProps(initial, router.components?.[router.route]?.props, game);
      const summaryPath =
        location.pathname.match(/\/(?:team-)?duels\//)![0] + game.gameId + '/summary.json';
      const originalUrl = location.pathname + location.search + location.hash;
      const target = new URL(location.href);
      target.pathname = target.pathname.replace(/\/?$/, '').replace(/(?:\/summary)?$/, '/summary');
      target.searchParams.set('gg_summary_recovery', String(Date.now()));
      let intercepted = false;
      const remove = scope.own(
        network.intercept((url) => {
          if (
            valid(game.gameId, version) &&
            url.origin === location.origin &&
            url.pathname.includes('/_next/data/') &&
            url.pathname.endsWith(summaryPath)
          ) {
            intercepted = true;
            return new page.Response(JSON.stringify(payload), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            });
          }
          return undefined;
        }),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      try {
        const result = await Promise.race([
          router.replace(target.pathname + target.search + target.hash, undefined, {
            shallow: false,
            scroll: false,
          }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Native recovery timed out.')), 12_000);
            abort = () => reject(new Error('Recovery disabled.'));
            scope.signal.addEventListener('abort', abort, { once: true });
          }),
        ]);
        if (!valid(game.gameId, version)) return;
        if (!intercepted || result === false) throw new Error('Native recovery did not complete.');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (valid(game.gameId, version) && document.querySelector(errorSelector))
          throw new Error('The summary is still unavailable.');
      } finally {
        clearTimeout(timer);
        if (abort) scope.signal.removeEventListener('abort', abort);
        remove();
        // Also remove the temporary query parameter when disabled mid-recovery.
        if (
          visit === version &&
          duelId() === game.gameId &&
          location.pathname + location.search + location.hash ===
            target.pathname + target.search + target.hash
        )
          page.history.replaceState(page.history.state, '', originalUrl);
      }
    }
    async function check() {
      const id = syncVisit(),
        version = visit,
        router = page.next?.router;
      if (!id || busy || attempted || !router?.isReady || !document.querySelector(errorSelector))
        return;
      try {
        const initial = JSON.parse(
          document.getElementById('__NEXT_DATA__')?.textContent || '{}',
        ) as NextData;
        const current = router.components?.[router.route]?.props?.pageProps;
        const broken =
          current?.statusCode === 404 ||
          (initial.query?.token === id && initial.props?.pageProps?.statusCode === 404) ||
          /Game not found|This game couldn't be found/i.test(document.body?.textContent || '');
        if (!broken) return;
        attempted = true;
        busy = true;
        status('Trying to display this summary…');
        const game = await api.finishedDuel(id);
        if (valid(id, version)) await repair(game, initial, router, version);
      } catch (error) {
        if (valid(id, version)) {
          console.error('[BetterGEO summary recovery]', error);
          status(
            'Could not display this summary: ' +
              (error instanceof Error ? error.message : String(error)),
          );
        }
      } finally {
        busy = false;
        if (scope.active && visit !== version) events.schedule();
      }
    }
    scope.own(events.subscribe(check));
    scope.own(() =>
      document.querySelectorAll('[data-summary-recovery]').forEach((el) => el.remove()),
    );
  },
};

import type { Feature } from '../core/feature';
import { nativeSelector } from '../core/native-styles';
import { hydrated } from '../core/page';
import { duelId } from '../geoguessr/routes';
import { errorPage } from '../geoguessr/styles';
import { summaryProps } from '../geoguessr/summary';
import type { Duel, PageRouter, SummaryProps } from '../geoguessr/types';
const summaryRoute = /\/(?:team-)?duels\/\$token\/summary\/?$/;
const errorSelector = () => nativeSelector(errorPage, 'errorPage');
/** GeoGuessr's loader state for the current summary page. */
function summaryMatch(router: PageRouter | undefined) {
  return router?.state?.matches?.find((match) => summaryRoute.test(match.routeId ?? ''));
}
/**
 * Old duels make GeoGuessr's summary loader return 404 although the game server still
 * has them. Re-run the route loader and answer its server-function request with the
 * finished duel, so GeoGuessr renders its own summary page.
 */
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
      const errorPage = document.querySelector(errorSelector());
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
    async function repair(game: Duel, userId: string, router: PageRouter, version: number) {
      const payload = summaryProps(game, userId, summaryMatch(router)?.loaderData?.props);
      let intercepted = false;
      const remove = scope.own(
        network.intercept((url) => {
          if (
            !valid(game.gameId, version) ||
            url.origin !== location.origin ||
            !url.pathname.startsWith('/_serverFn/')
          )
            return undefined;
          // The loader request names its route and the page URL in a serialized payload.
          const query = decodeURIComponent(url.search);
          if (!/duels\/\[token\]\/summary/.test(query) || !query.includes(game.gameId))
            return undefined;
          intercepted = true;
          return new page.Response(JSON.stringify(payload), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      let abort: (() => void) | undefined;
      try {
        await Promise.race([
          router.invalidate(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Native recovery timed out.')), 12_000);
            abort = () => reject(new Error('Recovery disabled.'));
            scope.signal.addEventListener('abort', abort, { once: true });
          }),
        ]);
        if (!valid(game.gameId, version)) return;
        if (!intercepted) throw new Error('Native recovery did not complete.');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (valid(game.gameId, version) && document.querySelector(errorSelector()))
          throw new Error('The summary is still unavailable.');
      } finally {
        clearTimeout(timer);
        if (abort) scope.signal.removeEventListener('abort', abort);
        remove();
      }
    }
    async function check() {
      const id = syncVisit(),
        version = visit,
        router = page.__TSR_ROUTER__;
      const shown = document.querySelector(errorSelector());
      if (!id || busy || attempted || !router || !shown) return;
      if (!hydrated(shown)) {
        setTimeout(() => scope.active && events.schedule(), 150);
        return;
      }
      try {
        const props: SummaryProps | undefined = summaryMatch(router)?.loaderData?.props;
        const broken =
          props?.statusCode === 404 ||
          /Game not found|couldn.t be found/i.test(document.body?.textContent || '');
        if (!broken) return;
        attempted = true;
        busy = true;
        status('Trying to display this summary…');
        const [game, userId] = await Promise.all([api.finishedDuel(id), api.currentUserId()]);
        if (valid(id, version)) await repair(game, userId, router, version);
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

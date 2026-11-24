import type { PageWindow } from '../geoguessr/types';
import type { Cleanup } from './scope';
/** One DOM observer and navigation subscription for the entire userscript. */
export class PageEvents {
  private listeners = new Set<() => void | Promise<void>>();
  private observer: MutationObserver;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private originalPush: History['pushState'];
  private originalReplace: History['replaceState'];
  private push: History['pushState'];
  private replace: History['replaceState'];
  private stylesLoaded = (event: Event) => {
    const tag = (event.target as Element | null)?.tagName;
    if (tag === 'LINK' || tag === 'STYLE') this.schedule();
  };
  constructor(private page: PageWindow) {
    const notify = this.schedule;
    this.originalPush = page.history.pushState;
    this.originalReplace = page.history.replaceState;
    const push = this.originalPush,
      replace = this.originalReplace;
    this.push = function (...args) {
      const result = push.apply(this, args);
      notify();
      return result;
    };
    this.replace = function (...args) {
      const result = replace.apply(this, args);
      notify();
      return result;
    };
    page.history.pushState = this.push;
    page.history.replaceState = this.replace;
    page.addEventListener('popstate', notify);
    page.addEventListener('resize', notify);
    document.addEventListener('load', this.stylesLoaded, true);
    this.observer = new MutationObserver(notify);
    this.observer.observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-expanded'],
    });
  }
  subscribe(callback: () => void | Promise<void>): Cleanup {
    this.listeners.add(callback);
    this.schedule();
    return () => {
      this.listeners.delete(callback);
    };
  }
  schedule = () => {
    if (this.disposed || this.timer !== undefined) return;
    // Coalesce SPA renders; do not poll continuously on inactive pages.
    this.timer = setTimeout(() => {
      this.timer = undefined;
      for (const callback of this.listeners) {
        try {
          void Promise.resolve(callback()).catch((error) =>
            console.error('[BetterGEO page]', error),
          );
        } catch (error) {
          console.error('[BetterGEO page]', error);
        }
      }
    }, 80);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.observer.disconnect();
    this.listeners.clear();
    this.page.removeEventListener('popstate', this.schedule);
    this.page.removeEventListener('resize', this.schedule);
    document.removeEventListener('load', this.stylesLoaded, true);
    if (this.page.history.pushState === this.push) this.page.history.pushState = this.originalPush;
    if (this.page.history.replaceState === this.replace)
      this.page.history.replaceState = this.originalReplace;
  }
}

/**
 * GeoGuessr's React app hydrates the whole server-rendered document. Changing that markup
 * before React has hydrated it causes a hydration error and a full client re-render, so
 * wait until React has claimed the node (it tags hydrated nodes with `__reactFiber$…`).
 * Falls back to true after a while in case React's internals change.
 */
export function hydrated(
  node: Element | null | undefined,
  page: Pick<Window, 'performance'> = window,
) {
  if (!node) return false;
  return (
    Object.keys(node).some((key) => key.startsWith('__reactFiber$')) ||
    page.performance.now() > 20_000
  );
}

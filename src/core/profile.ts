import { hydrated, type PageEvents } from './page';
import type { Scope } from './scope';
import { viewedProfileId } from '../geoguessr/routes';
import { nativeSelector } from './native-styles';
import { profile } from '../geoguessr/styles';
/** One read per profile visit, with common stale-response and remount handling. */
export function watchProfile<T>(
  events: PageEvents,
  scope: Scope,
  options: {
    name: string;
    target(): Element | null | undefined;
    load(userId: string): Promise<T>;
    render(data: T, userId: string, target: Element): void;
    reset(): void;
  },
) {
  let user: string | undefined,
    visit = 0,
    attempted = false,
    loading = false;
  let data: T | undefined;
  scope.own(() => {
    visit++;
    options.reset();
  });
  scope.own(
    events.subscribe(async () => {
      const id = viewedProfileId();
      if (id !== user) {
        visit++;
        user = id;
        attempted = false;
        loading = false;
        data = undefined;
        options.reset();
      }
      if (!id || !document.head || loading) return;
      const target = options.target();
      if (!target) return;
      if (!hydrated(target)) {
        // Hydration does not mutate the DOM, so nothing else would wake us up.
        setTimeout(() => scope.active && events.schedule(), 150);
        return;
      }
      const current = visit;
      const valid = () => scope.active && current === visit && viewedProfileId() === id;
      if (!attempted) {
        attempted = true;
        loading = true;
        try {
          const result = await options.load(id);
          if (valid()) data = result;
        } catch (error) {
          if (valid()) console.error(`[BetterGEO ${options.name}]`, error);
        } finally {
          if (visit === current) loading = false;
        }
      }
      if (!valid() || data === undefined) return;
      const latest = options.target();
      if (latest?.isConnected) options.render(data, id, latest);
    }),
  );
}
export function profileWidgets() {
  return (
    document.querySelector(nativeSelector(profile, 'staticWidgets')) ||
    document.querySelector(nativeSelector(profile, 'widgetRow'))?.parentElement
  );
}

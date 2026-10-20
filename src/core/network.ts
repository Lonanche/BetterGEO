import type { PageWindow } from '../geoguessr/types';
import type { Cleanup } from './scope';
type Observer = { matches: (url: URL) => boolean; accept: (url: URL, data: unknown) => void };
type Interceptor = (url: URL) => Response | undefined;
/** Shared middleware; observation failures must never alter site requests. */
export class Network {
  private observers = new Set<Observer>();
  private interceptors = new Set<Interceptor>();
  private restore: Cleanup;
  constructor(private page: PageWindow) {
    const network = this,
      originalFetch = page.fetch;
    const wrapped: typeof fetch = async function (input, init) {
      const url = network.url(input);
      if (url)
        for (const intercept of network.interceptors) {
          try {
            const response = intercept(url);
            if (response) return response;
          } catch (error) {
            console.error('[BetterGEO interceptor]', error);
          }
        }
      const response = await originalFetch.call(page, input, init);
      if (url && response.ok && network.interested(url)) {
        try {
          void response
            .clone()
            .json()
            .then((data) => network.emit(url, data))
            .catch(() => {});
        } catch {
          /* A non-cloneable response still belongs to the site. */
        }
      }
      return response;
    };
    page.fetch = wrapped;
    const proto = page.XMLHttpRequest.prototype,
      originalOpen = proto.open;
    const urls = new WeakMap<XMLHttpRequest, URL>();
    const observed = new WeakSet<XMLHttpRequest>();
    const open: typeof proto.open = function (
      this: XMLHttpRequest,
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      const result = Reflect.apply(originalOpen, this, [method, url, ...rest]);
      const parsed = network.url(url);
      if (parsed) urls.set(this, parsed);
      else urls.delete(this);
      // One load listener per XHR, including objects reused after abort/open.
      if (!observed.has(this)) {
        observed.add(this);
        this.addEventListener('load', () => {
          const current = urls.get(this);
          if (!current || this.status < 200 || this.status >= 300 || !network.interested(current))
            return;
          try {
            network.emit(
              current,
              this.responseType === 'json' ? this.response : JSON.parse(this.responseText),
            );
          } catch {
            /* Non-JSON responses cannot affect the site. */
          }
        });
      }
      return result;
    };
    proto.open = open;
    this.restore = () => {
      if (page.fetch === wrapped) page.fetch = originalFetch;
      if (proto.open === open) proto.open = originalOpen;
    };
  }
  private url(input: RequestInfo | URL): URL | undefined {
    try {
      return new URL(
        input && typeof input === 'object' && 'url' in input ? input.url : String(input),
        this.page.location.href,
      );
    } catch {
      return undefined;
    }
  }
  private matches(observer: Observer, url: URL) {
    try {
      return observer.matches(url);
    } catch (error) {
      console.error('[BetterGEO observer]', error);
      return false;
    }
  }
  private interested(url: URL) {
    return [...this.observers].some((observer) => this.matches(observer, url));
  }
  private emit(url: URL, data: unknown) {
    for (const observer of this.observers) {
      try {
        if (this.matches(observer, url)) observer.accept(url, data);
      } catch (error) {
        console.error('[BetterGEO response]', error);
      }
    }
  }
  observe(matches: Observer['matches'], accept: Observer['accept']): Cleanup {
    const observer = { matches, accept };
    this.observers.add(observer);
    return () => {
      this.observers.delete(observer);
    };
  }
  intercept(callback: Interceptor): Cleanup {
    this.interceptors.add(callback);
    return () => {
      this.interceptors.delete(callback);
    };
  }
  dispose() {
    this.observers.clear();
    this.interceptors.clear();
    this.restore();
  }
}

export type Cleanup = () => void;
/** All resources belong to an enable cycle, including outstanding async work. */
export class Scope {
  private readonly controller = new AbortController();
  private cleanups = new Set<Cleanup>();
  get signal() {
    return this.controller.signal;
  }
  get active() {
    return !this.signal.aborted;
  }
  own(cleanup: Cleanup): Cleanup {
    const release = () => {
      if (this.cleanups.delete(release)) cleanup();
    };
    if (this.active) this.cleanups.add(release);
    else cleanup();
    return release;
  }
  listen(target: EventTarget, event: string, callback: EventListener) {
    target.addEventListener(event, callback);
    this.own(() => target.removeEventListener(event, callback));
  }
  dispose() {
    if (!this.active) return;
    this.controller.abort();
    for (const cleanup of [...this.cleanups].reverse()) {
      try {
        cleanup();
      } catch (error) {
        console.error('[BetterGEO cleanup]', error);
      }
    }
    this.cleanups.clear();
  }
}

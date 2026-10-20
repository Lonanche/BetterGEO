import type { Feature, Services } from './feature';
import { Scope } from './scope';
export class FeatureManager {
  private running = new Map<string, Scope>();
  private settings: Record<string, boolean>;
  constructor(
    readonly features: Feature[],
    private services: Services,
  ) {
    const stored: unknown = GM_getValue('bettergeo.features.v1', {});
    this.settings = {};
    for (const feature of features) {
      const value =
        stored && typeof stored === 'object'
          ? (stored as Record<string, unknown>)[feature.id]
          : undefined;
      this.settings[feature.id] = typeof value === 'boolean' ? value : true;
    }
  }
  enabled(id: string) {
    return this.settings[id] === true;
  }
  start() {
    for (const feature of this.features)
      if (this.enabled(feature.id)) {
        try {
          this.activate(feature);
        } catch (error) {
          this.settings[feature.id] = false;
          console.error(`[BetterGEO ${feature.id}]`, error);
        }
      }
  }
  private activate(feature: Feature) {
    if (this.running.has(feature.id)) return;
    const scope = new Scope();
    try {
      feature.enable(this.services, scope);
      this.running.set(feature.id, scope);
    } catch (error) {
      scope.dispose();
      throw error;
    }
  }
  set(id: string, enabled: boolean) {
    const feature = this.features.find((feature) => feature.id === id);
    if (!feature) throw new Error(`Unknown feature: ${id}`);
    const wasRunning = this.running.has(id);
    if (enabled) this.activate(feature);
    const next = { ...this.settings, [id]: enabled };
    try {
      GM_setValue('bettergeo.features.v1', next);
    } catch (error) {
      if (enabled && !wasRunning) {
        this.running.get(id)?.dispose();
        this.running.delete(id);
      }
      throw error;
    }
    this.settings = next;
    if (!enabled) {
      this.running.get(id)?.dispose();
      this.running.delete(id);
    }
  }

  dispose() {
    for (const scope of this.running.values()) scope.dispose();
    this.running.clear();
  }
}

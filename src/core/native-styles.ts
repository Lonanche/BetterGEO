/**
 * GeoGuessr styles its UI with CSS modules whose generated class names depend on its
 * bundler, so they change without notice. Formats seen so far:
 *
 *   Vite / TanStack Start (Nov 2026): `_widgetRow_63pfr_232`        module `63pfr`
 *   Next.js (before):                 `profile-v2_widgetRow__n1A_N` module `profile-v2`
 *
 * Never hard-code a generated name. Describe a module by the local names BetterGEO uses
 * from it (its signature, see `geoguessr/styles.ts`), and read the real names from the
 * loaded stylesheets and DOM at runtime. `npm run check:site` verifies every signature
 * against the live site.
 */
export interface StyleModule {
  /** Label for diagnostics only. */
  readonly name: string;
  /** Local class names that together identify exactly one GeoGuessr CSS module. */
  readonly signature: readonly string[];
  /** Break ties by preferring the module that shares a stylesheet with this one. */
  readonly near?: StyleModule;
}

export interface ParsedClass {
  module: string;
  local: string;
}

const formats = [
  // Vite: _[local]_[hash:5]_[line]
  /^_(?<local>[A-Za-z][\w]*?)_(?<module>[a-z0-9]{5})_\d+$/,
  // Next.js: [file]_[local]__[hash:5]
  /^(?<module>[a-z][a-z0-9-]*)_(?<local>[A-Za-z][\w]*?)__[\w-]{5}$/,
];

export function parseClass(name: string): ParsedClass | undefined {
  for (const format of formats) {
    const groups = name.match(format)?.groups;
    if (groups) return { module: groups.module!, local: groups.local! };
  }
  return undefined;
}

/** Matches an element carrying `local` from any module, in every known format. */
export const looseSelector = (local: string) => `[class*="_${local}_"]`;

/** module → local → generated class, plus which stylesheets each module came from. */
export class StyleIndex {
  readonly modules = new Map<string, Map<string, string>>();
  readonly sheets = new Map<string, Set<number>>();
  add(name: string, sheet = -1) {
    const parsed = parseClass(name);
    if (!parsed) return;
    let locals = this.modules.get(parsed.module);
    if (!locals) this.modules.set(parsed.module, (locals = new Map()));
    if (!locals.has(parsed.local)) locals.set(parsed.local, name);
    if (sheet >= 0) {
      let sheets = this.sheets.get(parsed.module);
      if (!sheets) this.sheets.set(parsed.module, (sheets = new Set()));
      sheets.add(sheet);
    }
  }
  clone() {
    const copy = new StyleIndex();
    for (const [module, locals] of this.modules) copy.modules.set(module, new Map(locals));
    for (const [module, sheets] of this.sheets) copy.sheets.set(module, new Set(sheets));
    return copy;
  }
  /** The generated module key for a signature, or undefined when it is not loaded. */
  find(spec: StyleModule): string | undefined {
    return this.candidates(spec)[0];
  }
  /** Every module matching a signature, best first; more than one means it is ambiguous. */
  candidates(spec: StyleModule): string[] {
    const score = (module: string) => {
      const locals = this.modules.get(module)!;
      return spec.signature.filter((local) => locals.has(local)).length;
    };
    const all = spec.signature.length;
    let candidates = [...this.modules.keys()].filter((module) => score(module) === all);
    if (!candidates.length) {
      // Only DOM classes were seen (styles not loaded): accept a clear partial match.
      const best = Math.max(0, ...[...this.modules.keys()].map(score));
      if (best < Math.min(2, all) || best * 2 < all) return [];
      candidates = [...this.modules.keys()].filter((module) => score(module) === best);
    }
    if (candidates.length > 1 && spec.near) {
      const near = this.find(spec.near);
      const nearSheets = near ? this.sheets.get(near) : undefined;
      const together = candidates.filter((module) =>
        [...(this.sheets.get(module) ?? [])].some((sheet) => nearSheets?.has(sheet)),
      );
      if (together.length) candidates = together;
    }
    return candidates;
  }
}

function selectors(rules: CSSRuleList, visit: (name: string) => void) {
  for (const rule of rules) {
    if ('selectorText' in rule && typeof rule.selectorText === 'string')
      for (const match of rule.selectorText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) visit(match[1]!);
    if ('cssRules' in rule) {
      try {
        selectors(rule.cssRules as CSSRuleList, visit);
      } catch {
        /* Ignore inaccessible nested rules. */
      }
    }
  }
}

// Loaded stylesheets rarely change; reuse the index until one is added or edited.
let sheetNames = new WeakMap<CSSStyleSheet, { rules: number; names: string[] }>();
let cached: { key: unknown[]; index: StyleIndex } | undefined;
function stylesheetIndex() {
  const sheets: { sheet: CSSStyleSheet; rules: CSSRuleList }[] = [];
  for (const sheet of document.styleSheets) {
    try {
      sheets.push({ sheet, rules: sheet.cssRules });
    } catch {
      /* Cross-origin stylesheets may deny CSSOM access. */
    }
  }
  const key = sheets.flatMap(({ sheet, rules }) => [sheet, rules.length]);
  if (cached && cached.key.length === key.length && cached.key.every((part, i) => part === key[i]))
    return cached.index;
  const index = new StyleIndex();
  sheets.forEach(({ sheet, rules }, position) => {
    let entry = sheetNames.get(sheet);
    if (!entry || entry.rules !== rules.length) {
      const names: string[] = [];
      selectors(rules, (name) => names.push(name));
      entry = { rules: rules.length, names };
      sheetNames.set(sheet, entry);
    }
    for (const name of entry.names) index.add(name, position);
  });
  cached = { key, index };
  return index;
}

/** Testing hook: forget cached stylesheet scans. */
export function resetStyleCache() {
  sheetNames = new WeakMap();
  cached = undefined;
}

export interface NativeModule {
  /** Whether GeoGuessr's CSS for this module is loaded. */
  readonly styled: boolean;
  /** Generated class names for `locals`, space separated; unknown locals are skipped. */
  cls(...locals: (string | false | undefined)[]): string;
  /** A selector for `local`: exact when resolved, otherwise format-agnostic. */
  sel(local: string): string;
}

/**
 * Snapshot of GeoGuessr's loaded CSS modules. Includes classes only present in the DOM
 * unless `dom` is false (use that for cheap lookups on every page update).
 */
export function nativeStyles({ dom = true } = {}) {
  const styled = stylesheetIndex();
  const index = dom ? styled.clone() : styled;
  if (dom)
    for (const el of document.querySelectorAll('[class]'))
      for (const name of el.classList) index.add(name);
  const cache = new Map<StyleModule, NativeModule>();
  function module(spec: StyleModule): NativeModule {
    const cached = cache.get(spec);
    if (cached) return cached;
    const key = index.find(spec);
    const locals = key ? index.modules.get(key)! : new Map<string, string>();
    const styledKey = styled.find(spec);
    const result: NativeModule = {
      styled: !!styledKey && styledKey === key,
      cls: (...names) =>
        names
          .filter((name): name is string => !!name)
          .map((name) => locals.get(name))
          .filter(Boolean)
          .join(' '),
      sel: (local) => {
        const name = locals.get(local);
        return name ? `.${name}` : looseSelector(local);
      },
    };
    cache.set(spec, result);
    return result;
  }
  return { module };
}

/** Selector for one module class, from stylesheets only (cheap enough for every update). */
export function nativeSelector(spec: StyleModule, local: string) {
  return nativeStyles({ dom: false }).module(spec).sel(local);
}

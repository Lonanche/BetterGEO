/** Resolve CSS module hashes from loaded styles, even when a native widget is hidden. */
export function nativeStyles(
  hints: Record<string, string> = {
    widget_header___ZOfT: '[class*="widget_widgetInner__"] > [class*="widget_header__"]',
    widget_header__8mkus: '[class*="widget_title__"] > [class*="widget_header__"]',
  },
) {
  const names = new Set<string>();
  function scan(rules: CSSRuleList) {
    for (const rule of rules) {
      if ('selectorText' in rule && typeof rule.selectorText === 'string') {
        for (const match of rule.selectorText.matchAll(/\.([a-zA-Z_][\w-]*__[\w-]+)/g))
          names.add(match[1]!);
      }
      if ('cssRules' in rule) {
        try {
          scan(rule.cssRules as CSSRuleList);
        } catch {
          /* Ignore inaccessible nested rules. */
        }
      }
    }
  }
  for (const sheet of document.styleSheets) {
    try {
      scan(sheet.cssRules);
    } catch {
      /* Cross-origin stylesheets may deny CSSOM access. */
    }
  }
  const styledNames = new Set(names);
  for (const el of document.querySelectorAll('[class]'))
    for (const name of el.classList) names.add(name);
  const cache = new Map<string, string>();
  const byPrefix = new Map<string, string[]>();
  for (const name of names) {
    const prefix = name.slice(0, -5);
    const group = byPrefix.get(prefix) ?? [];
    group.push(name);
    byPrefix.set(prefix, group);
  }
  function resolveOne(name: string): string {
    const cached = cache.get(name);
    if (cached) return cached;
    const prefix = name.slice(0, -5),
      candidates = byPrefix.get(prefix) ?? [];
    const styled = candidates.filter((candidate) => styledNames.has(candidate));
    const hint = hints[name];
    const contextual = hint
      ? [...(document.querySelector(hint)?.classList ?? [])].find(
          (candidate) => candidate.startsWith(prefix) && candidate.length === name.length,
        )
      : undefined;
    // Two different CSS modules export widget_header. Use native DOM context to
    // distinguish them; never let an injected old hash override a loaded new one.
    let result = name;
    if (styledNames.has(name)) result = name;
    else if (contextual && (!styled.length || styledNames.has(contextual))) result = contextual;
    else if (styled.length === 1) result = styled[0]!;
    else if (!names.has(name) && candidates.length === 1) result = candidates[0]!;
    cache.set(name, result);
    return result;
  }
  const resolve = (...snapshot: string[]) => snapshot.map(resolveOne).join(' ');
  return {
    resolve,
    has: (prefix: string) => [...styledNames].some((name) => name.startsWith(prefix)),
  };
}

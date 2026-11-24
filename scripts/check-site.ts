/**
 * Live compatibility check: does geoguessr.com still provide everything BetterGEO uses?
 *
 *   npm run check:site
 *
 * Loads GeoGuessr's current stylesheets and scripts and verifies, with the same parsing
 * code the userscript runs:
 *   - every CSS module signature in src/geoguessr/styles.ts matches exactly one module;
 *   - page hooks outside CSS (routes, router global, data-qa attributes) still exist;
 *   - hard-coded image URLs still load.
 * Exits non-zero on any failure, so CI can flag a GeoGuessr update before users do.
 */
import { StyleIndex, parseClass } from '../src/core/native-styles';
import { allModules, images } from '../src/geoguessr/styles';

const origin = 'https://www.geoguessr.com';
/** A long-standing public profile, used only to check profile page markup. */
const profilePath = '/user/5b51062a4010740f7cd91dd5';
const headers = { 'user-agent': 'Mozilla/5.0 (BetterGEO compatibility check)' };

async function text(path: string) {
  const response = await fetch(new URL(path, origin), { headers });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.text();
}
async function pool<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>) {
  const results: R[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (next < items.length) {
        const index = next++;
        results[index] = await run(items[index]!);
      }
    }),
  );
  return results;
}
const assets = (source: string, extension: string) =>
  new Set(
    [...source.matchAll(new RegExp(`[\\w.-]+\\.${extension}\\b`, 'g'))]
      .map((match) => match[0])
      .filter((name) => /-[\w-]{8}\.\w+$/.test(name)),
  );

const failures: string[] = [];
const warnings: string[] = [];
const ok = (message: string) => console.log(`  ok    ${message}`);
const fail = (message: string) => {
  failures.push(message);
  console.log(`  FAIL  ${message}`);
};

const [home, profilePage] = await Promise.all([text('/'), text(profilePath)]);
const base = home.match(/\/static\/_start\//) ? '/static/_start/' : undefined;
if (!base) fail('GeoGuessr no longer serves its bundle from /static/_start/ (new bundler?)');

// The entry script lists every lazily loaded chunk, including all stylesheets.
const entries = [...assets(home, 'js')].filter((name) => /^index-/.test(name));
const scripts = await pool([...entries], 4, (name) => text(base + name));
// Lazily loaded chunks with hooks checked below: route loaders and the maps API client.
const lazy = [...new Set(scripts.flatMap((script) => [...assets(script, 'js')]))].filter((name) =>
  /^(?:summary|maps\.api)-/.test(name),
);
scripts.push(...(await pool(lazy, 8, (name) => text(base + name))));
const cssFiles = new Set([...assets(home, 'css'), ...assets(profilePage, 'css')]);
for (const script of scripts) for (const name of assets(script, 'css')) cssFiles.add(name);
console.log(`Loaded ${scripts.length} scripts and ${cssFiles.size} stylesheets.\n`);

const index = new StyleIndex();
const stylesheets = await pool([...cssFiles], 16, (name) => text(base + name).catch(() => ''));
let parsed = 0;
stylesheets.forEach((css, sheet) => {
  for (const match of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    if (parseClass(match[1]!)) parsed++;
    index.add(match[1]!, sheet);
  }
});
if (!parsed) fail('No CSS-module class names parsed: GeoGuessr changed its class name format');

console.log('CSS modules (src/geoguessr/styles.ts)');
for (const spec of allModules) {
  const found = index.candidates(spec);
  const full = found.filter((module) =>
    spec.signature.every((local) => index.modules.get(module)?.has(local)),
  );
  if (!full.length) {
    const best = found[0] ?? '';
    const missing = spec.signature.filter((local) => !index.modules.get(best)?.has(local));
    fail(
      `${spec.name}: no module has [${spec.signature.join(', ')}]` +
        (best ? ` (closest ${best}, missing ${missing.join(', ')})` : ''),
    );
  } else if (full.length > 1) {
    warnings.push(`${spec.name}: matches ${full.length} modules (${full.join(', ')}); add a class`);
    ok(`${spec.name} → ${full[0]} (ambiguous)`);
  } else ok(`${spec.name} → ${full[0]}`);
}

console.log('\nPage hooks');
const bundle = scripts.join('\n');
const hooks: [string, boolean][] = [
  ['router global __TSR_ROUTER__', bundle.includes('__TSR_ROUTER__')],
  ['server functions under /_serverFn/', bundle.includes('/_serverFn/')],
  ['duel summary route /duels/$token/summary', bundle.includes('/duels/$token/summary')],
  ['duel summary loader id duels/[token]/summary', /duels\/\[token\]\/summary/.test(bundle)],
  ['profile route /user/$slug', bundle.includes('/user/$slug')],
  ['map route /maps/$slug', bundle.includes('/maps/$slug')],
  ['results route /results/$token', bundle.includes('/results/$token')],
  ['tournaments route /multiplayer/tournaments', bundle.includes('/multiplayer/tournaments')],
  ['account API /api/v3/profiles/', bundle.includes('/api/v3/profiles/')],
  ['map scores API /api/v3/scores/…/me/games', /\/api\/v3\/scores\/[^`]*\/me\/games/.test(bundle)],
  ['profile name data-qa="user-card-title"', profilePage.includes('data-qa="user-card-title"')],
];
for (const [label, present] of hooks) (present ? ok : fail)(label);

console.log('\nImages');
for (const [name, path] of Object.entries(images)) {
  const response = await fetch(new URL(path, origin), { headers, method: 'HEAD' });
  (response.ok ? ok : fail)(`${name} ${path} (HTTP ${response.status})`);
}

for (const warning of warnings) console.log(`\nwarning: ${warning}`);
if (failures.length) {
  console.log(`\n${failures.length} check(s) failed. GeoGuessr changed something BetterGEO uses.`);
  process.exit(1);
}
console.log('\nAll checks passed.');

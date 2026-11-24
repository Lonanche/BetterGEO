import type { StyleModule } from '../src/core/native-styles';
import { allModules } from '../src/geoguessr/styles';

/** A five-character Vite module hash per registry entry, e.g. `m0003`. */
const hash = (spec: StyleModule) => `m${allModules.indexOf(spec).toString(36).padStart(4, '0')}`;

/** Generated class names in GeoGuessr's current (Vite) format: `_local_hash_line`. */
export function cls(spec: StyleModule, ...locals: string[]) {
  return locals.map((local) => `_${local}_${hash(spec)}_1`).join(' ');
}
export const sel = (spec: StyleModule, local: string) => `.${cls(spec, local)}`;

/** One stylesheet defining every class BetterGEO looks up, like the live site. */
export const nativeCss = `<style>${allModules
  .flatMap((spec) => spec.signature.map((local) => `.${cls(spec, local)}{color:inherit}`))
  .join('')}</style>`;

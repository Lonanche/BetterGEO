const duelRoute =
  /^\/(?:[a-z]{2}\/)?((?:team-)?duels)\/([a-f0-9]{24}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:\/summary)?\/?$/i;
export function duelId(path = location.pathname) {
  return path.match(duelRoute)?.[2];
}
export function profileId(path = location.pathname) {
  return path.match(/^\/(?:[a-z]{2}\/)?user\/([^/]+)\/?$/)?.[1];
}
export function mapId(path = location.pathname) {
  return path.match(/^\/(?:[a-z]{2}\/)?maps\/([^/]+)/)?.[1];
}
export const resultPath = (token: string) => `/results/${encodeURIComponent(token)}`;
export const duelPath = (id: string, view: 'summary' | 'replay') =>
  `/duels/${encodeURIComponent(id)}/${view}`;

/** The account profile URL has no ID; use its own public-profile copy link. */
export function viewedProfileId(path = location.pathname) {
  const direct = profileId(path);
  if (direct) return direct;
  if (!/^\/(?:[a-z]{2}\/)?me\/profile\/?$/.test(path)) return undefined;
  const value = document.querySelector<HTMLInputElement>('[name="copy-link"]')?.value;
  if (!value) return undefined;
  try {
    const url = new URL(value, location.origin);
    if (url.origin !== location.origin) return undefined;
    return profileId(url.pathname);
  } catch {
    return undefined;
  }
}

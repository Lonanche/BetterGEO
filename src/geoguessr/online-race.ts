export interface RaceParticipant {
  region: string;
  name: string;
  nick: string;
  avatar?: string;
  countryCode?: string;
  position?: number;
  total?: number;
  points: number[];
}

/** Read only the inert Next.js data; never execute the fetched document. */
export function onlineRacePlayers(html: string): Map<string, RaceParticipant> {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const data = JSON.parse(doc.querySelector('#__NEXT_DATA__')?.textContent ?? 'null');
  const race: unknown = data?.props?.pageProps?.race;
  if (!race || typeof race !== 'object' || Array.isArray(race))
    throw new Error('Online race standings unavailable.');
  const players = new Map<string, RaceParticipant>();
  for (const [region, value] of Object.entries(race)) {
    if (
      !value ||
      typeof value !== 'object' ||
      !('players' in value) ||
      !Array.isArray(value.players)
    )
      throw new Error('Unexpected online race standings.');
    for (const player of value.players) {
      if (!player || typeof player.id !== 'string' || !/^[a-f0-9]{24}$/i.test(player.id))
        throw new Error('Unexpected online race player.');
      players.set(player.id, {
        region: region === 'Apac' ? 'APAC' : region === 'Emea' ? 'EMEA' : region,
        name: typeof value.name === 'string' ? value.name : 'World League online race',
        nick:
          typeof player.nick === 'string'
            ? player.nick
            : typeof player.alias === 'string'
              ? player.alias
              : player.id,
        avatar:
          typeof player.avatar === 'string' && /^pin\/[\w.-]+$/.test(player.avatar)
            ? player.avatar
            : undefined,
        countryCode:
          typeof player.countryCode === 'string' && /^[a-z]{2}$/i.test(player.countryCode)
            ? player.countryCode.toLowerCase()
            : undefined,
        position:
          Number.isInteger(player.position) && player.position > 0 ? player.position : undefined,
        total:
          typeof player.total === 'number' && Number.isFinite(player.total)
            ? player.total
            : undefined,
        points: Array.isArray(player.points)
          ? player.points.filter(
              (point: unknown): point is number =>
                typeof point === 'number' && Number.isFinite(point),
            )
          : [],
      });
    }
  }
  return players;
}

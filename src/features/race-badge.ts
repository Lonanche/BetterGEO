import type { RaceParticipant } from '../geoguessr/online-race';
import { raceTrackerUrl } from '../geoguessr/race-tracker';

export function refreshRaceBadge(badge: HTMLElement, player: RaceParticipant) {
  const projection = player.projection;
  const position = projection?.position ?? player.position;
  const stale =
    projection &&
    (projection.stale ||
      (!projection.completed && Date.now() - projection.updatedAt > 10 * 60_000));
  const text = `${player.region}${position === undefined ? '' : ` #${position}`}`;
  const title = [
    player.name.toLowerCase().includes(player.region.toLowerCase())
      ? player.name
      : `${player.name} · ${player.region}`,
    ...(projection
      ? [
          ...(projection.waitingForWeek
            ? ['Waiting for this week’s leaderboard; showing the previous week.']
            : []),
          ...(stale ? ['Update delayed: these projections are based on an older snapshot.'] : []),
          `Projected regional position: #${projection.position} (unofficial)`,
          projection.completed
            ? `Completed week ${projection.weekIndex + 1} snapshot; requires at least 10 ranked games.`
            : `If week ${projection.weekIndex + 1} ended now; requires at least 10 ranked games in that week.`,
          `Projected total: ${projection.total} points`,
        ]
      : ['Official standings (projection unavailable).']),
    player.position === undefined ? '' : `Official regional position: #${player.position}`,
    player.total === undefined ? '' : `Total: ${player.total} points (official)`,
    ...player.points
      .slice(0, projection ? projection.weekIndex : player.points.length)
      .map((points, index) => `Week ${index + 1}: ${points} points (official)`),
    ...(projection
      ? [
          `Week ${projection.weekIndex + 1}: ${projection.weekPoints} points (${projection.completed ? 'completed snapshot' : 'projected'}) · Games played: ${projection.gamesWeek}`,
          `Projection updated: ${new Date(projection.updatedAt).toLocaleString()}`,
          `Source: elorace · ${raceTrackerUrl}`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join('\n');
  if (badge.textContent !== text) badge.textContent = text;
  if (badge.dataset.region !== player.region) badge.dataset.region = player.region;
  const source = projection ? 'projection' : 'official';
  if (badge.dataset.source !== source) badge.dataset.source = source;
  if (badge.title !== title) badge.title = title;
  if (badge.getAttribute('aria-label') !== title) badge.setAttribute('aria-label', title);
}

import type { Duel, GameHistory } from './types';
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const optionalString = (value: unknown) => value == null || typeof value === 'string';
const optionalNumber = (value: unknown) =>
  value == null || (typeof value === 'number' && Number.isFinite(value));
function historyRound(value: unknown) {
  return record(value) && optionalString(value.startTime) && optionalString(value.endTime);
}
function historyTeam(value: unknown) {
  return (
    record(value) &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        record(player) &&
        typeof player.playerId === 'string' &&
        optionalNumber(player.rankedSystemRating) &&
        optionalNumber(player.tier),
    )
  );
}
function round(value: unknown) {
  return (
    record(value) &&
    typeof value.roundNumber === 'number' &&
    Number.isFinite(value.roundNumber) &&
    optionalNumber(value.lat) &&
    optionalNumber(value.lng) &&
    optionalNumber(value.multiplier) &&
    optionalNumber(value.damageMultiplier) &&
    optionalString(value.startTime) &&
    optionalString(value.endTime) &&
    (value.panorama == null ||
      (record(value.panorama) &&
        optionalNumber(value.panorama.lat) &&
        optionalNumber(value.panorama.lng)))
  );
}
function team(value: unknown) {
  return (
    record(value) &&
    Array.isArray(value.players) &&
    value.players.every(
      (player) =>
        record(player) &&
        typeof player.playerId === 'string' &&
        optionalNumber(player.rankedSystemRating) &&
        optionalNumber(player.tier) &&
        (player.guesses == null || Array.isArray(player.guesses)),
    ) &&
    (value.roundResults == null ||
      (Array.isArray(value.roundResults) &&
        value.roundResults.every(
          (result) => record(result) && typeof result.roundNumber === 'number',
        )))
  );
}
export function historyResponse(data: unknown): GameHistory {
  if (!record(data) || !Array.isArray(data.entries))
    throw new Error('Unexpected game history response.');
  const entries = data.entries.filter(
    (entry) =>
      record(entry) &&
      typeof entry.gameId === 'string' &&
      entry.gameId.length &&
      Array.isArray(entry.players) &&
      entry.players.every(
        (player) =>
          record(player) &&
          typeof player.id === 'string' &&
          optionalString(player.nick) &&
          optionalString(player.countryCode) &&
          optionalNumber(player.rating) &&
          optionalNumber(player.tier) &&
          (player.pin == null || (record(player.pin) && optionalString(player.pin.url))),
      ) &&
      (entry.duel == null ||
        (record(entry.duel) &&
          optionalString(entry.duel.gameMode) &&
          optionalString(entry.duel.winnerId) &&
          (entry.duel.teams == null ||
            (Array.isArray(entry.duel.teams) && entry.duel.teams.every(historyTeam))) &&
          (entry.duel.rounds == null ||
            (Array.isArray(entry.duel.rounds) && entry.duel.rounds.every(historyRound))))),
  );
  // Validate once at the API boundary, keeping malformed entries out of renderers.
  return { entries } as GameHistory;
}
export function finishedDuelResponse(data: unknown, id: string): Duel {
  if (
    !record(data) ||
    data.gameId !== id ||
    data.status !== 'Finished' ||
    !Array.isArray(data.rounds) ||
    !data.rounds.every(round) ||
    !Array.isArray(data.teams) ||
    !data.teams.every(team) ||
    (data.options != null && !record(data.options))
  )
    throw new Error('Finished duel data unavailable.');
  return data as unknown as Duel;
}

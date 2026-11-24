import type { Duel, SummaryProps } from './types';
export function summaryShape(game: Duel) {
  const options = game.options || {};
  // Exclude pre-generated locations for rounds which were never played.
  const rounds = game.rounds.filter(
    (round) =>
      round.startTime ||
      round.endTime ||
      game.teams.some((team) =>
        team.roundResults?.some((result) => result.roundNumber === round.roundNumber),
      ),
  );
  return {
    gameId: game.gameId,
    context: game.context ?? null,
    finishedAt: Date.parse(rounds.at(-1)?.endTime ?? '') || undefined,
    options: {
      competitiveGameMode: options.competitiveGameMode,
      countAllGuesses: !!options.countAllGuesses,
      isRated: !!options.isRated,
      isTeamDuels: !!options.isTeamDuels,
      mapName: options.map?.name || 'Recovered duel',
      mapSlug: options.mapSlug || options.map?.slug,
      maxRoundTime: options.maxRoundTime ?? 0,
      mode: options.movementOptions?.forbidRotating
        ? 'NoMoveNoZoom'
        : options.movementOptions?.forbidMoving
          ? 'NoMove'
          : 'Moving',
      roundWinMultiplierIncrement: options.roundWinMultiplierIncrement || 0,
    },
    teams: game.teams.map((team) => ({
      id: team.id,
      name: team.name,
      players: team.players.map((player) => ({
        playerId: player.playerId,
        guesses: player.guesses || [],
      })),
      roundResults: team.roundResults || [],
    })),
    rounds: rounds.map((round) => ({
      roundNumber: round.roundNumber,
      isHealingRound: !!round.isHealingRound,
      multiplier: round.multiplier ?? round.damageMultiplier ?? 1,
      lat: round.panorama?.lat ?? round.lat,
      lng: round.panorama?.lng ?? round.lng,
      panorama: { lat: round.panorama?.lat ?? round.lat, lng: round.panorama?.lng ?? round.lng },
    })),
  };
}
/** Loader props for GeoGuessr's duel summary page, keeping any other props it returned. */
export function summaryProps(game: Duel, userId: string, current: SummaryProps = {}): SummaryProps {
  return { ...current, statusCode: 200, game: summaryShape(game), userId };
}

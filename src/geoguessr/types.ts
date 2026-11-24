export interface Player {
  id: string;
  nick?: string;
  countryCode?: string;
  rating?: number;
  tier?: number;
  pin?: { url?: string };
}
interface TeamPlayer {
  playerId: string;
  rankedSystemRating?: number;
  tier?: number;
  guesses?: unknown[];
}
interface Team {
  id: string;
  name?: string;
  players: TeamPlayer[];
  roundResults?: { roundNumber: number; [key: string]: unknown }[];
}
interface DuelRound {
  roundNumber: number;
  startTime?: string;
  endTime?: string;
  isHealingRound?: boolean;
  multiplier?: number;
  damageMultiplier?: number;
  lat?: number;
  lng?: number;
  panorama?: { lat?: number; lng?: number };
}
export interface Duel {
  gameId: string;
  status: string;
  context?: unknown;
  rounds: DuelRound[];
  teams: Team[];
  options?: {
    competitiveGameMode?: string;
    countAllGuesses?: boolean;
    isRated?: boolean;
    isTeamDuels?: boolean;
    map?: { name?: string; slug?: string };
    mapSlug?: string;
    maxRoundTime?: number;
    movementOptions?: { forbidRotating?: boolean; forbidMoving?: boolean };
    roundWinMultiplierIncrement?: number;
  };
}
export interface HistoryEntry {
  gameId: string;
  players: Player[];
  duel?: { winnerId?: string; gameMode?: string; teams?: Team[]; rounds?: DuelRound[] };
}
export interface GameHistory {
  entries: HistoryEntry[];
}
/** Props GeoGuessr's route loaders return; the summary page reads these three. */
export interface SummaryProps {
  statusCode?: number;
  game?: unknown;
  userId?: string;
  [key: string]: unknown;
}
/** The subset of TanStack Router (exposed as `__TSR_ROUTER__`) recovery relies on. */
export interface PageRouter {
  state?: { matches?: { routeId?: string; loaderData?: { props?: SummaryProps } }[] };
  invalidate(): Promise<unknown>;
}
export type PageWindow = Window & typeof globalThis & { __TSR_ROUTER__?: PageRouter };

/** Public profile endpoint exposes a single suspension expiry, not an audit log. */
export interface UserModerationStatus {
  isBanned?: boolean;
  suspendedUntil?: string | null;
}

export interface RankedCountryStats {
  bestCountries: string[];
  worstCountries: string[];
}

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
export interface AppProps {
  accountProps?: { account?: { user?: { userId?: string } } };
  pageProps?: { statusCode?: number; userId?: string; game?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}
export interface NextData {
  props?: AppProps;
  query?: { token?: string };
}
export interface NextRouter {
  isReady: boolean;
  route: string;
  components?: Record<string, { props?: AppProps }>;
  replace(
    url: string,
    as?: string,
    options?: { shallow: boolean; scroll: boolean },
  ): Promise<boolean>;
}
export type PageWindow = Window & typeof globalThis & { next?: { router?: NextRouter } };

/** Public profile endpoint exposes a single suspension expiry, not an audit log. */
export interface UserModerationStatus {
  isBanned?: boolean;
  suspendedUntil?: string | null;
}

export interface RankedCountryStats {
  bestCountries: string[];
  worstCountries: string[];
}

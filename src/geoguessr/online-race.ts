export interface RaceParticipant {
  region: string;
  name: string;
  nick: string;
  avatar?: string;
  countryCode?: string;
  position?: number;
  total?: number;
  points: number[];
  projection?: RaceProjection;
  rating?: number;
}

export interface RaceProjection {
  position: number;
  total: number;
  weekPoints: number;
  weekIndex: number;
  gamesWeek: string;
  updatedAt: number;
  stale?: boolean;
  waitingForWeek?: number | null;
  completed?: boolean;
}

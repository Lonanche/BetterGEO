import type { Scope } from './scope';
import type { PageEvents } from './page';
import type { Network } from './network';
import type { GeoGuessrApi } from '../geoguessr/api';
import type { PageWindow } from '../geoguessr/types';
export interface Services {
  page: PageWindow;
  events: PageEvents;
  network: Network;
  api: GeoGuessrApi;
}
export interface Feature {
  id: string;
  name: string;
  description: string;
  enable(services: Services, scope: Scope): void;
}

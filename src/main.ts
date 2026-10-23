import { Network } from './core/network';
import { PageEvents } from './core/page';
import { FeatureManager } from './core/settings';
import { openSettings } from './core/menu';
import { GeoGuessrApi } from './geoguessr/api';
import { summaryRecovery } from './features/summary-recovery';
import { gameResults } from './features/game-results';
import { countryPerformance } from './features/country-performance';
import { tournamentsLink } from './features/tournaments-link';
import { randomMap } from './features/random-map';
import { profileStatus } from './features/profile-status';
import { matchHistory } from './features/match-history';
import { onlineRace } from './features/online-race';
const page = unsafeWindow;
const network = new Network(page);
const events = new PageEvents(page);
const api = new GeoGuessrApi(page);
// Observe score responses once, retaining matches across feature toggles. No extra requests.
network.observe(
  (url) => url.origin === location.origin && api.scores.matches(url.pathname),
  (url, data) => {
    api.scores.accept(url.pathname, data);
    events.schedule();
  },
);
const manager = new FeatureManager(
  [
    summaryRecovery,
    gameResults,
    matchHistory,
    onlineRace,
    profileStatus,
    countryPerformance,
    randomMap,
    tournamentsLink,
  ],
  { page, network, events, api },
);
manager.start();
GM_registerMenuCommand('BetterGEO settings', () => openSettings(manager));
window.addEventListener('pagehide', (event) => {
  if (event.persisted) return;
  manager.dispose();
  events.dispose();
  network.dispose();
});

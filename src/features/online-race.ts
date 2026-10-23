import type { Feature } from '../core/feature';
import { element } from '../core/dom';
import type { RaceParticipant } from '../geoguessr/online-race';
import { installRaceLeaderboard } from './race-leaderboard';
import { refreshRaceBadge } from './race-badge';

const selector =
  '[class*="global-leaderboard-row_player__"] a[href*="/user/"], [class*="leaderboard"] [class*="player-nick_wrapper__"] a[href*="/user/"]';

export const onlineRace: Feature = {
  id: 'online-race',
  name: 'Online race leaderboard tags',
  description:
    'Tag World League race participants and add an ELO Race leaderboard with region filters.',
  enable(services, scope) {
    const { api, events } = services;
    const badges = new Map<HTMLAnchorElement, HTMLElement>();
    const style = element('style');
    style.textContent = `.bettergeo-online-race {
      display: inline-block; flex-shrink: 0; white-space: nowrap;
      padding: 2px 5px; border: 1px solid currentColor; border-radius: 4px;
      color: #ddd; background: #ffffff14;
      font-size: 10px; font-weight: 700; line-height: 1.3;
      vertical-align: middle; cursor: help;
    }
    /* World Championship race-standings region colours (design-system shade 50). */
    .bettergeo-online-race[data-region="APAC"] {
      color: #e94555; background: #e9455520;
    }
    .bettergeo-online-race[data-region="EMEA"] {
      color: #00a2fe; background: #00a2fe20;
    }
    .bettergeo-online-race[data-region="Americas"] {
      color: #3ae8bd; background: #3ae8bd20;
    }`;
    let players: Map<string, RaceParticipant> | undefined;
    let loading = false;
    let expires = 0;
    let retryAt = 0;
    let onDuels = false;
    let generation = 0;
    installRaceLeaderboard(services, scope, (result) => {
      // A manual refresh supersedes any older background participant request.
      generation++;
      players = result;
      loading = false;
      expires = Date.now() + 5 * 60_000;
      retryAt = 0;
      events.schedule();
    });
    const refreshTimer = setInterval(() => events.schedule(), 5 * 60_000);
    scope.own(() => clearInterval(refreshTimer));
    scope.own(() => {
      badges.forEach((badge) => badge.remove());
      badges.clear();
      style.remove();
    });
    scope.own(
      events.subscribe(() => {
        const isDuels = /^\/(?:[a-z]{2}\/)?multiplayer\/duels\/?$/.test(location.pathname);
        if (isDuels !== onDuels) {
          onDuels = isDuels;
          generation++;
          loading = false;
          expires = 0;
          retryAt = 0;
          players = undefined;
        }
        const links = new Set(
          isDuels
            ? [...document.querySelectorAll<HTMLAnchorElement>(selector)].filter(
                (link) => !link.closest('.bettergeo-race-panel'),
              )
            : [],
        );
        for (const [link, badge] of badges) {
          const id = new URL(link.href).pathname.match(/\/user\/([a-f0-9]{24})\/?$/i)?.[1];
          const player = id ? players?.get(id) : undefined;
          if (
            !links.has(link) ||
            !badge.isConnected ||
            badge.parentElement !==
              (link.closest('[class*="player-nick_wrapper__"]') ?? link.parentElement) ||
            !player
          ) {
            badge.remove();
            badges.delete(link);
          } else {
            refreshRaceBadge(badge, player);
            const container = badge.parentElement!;
            if (container.lastElementChild !== badge) container.append(badge);
          }
        }
        if (!isDuels) return;
        if (!style.isConnected) document.head.append(style);
        if (!loading && Date.now() >= expires && Date.now() >= retryAt) {
          loading = true;
          const requestGeneration = generation;
          void api
            .onlineRacePlayers(scope.signal)
            .then((result) => {
              if (!scope.active || requestGeneration !== generation) return;
              players = result;
              expires = Date.now() + 5 * 60_000;
              events.schedule();
            })
            .catch((error) => {
              if (!scope.active || requestGeneration !== generation) return;
              retryAt = Date.now() + 60_000;
              if (scope.active) console.error('[BetterGEO online race]', error);
            })
            .finally(() => {
              if (requestGeneration === generation) loading = false;
            });
        }
        if (!players) return;
        for (const link of links) {
          if (badges.has(link)) continue;
          const id = new URL(link.href).pathname.match(/\/user\/([a-f0-9]{24})\/?$/i)?.[1];
          const player = id ? players.get(id) : undefined;
          if (!player) continue;
          const badge = element('span', 'bettergeo-online-race');
          refreshRaceBadge(badge, player);
          badge.tabIndex = 0;
          (link.closest('[class*="player-nick_wrapper__"]') ?? link.parentElement)?.append(badge);
          badges.set(link, badge);
        }
      }),
    );
  },
};

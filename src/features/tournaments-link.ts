import type { Feature } from '../core/feature';
import { dropdownLists, menuEntry, insertMenuEntry } from '../core/navigation-menu';
const path = '/multiplayer/tournaments';
export const tournamentsLink: Feature = {
  id: 'tournaments-link',
  name: 'Tournaments in Multiplayer',
  description: 'Add a Tournaments shortcut inside the Multiplayer dropdown.',
  enable({ events }, scope) {
    const mounts = new Map<Element, HTMLAnchorElement>();
    scope.own(() => {
      mounts.forEach((item) => item.remove());
      mounts.clear();
    });
    scope.own(
      events.subscribe(() => {
        for (const [container, item] of mounts)
          if (!container.isConnected || !item.isConnected) {
            item.remove();
            mounts.delete(container);
          }
        for (const container of dropdownLists()) {
          const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href]')];
          const nativeTournament = links.find(
            (link) =>
              !link.hasAttribute('data-bettergeo-tournaments') &&
              new URL(link.href, location.origin).pathname.replace(/^\/[a-z]{2}\//, '/') === path,
          );
          if (nativeTournament) {
            mounts.get(container)?.remove();
            mounts.delete(container);
            continue;
          }
          if (mounts.has(container)) continue;
          const template = links.find((link) => {
            const route = new URL(link.href, location.origin).pathname.replace(
              /^\/[a-z]{2}\//,
              '/',
            );
            return (
              route !== path &&
              /^\/(?:multiplayer(?:\/|$)|competitive(?:\/|$)|duels(?:\/|$)|battle-royale(?:\/|$))/.test(
                route,
              )
            );
          });
          if (!template) continue;
          const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          icon.setAttribute('viewBox', '0 0 24 24');
          icon.setAttribute('width', '56');
          icon.setAttribute('height', '56');
          icon.setAttribute('fill', 'none');
          icon.setAttribute('stroke', '#b5a4ff');
          icon.setAttribute('stroke-width', '1.6');
          icon.setAttribute('stroke-linecap', 'round');
          icon.setAttribute('stroke-linejoin', 'round');
          icon.setAttribute('aria-hidden', 'true');
          const shape = document.createElementNS(icon.namespaceURI, 'path');
          shape.setAttribute(
            'd',
            'M8 3h8v5a4 4 0 0 1-8 0V3zM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v5m-3 4h6m-7 0v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
          );
          icon.append(shape);
          const { item } = menuEntry(
            'a',
            'Tournaments',
            'Browse multiplayer tournaments',
            icon,
            template,
          );
          item.href = path;
          item.dataset.bettergeoTournaments = '';
          insertMenuEntry(container, item);
          mounts.set(container, item);
        }
      }),
    );
  },
};

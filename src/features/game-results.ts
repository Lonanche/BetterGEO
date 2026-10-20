import type { Feature } from '../core/feature';
import { mapId, resultPath } from '../geoguessr/routes';
export const gameResults: Feature = {
  id: 'game-results',
  name: 'Map history result links',
  description: 'Add links to game results in the My Games score history on each map page.',
  enable({ events, api }, scope) {
    const games = api.scores;
    const rowSelector = 'button[class*="map-detail-leaderboard_row__"], button[aria-expanded]';
    function clearResult(container: HTMLElement) {
      container.querySelector(':scope > .gg-result-action')?.remove();
      container.classList.remove('gg-result-row');
      container.style.removeProperty('--gg-icon-right');
    }
    function update() {
      const currentMapId = mapId();
      if (!currentMapId) {
        document.querySelectorAll<HTMLElement>('.gg-result-row').forEach(clearResult);
        return;
      }
      for (const row of document.querySelectorAll<HTMLElement>(rowSelector)) {
        const container = row.parentElement;
        if (!container) continue;
        const date =
          row.querySelector<HTMLElement>('[class*="cellDate__"] [title]') ||
          [...row.querySelectorAll<HTMLElement>('[title]')].find((el) =>
            Number.isFinite(Date.parse(el.title)),
          );
        if (!date) {
          clearResult(container);
          continue;
        }
        const points = row.querySelector('[class*="cellPoints__"]');
        const timestamp = Date.parse(date.title);
        const scoreText = points?.textContent || row.textContent?.match(/([\d,\s]+)\s*pts\b/i)?.[1];
        const digits = scoreText?.replace(/[^0-9]/g, '');
        const score = digits ? Number(digits) : NaN;
        // Generic expandable buttons are only history rows with a date and score.
        if (!Number.isFinite(timestamp) || !Number.isFinite(score)) {
          clearResult(container);
          continue;
        }
        const oldAction = container.querySelector(':scope > .gg-result-action');
        const oldLink = oldAction?.querySelector<HTMLAnchorElement>('a');
        const tokens = games.lookup(currentMapId, timestamp, score);
        // Never guess by row order: sorting and filtering can change it.
        if (tokens?.size !== 1) {
          clearResult(container);
          continue;
        }
        const href = `${location.origin}${resultPath(tokens.values().next().value!)}`;
        container.classList.add('gg-result-row');
        const arrow = row.querySelector('[class*="expandButton__"]') || row.lastElementChild;
        if (arrow) {
          const offset = `${Math.max(24, row.getBoundingClientRect().right - arrow.getBoundingClientRect().left + 8)}px`;
          if (container.style.getPropertyValue('--gg-icon-right') !== offset)
            container.style.setProperty('--gg-icon-right', offset);
        }
        if (oldLink?.href === href) continue;
        oldAction?.remove();
        const link = document.createElement('a');
        link.className = 'gg-result-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.setAttribute('aria-label', 'View game result');
        link.title = 'Open game result in a new tab';
        link.addEventListener('click', (event) => event.stopPropagation());
        const icon = document.createElement('img');
        icon.alt = '';
        icon.width = 18;
        icon.height = 18;
        icon.addEventListener(
          'error',
          () => {
            // Self-contained fallback: no dependency on GeoGuessr's asset filename.
            const svg =
              '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r="1" fill="white" stroke="none"/></svg>';
            icon.src = 'data:image/svg+xml,' + encodeURIComponent(svg);
          },
          { once: true },
        );
        icon.src = '/_next/static/media/info.1c18ae42.svg';
        link.appendChild(icon);
        const action = document.createElement('div');
        action.className = 'gg-result-action';
        action.appendChild(link);
        row.insertAdjacentElement('afterend', action);
      }
    }

    let style: HTMLStyleElement | undefined;
    scope.own(
      events.subscribe(() => {
        if (!document.head) return;
        if (!style) {
          style = document.createElement('style');
          style.textContent = CSS;
          document.head.append(style);
        }
        update();
      }),
    );
    scope.own(() => {
      style?.remove();
      document.querySelectorAll<HTMLElement>('.gg-result-row').forEach(clearResult);
      document.querySelectorAll('.gg-result-action').forEach((action) => action.remove());
    });
  },
};

const CSS = `
.gg-result-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
.gg-result-row > button {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  width: 100%;
}
.gg-result-row > :not(button):not(.gg-result-action) {
  grid-column: 1 / -1;
}
.gg-result-row > .gg-result-action {
  grid-column: 1;
  grid-row: 1;
  align-self: center;
  justify-self: end;
  z-index: 1;
  margin: 0 var(--gg-icon-right, 36px) 0 0;
  padding: 0;
  background: transparent;
}
.gg-result-row > button > :last-child {
  margin-left: 34px !important;
  flex-shrink: 0;
  transition: none !important;
}
.gg-result-row:has(> button:hover) > button,
.gg-result-row:has(> .gg-result-action:hover) > button {
  background: rgba(255, 255, 255, 0.07) !important;
}
/* Low specificity lets the native classes supply their own appearance. */
:where(.gg-result-action) {
  display: flex;
  align-items: center;
}
:where(.gg-result-link) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: white;
  opacity: 0.75;
  text-decoration: none;
}
:where(.gg-result-link:hover) {
  opacity: 1;
  background: #ffffff15;
}
:where(.gg-result-link:focus-visible) {
  outline: 2px solid #a896ff;
  outline-offset: 2px;
}
:where(.gg-result-link img) {
  display: block;
  width: 18px;
  height: 18px;
}
`;

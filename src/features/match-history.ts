import type { Feature } from '../core/feature';
import { watchProfile, profileWidgets } from '../core/profile';
import { element } from '../core/dom';
import { nativeSelector, nativeStyles } from '../core/native-styles';
import { historyItem, profile } from '../geoguessr/styles';
import { historyView } from './match-history-view';
import { openHistoryDialog } from './match-history-dialog';
import type { HistoryEntry } from '../geoguessr/types';
const widgetId = 'bettergeo-match-history';
export const matchHistory: Feature = {
  id: 'match-history',
  name: 'Unhide recent duels',
  description: 'Restore the Recent Duels panel when a player has hidden it on their profile.',
  enable({ api, events }, scope) {
    let widget: HTMLElement | undefined, closeModal: (() => void) | undefined;
    const style = element('style');
    style.textContent = CSS;
    scope.own(() => style.remove());
    function showAll(data: HistoryEntry[], id: string) {
      closeModal?.();
      closeModal = openHistoryDialog(data, id, () => {
        closeModal = undefined;
      });
    }
    watchProfile(events, scope, {
      name: 'match history',
      target() {
        const container = profileWidgets();
        const native =
          container &&
          [...container.querySelectorAll('h2')].some(
            (heading) =>
              !heading.closest(`#${widgetId}`) && /recent duels/i.test(heading.textContent ?? ''),
          );
        if (native) {
          widget?.remove();
          widget = undefined;
          closeModal?.();
          return null;
        }
        return container;
      },
      load: (id) => api.history(id),
      reset() {
        widget?.remove();
        widget = undefined;
        closeModal?.();
      },
      render(data, id, container) {
        if (widget?.isConnected) {
          if (
            !widget.classList.contains('bettergeo-history-fallback') ||
            !nativeStyles().module(historyItem).styled
          )
            return;
          widget.remove();
        }
        const entries = data.entries.filter((entry) => entry.duel);
        if (!entries.length) return;
        if (!style.isConnected) document.head.append(style);
        widget = historyView(entries, id, () => showAll(entries, id));
        const firstRow = container.querySelector(nativeSelector(profile, 'widgetRow'));
        if (firstRow) firstRow.after(widget);
        else container.prepend(widget);
      },
    });
  },
};

const CSS = `
.bettergeo-history-title-line {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.bettergeo-history-credit {
  display: inline;
  margin: 0;
  font-size: 10px;
  line-height: 1.3;
  font-weight: 400;
  font-style: normal;
  color: inherit;
  opacity: 0.55;
}
.bettergeo-duels {
  position: fixed;
  inset: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  color: white;
  width: 100vw;
  height: 100dvh;
  max-width: none;
  max-height: none;
  overflow: hidden;
}
.bettergeo-duels::backdrop {
  background: transparent;
}
.bettergeo-history-status {
  font-size: 14px;
  color: #c4bdd6;
  text-align: center;
  padding: 20px;
}
/* Fallback shell for when GeoGuessr has not loaded the native modal CSS. Targets only
   BetterGEO's own bgh-* hooks, so it keeps working whatever GeoGuessr names its classes. */
.bettergeo-history-modal-fallback .bgh-overlay-root {
  position: fixed;
  inset: 0;
}
.bettergeo-history-modal-fallback .bgh-backlight {
  position: absolute;
  inset: 0;
  background: #000b;
  backdrop-filter: blur(4px);
}
.bettergeo-history-modal-fallback .bgh-modal-container {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}
.bettergeo-history-modal-fallback .bgh-modal-content {
  width: min(860px, 94vw);
  height: 90vh;
  background: #242044;
  border-radius: 12px;
  overflow: auto;
}
.bettergeo-history-modal-fallback .bgh-division {
  text-align: center;
  padding: 16px;
}
.bettergeo-history-modal-fallback .bgh-division img {
  width: 100px;
  height: 100px;
  object-fit: contain;
}
.bettergeo-history-modal-fallback .bgh-division-text {
  font-size: 24px;
  font-weight: 700;
  font-style: italic;
  margin: 0;
}
.bettergeo-history-modal-fallback .bgh-dropdown-container {
  display: flex;
  justify-content: center;
}
.bettergeo-history-modal-fallback .bgh-select {
  padding: 8px 28px 8px 12px;
  background: #ffffff18;
  color: white;
  border: 1px solid #ffffff30;
  border-radius: 4px;
}
.bettergeo-history-modal-fallback .bgh-select option {
  color: #171426;
}
.bettergeo-history-modal-fallback .bgh-separator {
  border-top: 1px solid #ffffff20;
  margin: 24px 0;
}
.bettergeo-history-modal-fallback .bettergeo-duel-list {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.bettergeo-history-modal-fallback .bgh-close {
  position: absolute;
  right: 24px;
  top: 24px;
  background: #ffffff20;
  border: 0;
  border-radius: 50%;
  color: white;
  width: 32px;
  height: 32px;
  cursor: pointer;
}
.bettergeo-history-modal-fallback .bgh-close svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}
/* Fallback card layout for when the native game-history CSS chunk is not loaded. */
.bettergeo-history-fallback .bgh-button {
  border: 1px solid #ffffff40;
  border-radius: 24px;
  background: transparent;
  color: white;
  padding: 8px 18px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.bettergeo-history-fallback .bgh-carousel {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
  padding: 16px 8px 12px;
}
.bettergeo-history-fallback .bgh-carousel-wrapper {
  min-width: 0;
}
.bettergeo-history-fallback .bgh-arrow-button {
  background: none;
  border: 0;
  color: white;
  cursor: pointer;
  padding: 4px;
}
.bettergeo-history-fallback .bgh-arrow-svg {
  width: 16px;
  height: 24px;
  fill: currentColor;
}
.bettergeo-history-fallback .bgh-indicators {
  grid-column: 1/-1;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
}
.bettergeo-history-fallback .bgh-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.4;
}
.bettergeo-history-fallback .bgh-green {
  background: #6cb928;
}
.bettergeo-history-fallback .bgh-red {
  background: #c42424;
}
.bettergeo-history-fallback .bgh-indicator.bgh-active {
  opacity: 1;
  outline: 1px solid #fff;
  outline-offset: 2px;
}
.bettergeo-history-fallback .bgh-card {
  position: relative;
  border: 1px solid #ffffff30;
  border-radius: 8px;
  padding: 20px 46px 20px 16px;
  color: white;
}
.bettergeo-history-fallback .bgh-primaryUserWon {
  background: linear-gradient(135deg, #6cb92830, #6cb92815);
  border-color: #6cb92866;
}
.bettergeo-history-fallback .bgh-opponentWon {
  background: linear-gradient(135deg, #c4242430, #c4242415);
  border-color: #c4242466;
}
.bettergeo-history-fallback .bgh-game-data {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}
.bettergeo-history-fallback .bgh-side {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-left,
.bettergeo-history-fallback .bgh-right {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-left {
  align-items: flex-end;
  text-align: right;
}
.bettergeo-history-fallback .bgh-right {
  align-items: flex-start;
}
.bettergeo-history-fallback .bgh-victory,
.bettergeo-history-fallback .bgh-defeat,
.bettergeo-history-fallback .bgh-tie {
  font-size: 11px;
  font-weight: 700;
}
.bettergeo-history-fallback .bgh-victory {
  color: #6cb928;
}
.bettergeo-history-fallback .bgh-defeat {
  color: #e44747;
}
.bettergeo-history-fallback .bgh-identity {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-identity a,
.bettergeo-history-fallback .bgh-button {
  position: relative;
  z-index: 1;
}
.bettergeo-history-fallback .bgh-nick {
  color: white;
  text-decoration: none;
  font-weight: 600;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bettergeo-history-fallback .bgh-rating {
  font-size: 11px;
  color: #ffffff99;
}
.bettergeo-history-fallback .bgh-rating-label {
  color: #ffffff66;
}
.bettergeo-history-fallback .bgh-avatar-cell {
  flex-shrink: 0;
}
.bettergeo-history-fallback .bgh-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
}
.bettergeo-history-fallback .bgh-avatar-image img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.bettergeo-history-fallback .bgh-avatar-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.bettergeo-history-fallback .bgh-center {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.bettergeo-history-fallback .bgh-mode {
  font-size: 11px;
  color: #ffffff99;
  font-weight: 600;
}
.bettergeo-history-fallback .bgh-vs {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff66;
}
.bettergeo-history-fallback .bgh-card-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  width: 20px;
  height: 20px;
  transform: translateY(-50%);
  opacity: 0.7;
}
.bettergeo-history-fallback .bgh-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
@media (max-width: 600px) {
  .bettergeo-history-fallback .bgh-game-data {
    gap: 6px;
  }
  .bettergeo-history-fallback .bgh-side {
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .bettergeo-history-fallback .bgh-nick {
    max-width: 72px;
  }
  .bettergeo-history-fallback .bgh-card {
    padding: 12px 36px 12px 6px;
  }
}
`;

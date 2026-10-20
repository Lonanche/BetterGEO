import type { Feature } from '../core/feature';
import { watchProfile, profileWidgets } from '../core/profile';
import { element } from '../core/dom';
import { nativeStyles } from '../core/native-styles';
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
            !nativeStyles().has('game-history-list-item_card__')
          )
            return;
          widget.remove();
        }
        const entries = data.entries.filter((entry) => entry.duel);
        if (!entries.length) return;
        if (!style.isConnected) document.head.append(style);
        widget = historyView(entries, id, () => showAll(entries, id));
        const firstRow = container.querySelector('[class*="profile-v2_widgetRow__"]');
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
/* Fallback shell for profiles where GeoGuessr has not loaded the native modal CSS. */
.bettergeo-history-modal-fallback > [class*='version4_fullOverlay__'] {
  position: fixed;
  inset: 0;
}
.bettergeo-history-modal-fallback [class*='overlay-modal_backlight__'] {
  position: absolute;
  inset: 0;
  background: #000b;
  backdrop-filter: blur(4px);
}
.bettergeo-history-modal-fallback [class*='overlay-modal_contentContainer__'] {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}
.bettergeo-history-modal-fallback [class*='overlay-modal_content__'] {
  width: min(860px, 94vw);
  height: 90vh;
  background: #242044;
  border-radius: 12px;
  overflow: auto;
}
.bettergeo-history-modal-fallback
  [class*='game-history-modal_divisionHeader__'] {
  text-align: center;
  padding: 16px;
}
.bettergeo-history-modal-fallback
  [class*='game-history-modal_divisionHeader__']
  img {
  width: 100px;
  height: 100px;
  object-fit: contain;
}
.bettergeo-history-modal-fallback
  [class*='game-history-modal_divisionHeaderText__'] {
  font-size: 24px;
  font-weight: 700;
  font-style: italic;
  margin: 0;
}
.bettergeo-history-modal-fallback
  [class*='game-history-modal_dropdownContainer__'] {
  display: flex;
  justify-content: center;
}
.bettergeo-history-modal-fallback [class*='dropdown_select__'] {
  padding: 8px 28px 8px 12px;
  background: #ffffff18;
  color: white;
  border: 1px solid #ffffff30;
  border-radius: 4px;
}
.bettergeo-history-modal-fallback [class*='dropdown_select__'] option {
  color: #171426;
}
.bettergeo-history-modal-fallback [class*='game-history-modal_separator__'] {
  border-top: 1px solid #ffffff20;
  margin: 24px 0;
}
.bettergeo-history-modal-fallback .bettergeo-duel-list {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.bettergeo-history-modal-fallback [class*='overlay-modal_closeButton__'] {
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
.bettergeo-history-modal-fallback [class*='overlay-modal_closeButton__'] svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}
/* Profiles may not load the native history CSS chunk. These scoped rules preserve
   the same mirrored layout until those styles are available. */
.bettergeo-history-fallback [class*='widget_root__'] {
  width: 100%;
  color: white;
}
.bettergeo-history-fallback [class*='widget_widgetBorder__'] {
  border: 1px solid #ffffff20;
  border-radius: 12px;
  background: #ffffff08;
  overflow: hidden;
}
.bettergeo-history-fallback [class*='widget_header___'] {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 12px;
}
.bettergeo-history-fallback
  [class*='widget_title__']
  > [class*='widget_header__'] {
  display: flex;
  align-items: center;
  gap: 12px;
}
.bettergeo-history-fallback [class*='widget_icon__'] {
  width: 56px;
  height: 56px;
  object-fit: contain;
}
.bettergeo-history-fallback [class*='headline_heading__'] {
  font-size: 16px;
  font-weight: 700;
  font-style: italic;
  margin: 0;
}
.bettergeo-history-fallback [class*='widget_dividerWrapper__'] {
  border-top: 1px solid #ffffff18;
}
.bettergeo-history-fallback [class*='button_button__'] {
  border: 1px solid #ffffff40;
  border-radius: 24px;
  background: transparent;
  color: white;
  padding: 8px 18px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.bettergeo-history-fallback [class*='carousel_carouselContainer__'] {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
  padding: 16px 8px 12px;
}
.bettergeo-history-fallback [class*='carousel_carouselWrapper__'] {
  min-width: 0;
}
.bettergeo-history-fallback [class*='carousel_arrowButton__'] {
  background: none;
  border: 0;
  color: white;
  cursor: pointer;
  padding: 4px;
}
.bettergeo-history-fallback [class*='carousel_arrowSvg__'] {
  width: 16px;
  height: 24px;
  fill: currentColor;
}
.bettergeo-history-fallback [class*='carousel_indicatorWrapper__'] {
  grid-column: 1/-1;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
}
.bettergeo-history-fallback [class*='carousel_indicator__'] {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.4;
}
.bettergeo-history-fallback [class*='carousel_green__'] {
  background: #6cb928;
}
.bettergeo-history-fallback [class*='carousel_red__'] {
  background: #c42424;
}
.bettergeo-history-fallback [class*='carousel_active__'] {
  opacity: 1;
  outline: 1px solid #fff;
  outline-offset: 2px;
}
.bettergeo-history-fallback [class*='game-history-list-item_card__'] {
  position: relative;
  border: 1px solid #ffffff30;
  border-radius: 8px;
  padding: 20px 46px 20px 16px;
  color: white;
}
.bettergeo-history-fallback [class*='game-history-list-item_primaryUserWon__'] {
  background: linear-gradient(135deg, #6cb92830, #6cb92815);
  border-color: #6cb92866;
}
.bettergeo-history-fallback [class*='game-history-list-item_opponentWon__'] {
  background: linear-gradient(135deg, #c4242430, #c4242415);
  border-color: #c4242466;
}
.bettergeo-history-fallback [class*='game-history-list-item_gameData__'] {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}
.bettergeo-history-fallback [class*='game-history-list-item_gameDataSide__'] {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.bettergeo-history-fallback [class*='game-history-player-column_left__'],
.bettergeo-history-fallback [class*='game-history-player-column_right__'] {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback [class*='game-history-player-column_left__'] {
  align-items: flex-end;
  text-align: right;
}
.bettergeo-history-fallback [class*='game-history-player-column_right__'] {
  align-items: flex-start;
}
.bettergeo-history-fallback [class*='game-history-player-column_victory__'] {
  color: #6cb928;
  font-size: 11px;
  font-weight: 700;
}
.bettergeo-history-fallback [class*='game-history-player-column_defeat__'] {
  color: #e44747;
  font-size: 11px;
  font-weight: 700;
}
.bettergeo-history-fallback [class*='player-nick_wrapper__'] {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback [class*='nick_nick__'] {
  color: white;
  text-decoration: none;
  font-weight: 600;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bettergeo-history-fallback [class*='game-history-player-column_rating__'] {
  font-size: 11px;
  color: #ffffff99;
}
.bettergeo-history-fallback
  [class*='game-history-player-column_ratingLabel__'] {
  color: #ffffff66;
}
.bettergeo-history-fallback [class*='game-history-list-item_avatarCell__'] {
  flex-shrink: 0;
}
.bettergeo-history-fallback [class*='avatar_titleAvatar__'] {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
}
.bettergeo-history-fallback [class*='avatar_titleAvatarImage__'] img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.bettergeo-history-fallback [class*='avatar_titleAvatarBorder__'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.bettergeo-history-fallback [class*='game-history-list-item_centerColumn__'] {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.bettergeo-history-fallback [class*='game-history-list-item_mode__'] {
  font-size: 11px;
  color: #ffffff99;
  font-weight: 600;
}
.bettergeo-history-fallback [class*='game-history-list-item_vs__'] {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff66;
}
.bettergeo-history-fallback [class*='game-history-actions_actions__'] {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.bettergeo-history-fallback [class*='game-history-actions_actionBtn__'] {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: #ffffff12;
  display: flex;
  align-items: center;
  justify-content: center;
}
@media (max-width: 600px) {
  .bettergeo-history-fallback [class*='game-history-list-item_gameData__'] {
    gap: 6px;
  }
  .bettergeo-history-fallback [class*='game-history-list-item_gameDataSide__'] {
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .bettergeo-history-fallback [class*='nick_nick__'] {
    max-width: 72px;
  }
  .bettergeo-history-fallback [class*='game-history-list-item_card__'] {
    padding: 12px 36px 12px 6px;
  }
}
`;

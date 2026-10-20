import { element } from '../core/dom';
import { nativeStyles } from '../core/native-styles';
import { Scope } from '../core/scope';
import type { HistoryEntry } from '../geoguessr/types';
import { gameCard } from './match-history-view';
/** Native-shaped history overlay filtering the already loaded duel batch. */
export function openHistoryDialog(initial: HistoryEntry[], userId: string, onClose: () => void) {
  const scope = new Scope(),
    styles = nativeStyles(),
    c = styles.resolve;
  const focused = document.activeElement;
  const dialog = element('dialog', 'bettergeo-duels');
  dialog.setAttribute('aria-label', 'Recent games');
  if (!styles.has('game-history-modal_root__'))
    dialog.classList.add('bettergeo-history-modal-fallback');
  if (!styles.has('game-history-list-item_card__'))
    dialog.classList.add('bettergeo-history-fallback');
  const overlay = element('div', c('version4_fullOverlay__IQxsi'));
  const portal = element('div', c('overlay-portal_destination__ghrwd'));
  const backlight = element(
    'div',
    c(
      'overlay-modal_backlight__RpQao',
      'overlay-modal_backlightDark__TqpAA',
      'overlay-modal_isAnimated__qxbgD',
      'overlay-modal_blurBackground__9_zFe',
    ),
  );
  const container = element(
    'div',
    c(
      'overlay-modal_contentContainer___KC3A',
      'overlay-modal_alignVerticallyCenter__oydwB',
      'overlay-modal_isAnimated__qxbgD',
    ),
  );
  const content = element(
    'div',
    c(
      'overlay-modal_content__d7Vy6',
      'overlay-modal_sizeLarge__oBI4H',
      'overlay-modal_fullHeight__wQygj',
    ),
  );
  const root = element('div', c('game-history-modal_root__TZJqh'));
  const header = element('div', c('game-history-modal_divisionHeader__ELL4_'));
  const ranked = [...document.querySelectorAll('h2')]
    .find((h) => /^ranked duels$/i.test(h.textContent?.trim() ?? ''))
    ?.closest('[class*="widget_root__"]');
  const division = [...(ranked?.querySelectorAll('img') ?? [])].find((img) =>
    /champion|master|gold|silver|bronze/i.test(img.src),
  );
  const icon = division ? (division.cloneNode(false) as HTMLImageElement) : element('img');
  if (!division)
    icon.src =
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-duels.f0444913.webp&w=640&q=75';
  icon.removeAttribute('id');
  icon.removeAttribute('class');
  icon.removeAttribute('style');
  icon.alt = '';
  icon.width = 600;
  icon.height = 600;
  header.append(
    icon,
    element('p', c('game-history-modal_divisionHeaderText__BeuNw'), 'Recent games'),
  );
  const dropdownContainer = element('div', c('game-history-modal_dropdownContainer__aYYv3'));
  const dropdownSlot = element('div', c('game-history-modal_dropdown__tSpru'));
  const dropdown = element(
    'div',
    c(
      'dropdown_dropdown__GxB04',
      'dropdown_variantLightTransparent__YBisN',
      'dropdown_sizeDefault__nhnvm',
    ),
  );
  const select = element('select', c('dropdown_select__WtHWX'));
  select.setAttribute('aria-label', 'Game mode');
  for (const [value, label] of [
    ['None', 'All'],
    ['StandardDuels', 'Moving'],
    ['NoMoveDuels', 'No move'],
    ['NmpzDuels', 'NMPZ'],
  ]) {
    const option = element('option', '', label);
    option.value = value!;
    select.append(option);
  }
  dropdown.append(select, element('div', c('dropdown_arrow__9Wc4k')));
  dropdownSlot.append(dropdown);
  dropdownContainer.append(dropdownSlot);
  const spacer = element('div', c('spacer_space__R4G0s', 'spacer_height__ovvoK'));
  spacer.style.setProperty('--height', '32');
  const leaderboard = element('div', c('game-history-modal_leaderboardWrapper__p3_RH'));
  const listRoot = element('div', c('game-history-list_root__QvVPL'));
  const listContainer = element('div', c('game-history-list_leaderboardContainer__FnLO5'));
  const list = element('div', c('game-history-list_list__T_e20'));
  list.classList.add('bettergeo-duel-list');
  const status = element('p', 'bettergeo-history-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  listContainer.append(status, list);
  listRoot.append(listContainer);
  leaderboard.append(listRoot);
  root.append(
    header,
    dropdownContainer,
    spacer,
    element('div', c('game-history-modal_separator__gP85P')),
    leaderboard,
  );
  content.append(root);
  const close = element(
    'button',
    c('overlay-modal_closeButton__8QTzI', 'overlay-modal_closeButtonWhite__2Ozdd'),
  );
  close.type = 'button';
  close.name = 'close';
  close.setAttribute('aria-label', 'Close recent games');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 16 16');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute(
    'd',
    'M11.146,5.546l-.692-.692a.5.5,0,0,0-.708,0L8,6.6,6.254,4.854a.5.5,0,0,0-.708,0l-.692.692a.5.5,0,0,0,0,.708L6.6,8,4.854,9.746a.5.5,0,0,0,0,.708l.692.692a.5.5,0,0,0,.708,0L8,9.4l1.746,1.746a.5.5,0,0,0,.708,0l.692-.692a.5.5,0,0,0,0-.708L9.4,8l1.746-1.746A.5.5,0,0,0,11.146,5.546Z',
  );
  svg.append(path);
  close.append(svg);
  container.append(content, close);
  portal.append(backlight, container);
  overlay.append(portal);
  dialog.append(overlay);
  function render() {
    const mode = select.value;
    list.replaceChildren(
      ...initial
        .filter(
          (entry) =>
            entry.duel &&
            Array.isArray(entry.players) &&
            (mode === 'None' || entry.duel.gameMode === mode),
        )
        .map((entry) => gameCard(entry, userId, styles)),
    );
    status.textContent = list.children.length ? '' : 'No recent games in this mode.';
    status.hidden = !!list.children.length;
    leaderboard.scrollTop = 0;
    content.scrollTop = 0;
  }
  // The overlay fills the viewport; only the visible viewer should accept wheel input.
  const blockOutsideWheel = (event: Event) => {
    if (!(event.target instanceof Node) || !content.contains(event.target)) event.preventDefault();
  };
  document.addEventListener('wheel', blockOutsideWheel, { capture: true, passive: false });
  scope.own(() => document.removeEventListener('wheel', blockOutsideWheel, true));
  const overflow = document.body.style.getPropertyValue('overflow');
  const priority = document.body.style.getPropertyPriority('overflow');
  document.body.style.setProperty('overflow', 'hidden');
  scope.own(() => {
    if (overflow) document.body.style.setProperty('overflow', overflow, priority);
    else document.body.style.removeProperty('overflow');
  });
  content.style.overscrollBehavior = 'contain';
  leaderboard.style.overscrollBehavior = 'contain';
  scope.listen(select, 'change', render);
  function finish() {
    if (!scope.active) return;
    scope.dispose();
    dialog.remove();
    if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
    onClose();
  }
  scope.listen(dialog, 'close', finish);
  scope.listen(close, 'click', finish);
  scope.listen(backlight, 'click', finish);
  scope.listen(container, 'click', (event) => {
    if (event.target === container) finish();
  });
  render();
  document.body.append(dialog);
  dialog.showModal();
  close.focus();
  return finish;
}

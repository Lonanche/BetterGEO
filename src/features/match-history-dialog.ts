import { element } from '../core/dom';
import { nativeSelector, nativeStyles } from '../core/native-styles';
import * as css from '../geoguessr/styles';
import { Scope } from '../core/scope';
import type { HistoryEntry } from '../geoguessr/types';
import { gameCard } from './match-history-view';
/** Native-shaped history overlay filtering the already loaded duel batch. */
export function openHistoryDialog(initial: HistoryEntry[], userId: string, onClose: () => void) {
  const scope = new Scope(),
    styles = nativeStyles();
  const layout = styles.module(css.layout),
    portalStyles = styles.module(css.overlayPortal),
    modal = styles.module(css.overlayModal),
    history = styles.module(css.historyModal),
    list_ = styles.module(css.historyList),
    picker = styles.module(css.select);
  const focused = document.activeElement;
  const dialog = element('dialog', 'bettergeo-duels');
  dialog.setAttribute('aria-label', 'Recent games');
  if (!history.styled || !modal.styled) dialog.classList.add('bettergeo-history-modal-fallback');
  if (!styles.module(css.historyItem).styled) dialog.classList.add('bettergeo-history-fallback');
  const overlay = element('div', `${layout.cls('fullOverlay')} bgh-overlay-root`.trim());
  const portal = element('div', portalStyles.cls('destination'));
  const backlight = element(
    'div',
    `${modal.cls('backlight', 'backlightDark', 'isAnimated', 'blurBackground')} bgh-backlight`.trim(),
  );
  const container = element(
    'div',
    `${modal.cls('contentContainer', 'alignVerticallyCenter', 'isAnimated')} bgh-modal-container`.trim(),
  );
  const content = element(
    'div',
    `${modal.cls('content', 'sizeLarge', 'fullHeight')} bgh-modal-content`.trim(),
  );
  const root = element('div', history.cls('root'));
  const header = element('div', `${history.cls('divisionHeader')} bgh-division`.trim());
  const ranked = [...document.querySelectorAll('h2')]
    .find((h) => /^ranked duels$/i.test(h.textContent?.trim() ?? ''))
    ?.closest(nativeSelector(css.widget, 'root'));
  const division = [...(ranked?.querySelectorAll('img') ?? [])].find((img) =>
    /champion|master|gold|silver|bronze/i.test(img.src),
  );
  const icon = division ? (division.cloneNode(false) as HTMLImageElement) : element('img');
  if (!division) icon.src = css.images.rankedDuels;
  icon.removeAttribute('id');
  icon.removeAttribute('class');
  icon.removeAttribute('style');
  icon.removeAttribute('srcset');
  icon.alt = '';
  icon.width = 600;
  icon.height = 600;
  header.append(
    icon,
    element('p', `${history.cls('divisionHeaderText')} bgh-division-text`.trim(), 'Recent games'),
  );
  const dropdownContainer = element(
    'div',
    `${history.cls('dropdownContainer')} bgh-dropdown-container`.trim(),
  );
  const dropdownSlot = element('div', history.cls('dropdown'));
  const dropdown = element('div', picker.cls('dropdown', 'variantLightTransparent', 'sizeDefault'));
  const select = element('select', `${picker.cls('select')} bgh-select`.trim());
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
  dropdown.append(select, element('div', picker.cls('arrow')));
  dropdownSlot.append(dropdown);
  dropdownContainer.append(dropdownSlot);
  const spacer = element('div', styles.module(css.spacer).cls('space', 'height'));
  spacer.style.setProperty('--height', '32');
  const leaderboard = element('div', history.cls('leaderboardWrapper'));
  const listRoot = element('div', list_.cls('root'));
  const listContainer = element('div', list_.cls('leaderboardContainer'));
  const list = element('div', list_.cls('list'));
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
    element('div', `${history.cls('separator')} bgh-separator`.trim()),
    leaderboard,
  );
  content.append(root);
  const close = element(
    'button',
    `${modal.cls('closeButton', 'closeButtonWhite')} bgh-close`.trim(),
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

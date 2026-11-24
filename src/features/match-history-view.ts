import { profileWidget } from '../core/profile-widget';
import { element, link } from '../core/dom';
import { nativeStyles } from '../core/native-styles';
import { duelPath } from '../geoguessr/routes';
import * as css from '../geoguessr/styles';
import type { HistoryEntry, Player } from '../geoguessr/types';
type Styles = ReturnType<typeof nativeStyles>;
const modeNames: Record<string, string> = {
  NmpzDuels: 'NMPZ',
  NoMoveDuels: 'No move',
  StandardDuels: 'Moving',
};
/** Native classes plus a stable `bgh-*` hook for the fallback stylesheet. */
function node<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  native: string,
  hook: string,
  text?: string,
) {
  return element(tag, `${native} bgh-${hook}`.trim(), text);
}
export function historyView(entries: HistoryEntry[], userId: string, showAll: () => void) {
  const icon = image(css.images.recentDuels, '', 512, 512);
  icon.alt = 'recent duels';
  const { root: widget, body, header, content, styles } = profileWidget('Recent Duels', icon);
  widget.classList.add('bettergeo-history');
  widget.id = 'bettergeo-match-history';
  if (!styles.module(css.historyItem).styled) widget.classList.add('bettergeo-history-fallback');
  content.classList.add('bettergeo-history-title-line');
  content.append(element('small', 'bettergeo-history-credit', '(unhidden by BetterGEO)'));
  const right = node('div', styles.module(css.widget).cls('rightSlot'), 'right-slot');
  const all = nativeButton('View all', styles);
  all.addEventListener('click', showAll);
  right.append(all);
  header.append(right);
  body.replaceWith(carousel(entries.slice(0, 5), userId, styles));
  return widget;
}
function nativeButton(text: string, styles: Styles) {
  const b = styles.module(css.button);
  const button = node('button', b.cls('button', 'variantTertiary', 'sizeSmall'), 'button');
  button.type = 'button';
  const wrapper = element('div', b.cls('wrapper'));
  wrapper.append(element('span', b.cls('label'), text));
  button.append(wrapper);
  return button;
}
function carousel(entries: HistoryEntry[], userId: string, styles: Styles) {
  const c = styles.module(css.carousel),
    modal = styles.module(css.historyModal);
  const widgetCarousel = element('div', styles.module(css.profileWidget).cls('widgetCarousel'));
  const root = element('div', modal.cls('carouselRoot'));
  const container = node('div', c.cls('carouselContainer'), 'carousel');
  const wrapper = node('div', c.cls('carouselWrapper'), 'carousel-wrapper');
  const inner = element('div', c.cls('carouselInner'));
  const spread = element('div', c.cls('spread'));
  const item = element('div', modal.cls('carouselItem'));
  // Keep one visible native card. This also avoids depending on React's carousel transforms.
  item.style.cssText = 'width:min(100%,640px);max-width:100%;flex:0 0 auto;margin-inline:auto';
  spread.style.cssText = 'width:100%;display:flex;justify-content:center';
  spread.append(item);
  inner.append(spread);
  wrapper.append(inner);
  const indicators = node('div', c.cls('indicatorWrapper'), 'indicators');
  let index = 0;
  const left = arrow('Previous duel', 'left', styles),
    right = arrow('Next duel', 'right', styles);
  const active = c.cls('active') || 'bgh-active';
  const dots = entries.map((entry, position) => {
    const won = entry.duel?.winnerId === userId;
    const dot = node(
      'button',
      c.cls('indicator', won ? 'green' : 'red'),
      `indicator bgh-${won ? 'green' : 'red'}`,
    );
    dot.type = 'button';
    dot.setAttribute('aria-label', `Show duel ${position + 1}`);
    dot.style.cssText = 'padding:0;border:0;cursor:pointer';
    dot.addEventListener('click', () => {
      index = position;
      render();
    });
    indicators.append(dot);
    return dot;
  });
  function render() {
    const entry = entries[index];
    if (!entry) return;
    item.replaceChildren(gameCard(entry, userId, styles, false));
    left.disabled = index === 0;
    right.disabled = index === entries.length - 1;
    left.style.visibility = left.disabled ? 'hidden' : '';
    right.style.visibility = right.disabled ? 'hidden' : '';
    dots.forEach((dot, i) => {
      dot.classList.toggle(active, i === index);
      dot.classList.toggle('bgh-active', i === index);
      dot.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
    item.setAttribute('aria-label', `Duel ${index + 1} of ${entries.length}`);
  }
  left.addEventListener('click', () => {
    if (index > 0) {
      index--;
      render();
    }
  });
  right.addEventListener('click', () => {
    if (index < entries.length - 1) {
      index++;
      render();
    }
  });
  container.append(left, wrapper, right, indicators);
  root.append(container);
  widgetCarousel.append(root);
  widgetCarousel.setAttribute('aria-label', 'Recent duels');
  widgetCarousel.setAttribute('aria-roledescription', 'carousel');
  render();
  return widgetCarousel;
}
function arrow(label: string, side: 'left' | 'right', styles: Styles) {
  const c = styles.module(css.carousel);
  const button = node(
    'button',
    c.cls('arrowButton', side === 'left' ? 'leftArrowButton' : 'rightArrowButton'),
    'arrow-button',
  );
  button.type = 'button';
  button.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `${c.cls('arrowSvg')} bgh-arrow-svg`.trim());
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(svg.namespaceURI, 'path');
  path.setAttribute(
    'd',
    side === 'left'
      ? 'M17,23a1,1,0,0,1-.707-.293l-10-10a1,1,0,0,1,0-1.414l10-10a1,1,0,0,1,1.414,1.414L8.414,12l9.293,9.293A1,1,0,0,1,17,23Z'
      : 'M7,23a1,1,0,0,1-.707-1.707L15.586,12,6.293,2.707A1,1,0,0,1,7.707,1.293l10,10a1,1,0,0,1,0,1.414l-10,10A1,1,0,0,1,7,23Z',
  );
  svg.append(path);
  button.append(svg);
  return button;
}
/** Mirrors GeoGuessr's game-history list item: the whole card links to the summary. */
export function gameCard(
  entry: HistoryEntry,
  userId: string,
  styles = nativeStyles(),
  showDate = true,
) {
  const c = styles.module(css.historyItem),
    duel = entry.duel!;
  const ratings = new Map(
    duel.teams?.flatMap((team) => team.players.map((player) => [player.playerId, player] as const)),
  );
  const players = [...entry.players]
    .sort((a, b) => Number(b.id === userId) - Number(a.id === userId))
    .map((player) => ({
      ...player,
      rating: ratings.get(player.id)?.rankedSystemRating ?? player.rating,
      tier: ratings.get(player.id)?.tier ?? player.tier,
    }));
  const outcome = !duel.winnerId
    ? 'tie'
    : duel.winnerId === userId
      ? 'primaryUserWon'
      : 'opponentWon';
  const item = node('div', c.cls('item', 'link'), 'item');
  const card = node('div', c.cls('card', outcome), `card bgh-${outcome}`);
  const data = node('div', c.cls('gameData'), 'game-data');
  const left = node('div', c.cls('gameDataSide', 'gameDataSideLeft'), 'side');
  const right = node('div', c.cls('gameDataSide', 'gameDataSideRight'), 'side');
  const center = node('div', c.cls('centerColumn'), 'center');
  const mode = modeNames[duel.gameMode ?? ''];
  if (mode) center.append(node('span', c.cls('mode'), 'mode', mode));
  center.append(node('div', c.cls('vs'), 'vs', 'VS'));
  if (players[0])
    left.append(
      playerColumn(players[0], 'left', duel.winnerId, styles),
      avatar(players[0], styles),
    );
  for (const player of players.slice(1))
    right.append(avatar(player, styles), playerColumn(player, 'right', duel.winnerId, styles));
  data.append(left, center, right);
  const date = duel.rounds?.[0]?.startTime;
  if (date && Number.isFinite(Date.parse(date))) {
    const when = new Date(date);
    item.title = when.toLocaleString();
    if (showDate) {
      const dateSlot = node('span', c.cls('date'), 'date');
      const text = element(
        'span',
        '',
        when.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' }),
      );
      text.title = when.toString();
      dateSlot.append(text);
      center.append(dateSlot);
    }
  }
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('class', `${c.cls('arrow')} bgh-card-arrow`.trim());
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '2');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');
  const line = document.createElementNS(icon.namespaceURI, 'line');
  for (const [key, value] of Object.entries({ x1: '4', y1: '12', x2: '20', y2: '12' }))
    line.setAttribute(key, value);
  const head = document.createElementNS(icon.namespaceURI, 'polyline');
  head.setAttribute('points', '13 5 20 12 13 19');
  icon.append(line, head);
  const overlay = link(
    '',
    duelPath(entry.gameId, 'summary'),
    `${c.cls('cardOverlay')} bgh-overlay`,
  );
  overlay.setAttribute('aria-label', 'Game analysis');
  card.append(data, icon, overlay);
  item.append(card);
  return item;
}
/** Nick and flag classes come from the profile header's native nick, when present. */
function nickClasses() {
  const wrapper = document.querySelector('[data-qa="user-card-title"] h1 > div');
  return {
    wrapper: wrapper?.className ?? '',
    nick: wrapper?.querySelector(':scope > span, :scope > a')?.className ?? '',
    flag: wrapper?.querySelector(':scope > img[title]')?.getAttribute('class') ?? '',
  };
}
function playerColumn(
  player: Player,
  side: 'left' | 'right',
  winnerId: string | undefined,
  styles: Styles,
) {
  const c = styles.module(css.historyPlayer),
    names = styles.module(css.historyNick),
    template = nickClasses();
  const column = node('div', c.cls(side), side);
  const result = !winnerId ? 'tie' : player.id === winnerId ? 'victory' : 'defeat';
  column.append(
    node(
      'span',
      c.cls(result),
      result,
      { tie: 'DRAW', victory: 'VICTORY!', defeat: 'DEFEAT!' }[result],
    ),
  );
  const nick = element('div', names.cls('root'));
  const identity = node('div', `${template.wrapper} ${names.cls('identity')}`.trim(), 'identity');
  identity.append(
    link(
      player.nick || 'Unknown',
      `/user/${encodeURIComponent(player.id)}`,
      `${template.nick} ${names.cls('nick')} bgh-nick`.trim(),
    ),
  );
  if (player.countryCode && /^[a-z]{2}$/i.test(player.countryCode)) {
    const flag = image(
      `https://flagcdn.com/w40/${player.countryCode.toLowerCase()}.png`,
      template.flag,
      21,
      15,
    );
    flag.alt = player.countryCode;
    identity.append(flag);
  }
  nick.append(identity);
  const rating = node('div', c.cls('rating'), 'rating');
  if (player.rating !== undefined)
    rating.append(
      node('span', c.cls('ratingLabel'), 'rating-label', 'Rating'),
      ` ${player.rating}`,
    );
  column.append(nick, rating);
  return column;
}
function avatar(player: Player, styles: Styles) {
  const c = styles.module(css.avatar);
  const cell = node('div', styles.module(css.historyItem).cls('avatarCell'), 'avatar-cell');
  const title = node('div', c.cls('titleAvatar'), 'avatar');
  const img = node('div', c.cls('titleAvatarImage'), 'avatar-image');
  if (player.pin?.url) {
    const portrait = image(
      `/images/resize:fit:96:0/gravity:ce/plain/${player.pin.url}`,
      c.cls('image'),
    );
    portrait.loading = 'eager';
    portrait.decoding = 'async';
    img.append(portrait);
  }
  const border = image(
    `/static/avatars/tiers/low-quality/tier-${Number.isFinite(player.tier) ? player.tier : 100}.webp`,
    `${c.cls('titleAvatarBorder', 'titleAvatarBorderImage')} bgh-avatar-border`.trim(),
  );
  border.decoding = 'async';
  title.append(img, border);
  cell.append(title);
  return cell;
}
function image(src: string, className: string, width?: number, height?: number) {
  const img = element('img', className);
  img.src = src;
  img.alt = '';
  img.loading = 'lazy';
  img.draggable = false;
  if (width) img.width = width;
  if (height) img.height = height;
  return img;
}

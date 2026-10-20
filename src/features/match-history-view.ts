import { profileWidget } from '../core/profile-widget';
import { element, link } from '../core/dom';
import { nativeStyles } from '../core/native-styles';
import { duelPath } from '../geoguessr/routes';
import type { HistoryEntry, Player } from '../geoguessr/types';
type Styles = ReturnType<typeof nativeStyles>;
const modeNames: Record<string, string> = {
  NmpzDuels: 'NMPZ',
  NoMoveDuels: 'No move',
  StandardDuels: 'Moving',
};
const assets = {
  recent: '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=640&q=75',
  replay: '/_next/static/media/replay.42141ac7.svg',
  summary: '/_next/static/media/location-pin.f96f50a0.svg',
};
export function historyView(entries: HistoryEntry[], userId: string, showAll: () => void) {
  const icon = image(assets.recent, '', 224, 230);
  icon.alt = 'recent duels';
  const { root: widget, body, header, content, styles } = profileWidget('Recent Duels', icon);
  const c = styles.resolve;
  widget.classList.add('bettergeo-history');
  widget.id = 'bettergeo-match-history';
  if (!styles.has('game-history-list-item_card__'))
    widget.classList.add('bettergeo-history-fallback');
  content.classList.add('bettergeo-history-title-line');
  content.append(element('small', 'bettergeo-history-credit', '(unhidden by BetterGEO)'));
  const right = element('div', c('widget_rightSlot__rRuhJ'));
  const all = nativeButton('View all', styles);
  all.addEventListener('click', showAll);
  right.append(all);
  header.append(right);
  body.replaceWith(carousel(entries.slice(0, 5), userId, styles));
  return widget;
}
function nativeButton(text: string, styles = nativeStyles()) {
  const c = styles.resolve;
  const button = element(
    'button',
    c('button_button__HOmVR', 'button_variantTertiary__WLCY9', 'button_sizeSmall__1lL87'),
  );
  button.type = 'button';
  const wrapper = element('div', c('button_wrapper__C_4h8'));
  wrapper.append(element('span', c('button_label__mIsIc'), text));
  button.append(wrapper);
  return button;
}
function carousel(entries: HistoryEntry[], userId: string, styles: Styles) {
  const c = styles.resolve;
  const widgetCarousel = element('div', c('widget_widgetCarousel__IAEDC'));
  const root = element('div', c('game-history-modal_carouselRoot__xADZm'));
  const container = element('div', c('carousel_carouselContainer__E1d_M'));
  const wrapper = element('div', c('carousel_carouselWrapper__OeuWZ'));
  const inner = element('div', c('carousel_carouselInner__n0vjp'));
  const spread = element('div', c('carousel_spread__YVvsz'));
  const item = element('div', c('game-history-modal_carouselItem__gZWWQ'));
  // Keep one visible native card. This also avoids depending on React's carousel transforms.
  item.style.cssText = 'width:min(100%,640px);max-width:100%;flex:0 0 auto;margin-inline:auto';
  spread.style.cssText = 'width:100%;display:flex;justify-content:center';
  spread.append(item);
  inner.append(spread);
  wrapper.append(inner);
  const indicators = element('div', c('carousel_indicatorWrapper__MlquS'));
  let index = 0;
  const left = arrow('Previous duel', 'left', styles),
    right = arrow('Next duel', 'right', styles);
  const dots = entries.map((entry, position) => {
    const won = entry.duel?.winnerId === userId;
    const dot = element(
      'button',
      c('carousel_indicator__FO2KP', won ? 'carousel_green__8yLi7' : 'carousel_red__vZJ2m'),
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
      dot.classList.toggle(c('carousel_active__Epbsk'), i === index);
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
  const c = styles.resolve;
  const button = element(
    'button',
    c(
      'carousel_arrowButton__XGlCA',
      side === 'left' ? 'carousel_leftArrowButton__ifAeT' : 'carousel_rightArrowButton__VF_2e',
    ),
  );
  button.type = 'button';
  button.setAttribute('aria-label', label);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', c('carousel_arrowSvg__XrIgh'));
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
export function gameCard(
  entry: HistoryEntry,
  userId: string,
  styles = nativeStyles(),
  showDate = true,
) {
  const c = styles.resolve,
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
  const item = element('div', c('game-history-list-item_item__rRU_J'));
  const result = !duel.winnerId
    ? []
    : [
        duel.winnerId === userId
          ? 'game-history-list-item_primaryUserWon__RmuIy'
          : 'game-history-list-item_opponentWon__vX27C',
      ];
  const card = element('div', c('game-history-list-item_card__4tf1Q', ...result));
  const data = element('div', c('game-history-list-item_gameData__etu0v'));
  const left = element(
    'div',
    c(
      'game-history-list-item_gameDataSide__WonRL',
      'game-history-list-item_gameDataSideLeft__PvVLQ',
    ),
  );
  const right = element(
    'div',
    c(
      'game-history-list-item_gameDataSide__WonRL',
      'game-history-list-item_gameDataSideRight__6KUOb',
    ),
  );
  const center = element('div', c('game-history-list-item_centerColumn__OcNCH'));
  center.append(
    element(
      'span',
      c('game-history-list-item_mode__DhY8T'),
      modeNames[duel.gameMode ?? ''] ?? duel.gameMode ?? 'Duels',
    ),
    element('div', c('game-history-list-item_vs__0Dtj2'), 'VS'),
  );
  if (players[0])
    left.append(
      playerColumn(players[0], 'left', duel.winnerId, styles),
      avatar(players[0], styles),
    );
  for (const player of players.slice(1))
    right.append(avatar(player, styles), playerColumn(player, 'right', duel.winnerId, styles));
  data.append(left, center, right);
  const actions = element('div', c('game-history-actions_actions__Y626Q'));
  for (const view of ['replay', 'summary'] as const) {
    const tooltip = element('span', c('tooltip_reference___tWvM'));
    const action = link(
      '',
      duelPath(entry.gameId, view),
      c('link_anchor__TGl1_', 'game-history-actions_actionBtn__u4zj2'),
    );
    action.title = view === 'replay' ? 'Replay' : 'Summary';
    action.setAttribute('aria-label', action.title);
    // An anchor styled as the native icon button avoids nesting interactive controls.
    const icon = image(
      assets[view],
      c('game-history-actions_actionIcon__ohM8d'),
      view === 'replay' ? 22 : 24,
      view === 'replay' ? 22 : 24,
    );
    icon.alt = view;
    action.append(icon);
    tooltip.append(action);
    actions.append(tooltip);
  }
  const date = duel.rounds?.[0]?.startTime;
  if (date && Number.isFinite(Date.parse(date))) {
    const when = new Date(date);
    item.title = when.toLocaleString();
    if (showDate) {
      const dateSlot = element('span', c('game-history-list-item_date__G_uNE'));
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
  card.append(data, actions);
  item.append(card);
  return item;
}
function playerColumn(
  player: Player,
  side: 'left' | 'right',
  winnerId: string | undefined,
  styles: Styles,
) {
  const c = styles.resolve;
  const column = element(
    'div',
    c(
      side === 'left'
        ? 'game-history-player-column_left__cXQn4'
        : 'game-history-player-column_right__vW2fr',
    ),
  );
  if (winnerId)
    column.append(
      element(
        'span',
        c(
          player.id === winnerId
            ? 'game-history-player-column_victory__PkWR6'
            : 'game-history-player-column_defeat__Zv4p5',
        ),
        player.id === winnerId ? 'VICTORY!' : 'DEFEAT!',
      ),
    );
  const nick = element('div', c('ellipsed-user-nick_root__8MmmI'));
  const identity = element(
    'div',
    c('player-nick_wrapper__WjkG6', 'ellipsed-user-nick_identity__YFhgt'),
  );
  identity.append(
    link(
      player.nick || 'Unknown',
      `/user/${encodeURIComponent(player.id)}`,
      c('link_anchor__TGl1_', 'nick_nick__THesc', 'ellipsed-user-nick_nick__WF5w5'),
    ),
  );
  if (player.countryCode && /^[a-z]{2}$/i.test(player.countryCode)) {
    const flag = image(
      `https://flagcdn.com/w40/${player.countryCode.toLowerCase()}.png`,
      c('flag_flag__Fsx7Z', 'player-nick_flag__yQWK5'),
      21,
      15,
    );
    flag.alt = player.countryCode;
    identity.append(flag);
  }
  nick.append(identity);
  const rating = element('div', c('game-history-player-column_rating__mqEKT'));
  rating.append(
    element('span', c('game-history-player-column_ratingLabel____9TC'), 'Rating'),
    ` ${player.rating ?? '—'}`,
  );
  column.append(nick, rating);
  return column;
}
function avatar(player: Player, styles: Styles) {
  const c = styles.resolve;
  const cell = element('div', c('game-history-list-item_avatarCell__Z1U6s'));
  const title = element('div', c('avatar_titleAvatar__JsMrO'));
  const img = element('div', c('avatar_titleAvatarImage__sXIP7'));
  if (player.pin?.url) {
    const portrait = image(
      `/images/resize:auto:48:48/gravity:ce/plain/${player.pin.url}`,
      c('styles_image__3rHlb'),
    );
    // Next/Image's fill styles are inline in the native markup, not in its CSS module.
    portrait.style.cssText =
      'position:absolute;width:100%;inset:0;object-fit:cover;color:transparent';
    portrait.loading = 'eager';
    portrait.decoding = 'async';
    img.append(portrait);
  }
  const border = image(
    `/static/avatars/tiers/low-quality/tier-${Number.isFinite(player.tier) ? player.tier : 100}.webp`,
    c('avatar_titleAvatarBorder__QmnOl'),
  );
  border.style.cssText = 'position:absolute;height:100%;width:100%;inset:0;color:transparent';
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

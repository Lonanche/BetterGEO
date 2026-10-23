import { element, link } from '../core/dom';
import { countryName } from '../geoguessr/countries';
import type { RaceParticipant } from '../geoguessr/online-race';
import { refreshRaceBadge } from './race-badge';

/** Reuse loaded player decorations, otherwise build the same native avatar/nickname layout. */
export function racePlayer(
  id: string,
  player: RaceParticipant,
  c: (...names: string[]) => string,
  nativeBoard: Element | null,
) {
  const nativeLink = nativeBoard?.querySelector<HTMLAnchorElement>(`a[href$="/user/${id}"]`);
  const nativeIdentity = nativeLink?.closest('[class*="player-nick_wrapper__"]');
  const identity = nativeIdentity
    ? (nativeIdentity.cloneNode(true) as HTMLElement)
    : element('div', c('player-nick_wrapper__WjkG6', 'global-leaderboard-row_player__5R_nz'));
  // Clones are only visual; do not duplicate native IDs or injected race tags.
  identity.querySelectorAll('.bettergeo-online-race').forEach((badge) => badge.remove());
  identity.removeAttribute('id');
  for (const node of identity.querySelectorAll('[id], [aria-describedby]')) {
    node.removeAttribute('id');
    node.removeAttribute('aria-describedby');
  }
  if (!nativeIdentity) {
    if (player.avatar) {
      const avatar = element(
        'div',
        c('legacy-avatar_avatar__Cyqz8', 'global-leaderboard-row_avatar__F93eb'),
      );
      const circle = element(
        'div',
        c(
          'styles_circle__xzz4g',
          'styles_variantFloating__EERDe',
          'styles_colorWhite__JDJEH',
          'styles_borderColorWhite__VsTBL',
          'styles_borderSizeFactorHalf__XbkiO',
        ),
      );
      const rectangle = element('div', c('styles_rectangle__864ZT'));
      rectangle.style.paddingTop = '100%';
      const inner = element('div', c('styles_innerCircle__QspyH'));
      const content = element('div', c('styles_content__hkoJ_'));
      const image = element('img', c('styles_image__3rHlb'));
      image.src = `/images/resize:auto:48:48/gravity:ce/plain/${player.avatar}`;
      image.alt = '';
      image.loading = 'lazy';
      image.draggable = false;
      image.style.cssText = 'position:absolute;width:100%;height:100%;inset:0;object-fit:cover';
      content.append(image);
      inner.append(content);
      rectangle.append(inner);
      circle.append(rectangle);
      avatar.append(circle);
      identity.append(avatar);
    }
    if (player.countryCode) {
      const flag = element('img', c('flag_flag__Fsx7Z', 'player-nick_flag__yQWK5'));
      flag.src = `https://flagcdn.com/w40/${player.countryCode}.png`;
      flag.alt = '';
      flag.title = countryName(player.countryCode);
      flag.loading = 'lazy';
      flag.draggable = false;
      identity.append(flag);
    }
    identity.append(
      link(
        player.nick,
        `/user/${id}`,
        c('link_anchor__TGl1_', 'nick_nick__THesc', 'global-leaderboard-row_nick__3FxXj'),
      ),
    );
  }
  const badge = element('span', 'bettergeo-online-race');
  refreshRaceBadge(badge, player);
  badge.tabIndex = 0;
  identity.append(badge);
  return identity;
}

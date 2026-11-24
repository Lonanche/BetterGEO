import type { Feature } from '../core/feature';
import { element } from '../core/dom';
import { nativeSelector, nativeStyles } from '../core/native-styles';
import { profile } from '../geoguessr/styles';
import { watchProfile } from '../core/profile';
import { moderationState } from '../geoguessr/moderation';
import type { UserModerationStatus } from '../geoguessr/types';
export const profileStatus: Feature = {
  id: 'profile-status',
  name: 'Profile ban and suspension status',
  description:
    'Show a red badge beside profile badges for active bans or suspensions. Hover for suspension time remaining.',
  enable({ api, events }, scope) {
    let badge: HTMLElement | undefined, row: Element | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const style = element('style');
    style.textContent = CSS;
    function removeBadge() {
      badge?.remove();
      badge = undefined;
      row?.classList.remove('bettergeo-badges-row');
      row = undefined;
    }
    scope.own(() => style.remove());
    watchProfile(events, scope, {
      name: 'profile status',
      target: () => document.querySelector(nativeSelector(profile, 'headerMainContent')),
      load: (id) => api.userStatus(id),
      reset() {
        clearTimeout(timer);
        removeBadge();
      },
      render(data, _, header) {
        clearTimeout(timer);
        const state = moderationState(data);
        if (!state.banned && state.suspension !== 'active') {
          removeBadge();
          return;
        }
        if (!style.isConnected) document.head.append(style);
        if (!badge?.isConnected) {
          removeBadge();
          badge = statusBadge(data);
          if (!badge) return;
          const wrapperSelector = nativeSelector(profile, 'proBadgeWrapper');
          const pro = header.querySelector(
            `[data-qa="pro-tier"], ${nativeSelector(profile, 'proBadge')}`,
          );
          const wrapper = pro?.closest(wrapperSelector) ?? header.querySelector(wrapperSelector);
          if (wrapper) {
            row = wrapper;
            row.classList.add('bettergeo-badges-row');
            wrapper.append(badge);
          } else {
            const heading = header.querySelector('h1');
            if (heading) heading.after(badge);
            else header.append(badge);
          }
        }
        refreshTooltip(badge, data);
        if (state.suspension === 'active')
          timer = setTimeout(
            () => {
              if (scope.active) events.schedule();
            },
            Math.min(60_000, Math.max(1, state.expiry - Date.now())),
          );
      },
    });
  },
};

export function remainingTime(milliseconds: number) {
  let minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  const days = Math.floor(minutes / 1440);
  minutes %= 1440;
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`);
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`);
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`);
  return parts.join(', ');
}
function refreshTooltip(badge: HTMLElement, user: UserModerationStatus) {
  const state = moderationState(user);
  const parts = state.banned ? ['Account banned.'] : [];
  if (state.suspension === 'active')
    parts.push(
      `Suspended: ${remainingTime(state.expiry - Date.now())} remaining. Ends ${new Date(state.expiry).toLocaleString()}.`,
    );
  const text = parts.join(' ');
  if (badge.title !== text) badge.title = text;
  if (badge.getAttribute('aria-label') !== text) badge.setAttribute('aria-label', text);
}
export function statusBadge(user: UserModerationStatus): HTMLElement | undefined {
  const state = moderationState(user);
  if (!state.banned && state.suspension !== 'active') return undefined;
  const badge = element(
    'p',
    `${nativeStyles().module(profile).cls('proBadge')} bettergeo-restriction-badge`.trim(),
  );
  badge.append(
    element('span', 'bettergeo-restriction-label', state.banned ? 'Banned' : 'Suspended'),
  );
  badge.id = 'bettergeo-profile-status';
  badge.tabIndex = 0;
  refreshTooltip(badge, user);
  badge.addEventListener('mouseenter', () => refreshTooltip(badge, user));
  badge.addEventListener('focus', () => refreshTooltip(badge, user));
  return badge;
}
const CSS = `
.bettergeo-badges-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.bettergeo-restriction-badge {
  display: inline-block;
  box-sizing: border-box;
  width: fit-content;
  margin: 0;
  padding: 3px 10px;
  border: 0;
  border-radius: 4px;
  background: #b92d43;
  transform: skewX(-10deg);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  font-style: italic;
  line-height: 1.5;
  text-transform: uppercase;
  cursor: help;
}
.bettergeo-restriction-label {
  display: inline-block;
  transform: skewX(10deg);
}
.bettergeo-restriction-badge:focus-visible {
  outline: 2px solid #ff9aac;
  outline-offset: 3px;
}
`;

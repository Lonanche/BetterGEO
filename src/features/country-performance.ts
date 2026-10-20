import type { Feature } from '../core/feature';
import { element } from '../core/dom';
import { profileWidget } from '../core/profile-widget';
import { countryName } from '../geoguessr/countries';
import { watchProfile, profileWidgets } from '../core/profile';
import type { RankedCountryStats } from '../geoguessr/types';
export const countryPerformance: Feature = {
  id: 'country-performance',
  name: 'Country ranked stats',
  description: 'Show a player’s best and worst countries from ranked progress on their profile.',
  enable({ api, events }, scope) {
    let widget: HTMLElement | undefined;
    const style = element('style');
    style.textContent = CSS;
    scope.own(() => style.remove());
    watchProfile(events, scope, {
      name: 'country performance',
      target: profileWidgets,
      load: (id) => api.rankedCountries(id),
      reset() {
        widget?.remove();
        widget = undefined;
      },
      render(data, _, container) {
        if (widget?.isConnected || (!data.bestCountries.length && !data.worstCountries.length))
          return;
        if (!style.isConnected) document.head.append(style);
        widget = countryPerformanceView(data);
        const ranked = [...container.querySelectorAll('h2')].find((heading) =>
          /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? ''),
        );
        const rankedRow = ranked?.closest('[class*="profile-v2_widgetRow__"]');
        if (rankedRow && container.contains(rankedRow)) rankedRow.after(widget);
        else container.prepend(widget);
      },
    });
  },
};

function countryPerformanceView(data: RankedCountryStats) {
  const rankedHeading = [...document.querySelectorAll('h2')].find((heading) =>
    /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? ''),
  );
  const nativeIcon = rankedHeading?.closest('[class*="widget_title__"]')?.querySelector('img');
  const icon = nativeIcon ? (nativeIcon.cloneNode(false) as HTMLImageElement) : element('img');
  if (!nativeIcon)
    icon.src =
      '/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-duels.f0444913.webp&w=256&q=75';
  icon.removeAttribute('id');
  icon.alt = '';
  icon.width = 40;
  icon.height = 40;
  icon.loading = 'lazy';
  const { root, body, inner, header, content } = profileWidget('Country ranked stats', icon);
  header.classList.add('bettergeo-country-header');
  content.append(element('small', 'bettergeo-country-credit', 'Ranked Solo · BetterGEO'));
  root.id = 'bettergeo-country-performance';
  root.classList.add('bettergeo-country-performance');
  inner.classList.add('bettergeo-country-inner');
  body.classList.add('bettergeo-country-groups');
  for (const [label, codes] of [
    ['Best countries', data.bestCountries],
    ['Worst countries', data.worstCountries],
  ] as const) {
    if (!codes.length) continue;
    const group = element('section', 'bettergeo-country-group');
    group.setAttribute('aria-label', label);
    group.append(element('h3', '', label));
    const list = element('ul');
    for (const code of codes) {
      const name = countryName(code),
        chip = element('li', 'bettergeo-country-chip');
      chip.title = name;
      const flag = element('img');
      flag.src = `https://flagcdn.com/w40/${code}.png`;
      flag.width = 21;
      flag.height = 15;
      flag.alt = '';
      flag.loading = 'lazy';
      flag.addEventListener(
        'error',
        () => {
          flag.hidden = true;
        },
        { once: true },
      );
      chip.append(flag, element('span', '', name));
      list.append(chip);
    }
    group.append(list);
    body.append(group);
  }
  return root;
}
const CSS = `
.bettergeo-country-performance {
  min-width: 0;
  width: 100%;
  color: #fff;
}
.bettergeo-country-inner {
  padding: 0;
}
.bettergeo-country-header {
  padding: 10px 12px;
}
.bettergeo-country-header [class*='widget_header__'] {
  display: flex;
  align-items: center;
  gap: 10px;
}
.bettergeo-country-header img {
  width: 40px;
  height: 40px;
  object-fit: contain;
  flex-shrink: 0;
}
.bettergeo-country-header h2 {
  font-size: 16px;
  margin: 0;
  font-weight: 700;
  font-style: italic;
  color: #fff;
}
.bettergeo-country-credit {
  display: block;
  color: #b6aecb;
  font-size: 10px;
  line-height: 1.4;
  margin-top: 2px;
}
.bettergeo-country-groups {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  padding: 14px 16px 16px;
}
.bettergeo-country-group:only-child {
  grid-column: 1/-1;
}
.bettergeo-country-group + .bettergeo-country-group {
  border-left: 1px solid #ffffff12;
  padding-left: 16px;
}
.bettergeo-country-group h3 {
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  color: #d5cee5;
  margin: 0 0 9px;
}
.bettergeo-country-group ul {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.bettergeo-country-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid #ffffff14;
  border-radius: 5px;
  background: #ffffff05;
  color: #f5f2ff;
  font-size: 12px;
  line-height: 1.4;
}
.bettergeo-country-chip img {
  flex-shrink: 0;
  border-radius: 2px;
  object-fit: cover;
}
@media (max-width: 520px) {
  .bettergeo-country-groups {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
  .bettergeo-country-group + .bettergeo-country-group {
    border-left: 0;
    padding-left: 0;
    border-top: 1px solid #ffffff12;
    padding-top: 14px;
  }
}
`;

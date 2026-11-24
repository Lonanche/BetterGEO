import type { Feature } from '../core/feature';
import { element } from '../core/dom';
import { dropdownLists, menuEntry, insertMenuEntry } from '../core/navigation-menu';
import { images } from '../geoguessr/styles';
export const randomMap: Feature = {
  id: 'random-map',
  name: 'Random map in Singleplayer',
  description: 'Add Random Map inside the Singleplayer dropdown.',
  enable({ api, page, events }, scope) {
    const mounts = new Map<Element, HTMLElement>();
    const pendingTabs = new Set<Window>();
    let busy = false;
    const style = element('style');
    style.textContent = `
.bettergeo-random-map-button {
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.bettergeo-random-map-button:focus-visible {
  outline: 2px solid #a896ff;
  outline-offset: -2px;
}
.bettergeo-random-map-button:disabled {
  opacity: 0.6;
  cursor: wait;
}
`;
    scope.own(() => {
      mounts.forEach((node) => node.remove());
      mounts.clear();
      pendingTabs.forEach((tab) => tab.close());
      pendingTabs.clear();
      style.remove();
    });
    async function choose(event: MouseEvent, button: HTMLButtonElement, label: HTMLElement) {
      if (event.type === 'auxclick' && event.button !== 1) return;
      if (event.type === 'click' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      if (busy || !scope.active) return;
      const startingUrl = page.location.href;
      button.title = 'Open a random community map';
      const newTab = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
      // Open while the click's user activation is still live, before awaiting the API.
      let tab: Window | null;
      try {
        tab = newTab ? page.open('about:blank', '_blank') : null;
      } catch {
        button.title = 'Could not open a new tab. Try a normal click.';
        return;
      }
      if (newTab && !tab) {
        button.title = 'Allow pop-ups to open a random map in a new tab.';
        return;
      }
      if (tab) {
        tab.opener = null;
        pendingTabs.add(tab);
      }
      busy = true;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      label.textContent = 'Finding map…';
      try {
        const url = await api.randomMapUrl();
        if (!scope.active) return;
        if (tab) {
          if (!tab.closed) tab.location.replace(url);
          pendingTabs.delete(tab);
        } else if (page.location.href === startingUrl) page.location.assign(url);
      } catch (error) {
        if (tab && pendingTabs.delete(tab)) tab.close();
        if (scope.active) {
          console.error('[BetterGEO random map]', error);
          button.title = 'Could not load a random map. Click to try again.';
          label.textContent = 'Retry random map';
        }
      } finally {
        busy = false;
        if (scope.active) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
          if (label.textContent === 'Finding map…') label.textContent = 'Random Map';
        }
      }
    }
    function mount() {
      for (const [anchor, node] of mounts)
        if (!anchor.isConnected || !node.isConnected) {
          node.remove();
          mounts.delete(anchor);
        }
      if (!document.head) return;
      if (!style.isConnected) document.head.append(style);
      const anchors = singleplayerDropdowns();
      for (const anchor of anchors) {
        if (mounts.has(anchor)) continue;
        const maps = [...anchor.querySelectorAll<HTMLAnchorElement>('a[href]')].find(isMapsLink);
        const originalIcon = maps?.querySelector('img');
        const icon = originalIcon
          ? (originalIcon.cloneNode(false) as HTMLImageElement)
          : element('img');
        if (!originalIcon) icon.src = images.maps;
        icon.removeAttribute('id');
        icon.alt = '';
        icon.width = 56;
        icon.height = 56;
        icon.loading = 'lazy';
        const { item: button, title: label } = menuEntry(
          'button',
          'Random Map',
          'Discover a random community map',
          icon,
          maps,
        );
        button.classList.add('bettergeo-random-map-button');
        button.dataset.bettergeoRandomMap = '';
        button.type = 'button';
        button.title = 'Open a random community map';
        button.addEventListener('click', (event) => {
          void choose(event, button, label);
        });
        button.addEventListener('auxclick', (event) => {
          void choose(event, button, label);
        });
        insertMenuEntry(anchor, button);
        mounts.set(anchor, button);
      }
    }
    scope.own(events.subscribe(mount));
  },
};

function isMapsLink(link: HTMLAnchorElement) {
  try {
    return /^\/(?:[a-z]{2}\/)?maps(?:\/community)?\/?$/.test(
      new URL(link.href, location.origin).pathname,
    );
  } catch {
    return false;
  }
}
/** Match the real dropdown list, not its outer positioning wrapper or an item. */
function singleplayerDropdowns() {
  return dropdownLists().filter((popup) =>
    [...popup.querySelectorAll<HTMLAnchorElement>('a[href]')].some(isMapsLink),
  );
}

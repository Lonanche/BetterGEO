import type { Services } from '../core/feature';
import { Scope } from '../core/scope';
import { element } from '../core/dom';
import { nativeStyles } from '../core/native-styles';
import { racePlayer } from './race-player';
import type { RaceParticipant } from '../geoguessr/online-race';

interface Snapshot {
  players: Map<string, RaceParticipant>;
  loadedAt: number;
}

/** Own our panel without replacing React's leaderboard DOM or changing its selected scope. */
export function installRaceLeaderboard(
  { api, events }: Services,
  scope: Scope,
  acceptPlayers: (players: Map<string, RaceParticipant>) => void,
) {
  let mounted: { tabs: Element; shell: Element; content: Element; scope: Scope } | undefined;
  const style = element('style');
  style.textContent = CSS;
  scope.own(() => {
    mounted?.scope.dispose();
    style.remove();
  });
  scope.own(
    events.subscribe(() => {
      const onDuels = /^\/(?:[a-z]{2}\/)?multiplayer\/duels\/?$/.test(location.pathname);
      const tabs = onDuels
        ? document.querySelector('[class*="global-leaderboard_scopeTabs__"] [role="tablist"]')
        : null;
      const shell = tabs?.closest('[class*="leaderboard-shell_shell__"]');
      const content = shell?.querySelector('[class*="leaderboard-shell_content__"]');
      if (
        mounted &&
        (mounted.tabs !== tabs ||
          mounted.shell !== shell ||
          mounted.content !== content ||
          !mounted.tabs.querySelector('[data-bettergeo-race-tab]'))
      ) {
        mounted.scope.dispose();
        mounted = undefined;
      }
      if (!tabs || !shell || !content || mounted) return;
      const template = tabs.querySelector<HTMLButtonElement>('button[role="tab"]');
      if (!template) return;
      if (!style.isConnected) document.head.append(style);
      const c = nativeStyles().resolve;
      const cycle = new Scope();
      mounted = { tabs, shell, content, scope: cycle };
      const button = element('button', `${template.className} bettergeo-race-tab`, 'ELO Race');
      button.type = 'button';
      button.id = 'bettergeo-race-tab';
      button.dataset.bettergeoRaceTab = '';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      button.setAttribute('aria-controls', 'bettergeo-race-panel');
      const panel = element('section', 'bettergeo-race-panel');
      panel.id = 'bettergeo-race-panel';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', button.id);
      panel.hidden = true;
      const filters = element(
        'div',
        `${c('global-leaderboard_modeTabs__JMDtx')} bettergeo-race-filters`,
      );
      filters.hidden = true;
      const filterRoot = element('div', c('tabs_root__HXSCq'));
      filterRoot.dataset.variant = 'underline';
      filterRoot.dataset.rounded = 'default';
      filterRoot.dataset.width = 'auto';
      const filterList = element('div', c('tabs_list__KrxZ4'));
      const filterScroller = element('div', c('tabs_scroller__E54XO'));
      filterScroller.setAttribute('role', 'group');
      filterScroller.setAttribute('aria-label', 'Race region');
      filterList.append(filterScroller);
      filterRoot.append(filterList);
      filters.append(filterRoot);
      const status = element('p', 'bettergeo-race-status');
      status.setAttribute('role', 'status');
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      icon.setAttribute('viewBox', '0 0 24 24');
      icon.setAttribute('width', '14');
      icon.setAttribute('height', '14');
      icon.setAttribute('fill', 'none');
      icon.setAttribute('stroke', 'currentColor');
      icon.setAttribute('stroke-width', '2');
      icon.setAttribute('aria-hidden', 'true');
      const updated = element('span', 'bettergeo-race-updated');
      updated.title =
        'Standings update every 5 minutes. The refresh button reloads the shared server cache.';
      updated.tabIndex = 0;
      const refresh = element('button', 'bettergeo-race-refresh');
      refresh.type = 'button';
      refresh.title = 'Reload cached standings';
      refresh.setAttribute('aria-label', 'Reload race standings');
      const refreshIcon = icon;
      const arrow = document.createElementNS(icon.namespaceURI, 'path');
      arrow.setAttribute(
        'd',
        'M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.5 9M4.5 15a8 8 0 0 0 13.4 2.9',
      );
      refreshIcon.append(arrow);
      refresh.append(refreshIcon);
      const metadata = element('span', 'bettergeo-race-metadata');
      metadata.append(updated, refresh);
      const retry = element('button', `${template.className} bettergeo-race-retry`, 'Retry');
      retry.type = 'button';
      retry.hidden = true;
      const board = element(
        'div',
        `${c('global-leaderboard_leaderboard__mx2Iy')} bettergeo-race-board`,
      );
      const headerTable = element(
        'table',
        `${c('global-leaderboard_table__6Y95Y')} bettergeo-race-table`,
      );
      // Both tables share fixed column tracks so points align with their headers.
      const columns = () => {
        const group = element('colgroup');
        for (const width of ['44px', '56px', '', '80px', '82px', '76px']) {
          const col = element('col');
          if (width) col.style.width = width;
          group.append(col);
        }
        return group;
      };
      headerTable.append(columns());
      const head = element('thead');
      const headers = element('tr');
      const orderHeader = element('th', c('global-leaderboard_rankHead___zVjK'), '#');
      orderHeader.scope = 'col';
      orderHeader.title = 'Position in the current sort order';
      headers.append(orderHeader);
      for (const [label, className, key] of [
        ['Proj.', 'global-leaderboard_rankHead___zVjK', 'projected'],
        ['Name', 'global-leaderboard_playerHead__l5F01', 'name'],
        ['Elo', 'global-leaderboard_ratingHead__Q5Xbt', 'elo'],
        ['Proj. pts', 'global-leaderboard_ratingHead__Q5Xbt', 'total'],
        ['Wk pts', 'global-leaderboard_ratingHead__Q5Xbt', 'week'],
      ]) {
        const th = element('th', c(className!));
        const sortButton = element('button', 'bettergeo-race-sort-header', label);
        sortButton.type = 'button';
        sortButton.dataset.bettergeoRaceSort = key!;
        cycle.listen(sortButton, 'click', () => {
          direction = sort === key ? -direction : key === 'projected' || key === 'name' ? 1 : -1;
          sort = key!;
          render();
        });
        th.append(sortButton);
        if (key === 'elo') th.setAttribute('aria-sort', 'descending');
        if (label === 'Proj.') th.title = 'Projected regional position';
        if (label === 'Proj. pts')
          th.title = 'Projected total: official completed weeks plus the snapshot week';
        if (label === 'Wk pts')
          th.title = 'Projected points for the snapshot week; requires at least 10 games';
        th.scope = 'col';
        if (label === 'Name') th.append(metadata);
        headers.append(th);
      }
      head.append(headers);
      headerTable.append(head);
      const table = element(
        'table',
        `${c('global-leaderboard_table__6Y95Y')} bettergeo-race-table`,
      );
      const body = element('tbody');
      table.append(columns(), body);
      const results = element(
        'div',
        `${c('global-leaderboard_rows__OlmnP')} bettergeo-race-results`,
      );
      results.append(table);
      board.append(headerTable, results);
      panel.append(status, retry, board);
      tabs.append(button);
      const nativeModeTabs = shell.querySelector('[class*="global-leaderboard_modeTabs__"]');
      if (nativeModeTabs) nativeModeTabs.after(filters);
      else tabs.parentElement!.after(filters);
      content.append(panel);
      let active = false;
      let region = 'All';
      let sort = 'elo';
      let direction = -1;
      let snapshot: Snapshot | undefined;
      let refreshFailed = false;
      let request: AbortController | undefined;
      const nativeAttributes = new Map<Element, (string | null)[]>();
      const attributeNames = ['aria-selected', 'data-state', 'tabindex'];

      function render() {
        if (!snapshot) return;
        const entries = [...snapshot.players].filter(
          ([, player]) => region === 'All' || player.region === region,
        );
        const value = (player: RaceParticipant) =>
          sort === 'elo'
            ? player.rating
            : sort === 'projected'
              ? (player.projection?.position ?? player.position)
              : sort === 'total'
                ? player.projection?.total
                : sort === 'week'
                  ? player.projection?.weekPoints
                  : player.nick;
        entries.sort(([, a], [, b]) => {
          const va = value(a),
            vb = value(b);
          // Unavailable values stay last in either direction.
          if (va === undefined) return vb === undefined ? a.nick.localeCompare(b.nick) : 1;
          if (vb === undefined) return -1;
          const difference =
            typeof va === 'string' && typeof vb === 'string'
              ? va.localeCompare(vb)
              : Number(va) - Number(vb);
          return difference * direction || a.nick.localeCompare(b.nick);
        });
        for (const th of headers.querySelectorAll('th')) {
          const key = th.querySelector<HTMLElement>('[data-bettergeo-race-sort]')?.dataset
            .bettergeoRaceSort;
          if (key === sort)
            th.setAttribute('aria-sort', direction === 1 ? 'ascending' : 'descending');
          else th.removeAttribute('aria-sort');
        }
        const nativeBoard =
          [...content!.querySelectorAll('[class*="global-leaderboard_leaderboard__"]')].find(
            (node) => !panel.contains(node),
          ) ?? null;
        const fragment = document.createDocumentFragment();
        for (const [index, [id, player]] of entries.entries()) {
          const rating = player.rating;
          const row = element('tr', c('global-leaderboard-row_row__Vk0Dt'));
          const orderCell = element('td', c('global-leaderboard-row_rankCell__rhsqZ'));
          orderCell.append(
            element('div', c('global-leaderboard-row_rank__UxnQx'), String(index + 1)),
          );
          orderCell.title = 'Position in the current sort order';
          const rankCell = element('td', c('global-leaderboard-row_rankCell__rhsqZ'));
          rankCell.title = 'Projected regional position';
          rankCell.append(
            element(
              'div',
              c('global-leaderboard-row_rank__UxnQx'),
              String(player.projection?.position ?? player.position ?? '—'),
            ),
          );
          const name = element('td', c('global-leaderboard-row_playerCell__8Gl9V'));
          name.append(racePlayer(id, player, c, nativeBoard));
          const ratingCell = element('td', c('global-leaderboard-row_ratingCell__CSoq3'));
          ratingCell.append(
            element(
              'span',
              c('global-leaderboard-row_ratingValue__AX7HJ'),
              rating === undefined ? 'N/A' : rating.toLocaleString(),
            ),
          );
          const totalCell = element(
            'td',
            `${c('global-leaderboard-row_ratingCell__CSoq3')} bettergeo-race-points`,
          );
          totalCell.textContent = player.projection?.total.toLocaleString() ?? 'N/A';
          totalCell.title = 'Projected total points if the snapshot week ended now';
          const weekCell = element(
            'td',
            `${c('global-leaderboard-row_ratingCell__CSoq3')} bettergeo-race-points`,
          );
          weekCell.textContent = player.projection?.weekPoints.toLocaleString() ?? 'N/A';
          weekCell.title = player.projection
            ? `Week ${player.projection.weekIndex + 1}: projected points · ${player.projection.gamesWeek} games played`
            : 'Weekly projection unavailable';
          row.append(orderCell, rankCell, name, ratingCell, totalCell, weekCell);
          fragment.append(row);
        }
        body.replaceChildren(fragment);
        updated.textContent = `Updated ${new Date(snapshot.loadedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        const projection = snapshot.players.values().next().value?.projection;
        updated.title = `Snapshot from ${new Date(snapshot.loadedAt).toLocaleString()}. Standings update every 5 minutes; the refresh button reloads the shared server cache.`;
        status.textContent = refreshFailed
          ? 'Could not refresh race standings. Showing the last successful snapshot.'
          : projection?.waitingForWeek
            ? 'Waiting for this week’s leaderboard. Showing the previous snapshot.'
            : projection?.stale
              ? 'Update delayed. Showing the last successful snapshot.'
              : entries.length
                ? ''
                : 'No participants in this region.';
        status.hidden = !status.textContent;
      }

      for (const label of ['All', 'APAC', 'EMEA', 'Americas']) {
        const filter = element('button', c('tabs_trigger__KOf2y'), label);
        filter.dataset.state = label === region ? 'active' : 'inactive';
        filter.type = 'button';
        filter.setAttribute('aria-pressed', String(label === region));
        cycle.listen(filter, 'click', () => {
          region = label;
          for (const item of filters.querySelectorAll('button')) {
            item.setAttribute('aria-pressed', String(item === filter));
            item.dataset.state = item === filter ? 'active' : 'inactive';
          }
          updateFilterUnderline();
          render();
        });
        filterScroller.append(filter);
      }

      function updateFilterUnderline() {
        const selected = filterScroller.querySelector<HTMLElement>('[aria-pressed="true"]');
        filterScroller.style.setProperty('--tab-list-w', `${filterScroller.scrollWidth}px`);
        filterScroller.style.setProperty('--tab-active-w', `${selected?.offsetWidth ?? 0}px`);
        filterScroller.style.setProperty('--tab-active-x', `${selected?.offsetLeft ?? 0}px`);
      }

      cycle.listen(window, 'resize', updateFilterUnderline);
      function deactivate() {
        active = false;
        request?.abort();
        request = undefined;
        shell!.classList.remove('bettergeo-race-open');
        panel.hidden = true;
        filters.hidden = true;
        button.setAttribute('aria-selected', 'false');
        button.dataset.state = 'inactive';
        for (const [tab, values] of nativeAttributes) {
          attributeNames.forEach((name, index) => {
            const value = values[index];
            if (value == null) tab.removeAttribute(name);
            else tab.setAttribute(name, value);
          });
        }
        nativeAttributes.clear();
      }

      async function load(force = false) {
        request?.abort();
        const controller = new AbortController();
        request = controller;
        const signal = controller.signal;
        retry.hidden = true;
        refresh.disabled = true;
        status.hidden = false;
        board.hidden = !snapshot;
        panel.setAttribute('aria-busy', 'true');
        status.textContent = snapshot ? 'Refreshing race standings…' : 'Loading race participants…';
        try {
          const players = await api.onlineRacePlayers(signal, force);
          signal.throwIfAborted();
          acceptPlayers(players);
          refreshFailed = false;
          snapshot = {
            players,
            loadedAt: players.values().next().value?.projection?.updatedAt ?? Date.now(),
          };
          if (!cycle.active || !active) return;
          render();
          board.hidden = false;
        } catch {
          if (!signal.aborted && cycle.active && active) {
            refreshFailed = true;
            if (snapshot) render();
            else status.textContent = 'Could not load race standings. Please try again.';
            retry.hidden = false;
          }
        } finally {
          if (request === controller) {
            request = undefined;
            refresh.disabled = false;
            panel.removeAttribute('aria-busy');
          }
        }
      }

      const refreshTimer = setInterval(() => {
        if (active) void load();
      }, 5 * 60_000);
      cycle.own(() => clearInterval(refreshTimer));
      cycle.listen(retry, 'click', () => {
        void load(true);
      });
      cycle.listen(refresh, 'click', () => {
        void load(true);
      });
      cycle.listen(button, 'click', (event) => {
        event.stopPropagation();
        if (active) return;
        active = true;
        for (const tab of tabs.querySelectorAll('[role="tab"]')) {
          if (tab === button) continue;
          nativeAttributes.set(
            tab,
            attributeNames.map((name) => tab.getAttribute(name)),
          );
          tab.setAttribute('aria-selected', 'false');
          tab.setAttribute('data-state', 'inactive');
        }
        button.setAttribute('aria-selected', 'true');
        button.dataset.state = 'active';
        shell.classList.add('bettergeo-race-open');
        panel.hidden = false;
        filters.hidden = false;
        updateFilterUnderline();
        void load();
      });
      cycle.listen(button, 'keydown', (event) => {
        const key = (event as KeyboardEvent).key;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
        event.preventDefault();
        event.stopPropagation();
        const native = [...tabs.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].filter(
          (tab) => tab !== button,
        );
        const target = key === 'ArrowLeft' ? native.at(-1) : key === 'End' ? button : native[0];
        target?.click();
        target?.focus();
      });
      // Leave the custom view before React handles a native scope or mode selection.
      const nativeClick = (event: Event) => {
        if (
          active &&
          event.target instanceof Element &&
          !panel.contains(event.target) &&
          !filters.contains(event.target) &&
          event.target.closest('button') !== button
        )
          deactivate();
      };
      shell.addEventListener('click', nativeClick, true);
      cycle.own(() => {
        deactivate();
        shell.removeEventListener('click', nativeClick, true);
        button.remove();
        panel.remove();
        filters.remove();
      });
    }),
  );
}

const CSS = `
.bettergeo-race-open [class*="leaderboard-shell_content__"] > :not(.bettergeo-race-panel),
.bettergeo-race-open [class*="global-leaderboard_modeTabs__"]:not(.bettergeo-race-filters) { display: none !important; }
.bettergeo-race-open [class*="global-leaderboard_scopeTabs__"] [role="tablist"]::after { display: none; }
.bettergeo-race-tab[aria-selected="true"] { color: inherit; box-shadow: inset 0 -2px currentColor; }
.bettergeo-race-panel { display: flex; flex: 1 1 0; flex-direction: column; min-height: 0; overflow: hidden; }
.bettergeo-race-panel[hidden], .bettergeo-race-panel [hidden], .bettergeo-race-filters[hidden] { display: none !important; }
.bettergeo-race-status { flex: none; margin: 0; padding: .75rem 1rem; font: inherit; font-size: .75rem; opacity: .7; }
.bettergeo-race-retry { margin: 0 1rem .75rem; }
.bettergeo-race-metadata { float: right; display: inline-flex; align-items: center; gap: .375rem; margin-left: .5rem; font-size: 9px; font-style: normal; font-weight: 400; text-transform: none; }
.bettergeo-race-updated { opacity: .65; }
.bettergeo-race-refresh { display: inline-flex; align-items: center; border: 0; padding: 0; background: none; color: inherit; cursor: pointer; }
.bettergeo-race-refresh:hover { opacity: .7; }
.bettergeo-race-refresh:disabled { opacity: .4; cursor: wait; }
.bettergeo-race-refresh:focus-visible { outline: 1px solid currentColor; outline-offset: 3px; border-radius: 2px; }
.bettergeo-race-panel [class*="global-leaderboard_leaderboard__"] > table { flex: none; }
.bettergeo-race-results { flex: 1 1 0; min-height: 0; max-height: none; overflow: auto; }
.bettergeo-race-filters button[aria-pressed="true"] { color: inherit; }
.bettergeo-race-filters { display: flex; align-items: center; justify-content: space-between; gap: .75rem; flex-wrap: wrap; }
.bettergeo-race-sort-header { border: 0; padding: 0; background: none; color: inherit; font: inherit; text-transform: inherit; cursor: pointer; white-space: nowrap; }
.bettergeo-race-sort-header:focus-visible { outline: 1px solid currentColor; outline-offset: 3px; }
.bettergeo-race-table th[aria-sort] { color: #fff; }
.bettergeo-race-table th[aria-sort] .bettergeo-race-sort-header::after { margin-left: 3px; font-size: 9px; }
.bettergeo-race-table th[aria-sort="ascending"] .bettergeo-race-sort-header::after { content: '▲'; }
.bettergeo-race-table th[aria-sort="descending"] .bettergeo-race-sort-header::after { content: '▼'; }
.bettergeo-race-board { min-width: 0; overflow-x: auto; }
.bettergeo-race-table { table-layout: fixed; width: 100%; min-width: 660px; }
.bettergeo-race-results { min-width: 660px; }
.bettergeo-race-points { text-align: right; font-variant-numeric: tabular-nums; }

`;

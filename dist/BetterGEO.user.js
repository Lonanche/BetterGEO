// ==UserScript==
// @name         BetterGEO
// @namespace    BetterGEO
// @version      0.2.0
// @description  Toggleable GeoGuessr improvements: ELO Race leaderboard and badges, old duel summaries, map result links, hidden recent duels, profile restrictions, country ranked stats, random maps, and tournaments.
// @author       trausi
// @homepageURL  https://github.com/lonanche/BetterGEO
// @supportURL   https://github.com/lonanche/BetterGEO/issues
// @source       https://github.com/lonanche/BetterGEO
// @updateURL    https://raw.githubusercontent.com/lonanche/BetterGEO/main/dist/BetterGEO.user.js
// @downloadURL  https://raw.githubusercontent.com/lonanche/BetterGEO/main/dist/BetterGEO.user.js
// @match        https://www.geoguessr.com/*
// @match        https://geoguessr.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      game-server.geoguessr.com
// @noframes
// ==/UserScript==
"use strict";
(() => {
  // src/core/network.ts
  var Network = class {
    constructor(page2) {
      this.page = page2;
      const network2 = this, originalFetch = page2.fetch;
      const wrapped = async function(input, init) {
        const url = network2.url(input);
        if (url)
          for (const intercept of network2.interceptors) {
            try {
              const response2 = intercept(url);
              if (response2) return response2;
            } catch (error) {
              console.error("[BetterGEO interceptor]", error);
            }
          }
        const response = await originalFetch.call(page2, input, init);
        if (url && response.ok && network2.interested(url)) {
          try {
            void response.clone().json().then((data) => network2.emit(url, data)).catch(() => {
            });
          } catch {
          }
        }
        return response;
      };
      page2.fetch = wrapped;
      const proto = page2.XMLHttpRequest.prototype, originalOpen = proto.open;
      const urls = /* @__PURE__ */ new WeakMap();
      const observed = /* @__PURE__ */ new WeakSet();
      const open = function(method, url, ...rest) {
        const result = Reflect.apply(originalOpen, this, [method, url, ...rest]);
        const parsed = network2.url(url);
        if (parsed) urls.set(this, parsed);
        else urls.delete(this);
        if (!observed.has(this)) {
          observed.add(this);
          this.addEventListener("load", () => {
            const current = urls.get(this);
            if (!current || this.status < 200 || this.status >= 300 || !network2.interested(current))
              return;
            try {
              network2.emit(
                current,
                this.responseType === "json" ? this.response : JSON.parse(this.responseText)
              );
            } catch {
            }
          });
        }
        return result;
      };
      proto.open = open;
      this.restore = () => {
        if (page2.fetch === wrapped) page2.fetch = originalFetch;
        if (proto.open === open) proto.open = originalOpen;
      };
    }
    observers = /* @__PURE__ */ new Set();
    interceptors = /* @__PURE__ */ new Set();
    restore;
    url(input) {
      try {
        return new URL(
          input && typeof input === "object" && "url" in input ? input.url : String(input),
          this.page.location.href
        );
      } catch {
        return void 0;
      }
    }
    matches(observer, url) {
      try {
        return observer.matches(url);
      } catch (error) {
        console.error("[BetterGEO observer]", error);
        return false;
      }
    }
    interested(url) {
      return [...this.observers].some((observer) => this.matches(observer, url));
    }
    emit(url, data) {
      for (const observer of this.observers) {
        try {
          if (this.matches(observer, url)) observer.accept(url, data);
        } catch (error) {
          console.error("[BetterGEO response]", error);
        }
      }
    }
    observe(matches, accept) {
      const observer = { matches, accept };
      this.observers.add(observer);
      return () => {
        this.observers.delete(observer);
      };
    }
    intercept(callback) {
      this.interceptors.add(callback);
      return () => {
        this.interceptors.delete(callback);
      };
    }
    dispose() {
      this.observers.clear();
      this.interceptors.clear();
      this.restore();
    }
  };

  // src/core/page.ts
  var PageEvents = class {
    constructor(page2) {
      this.page = page2;
      const notify = this.schedule;
      this.originalPush = page2.history.pushState;
      this.originalReplace = page2.history.replaceState;
      const push = this.originalPush, replace = this.originalReplace;
      this.push = function(...args) {
        const result = push.apply(this, args);
        notify();
        return result;
      };
      this.replace = function(...args) {
        const result = replace.apply(this, args);
        notify();
        return result;
      };
      page2.history.pushState = this.push;
      page2.history.replaceState = this.replace;
      page2.addEventListener("popstate", notify);
      page2.addEventListener("resize", notify);
      document.addEventListener("load", this.stylesLoaded, true);
      this.observer = new MutationObserver(notify);
      this.observer.observe(document, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "aria-expanded"]
      });
    }
    listeners = /* @__PURE__ */ new Set();
    observer;
    timer;
    disposed = false;
    originalPush;
    originalReplace;
    push;
    replace;
    stylesLoaded = (event) => {
      const tag = event.target?.tagName;
      if (tag === "LINK" || tag === "STYLE") this.schedule();
    };
    subscribe(callback) {
      this.listeners.add(callback);
      this.schedule();
      return () => {
        this.listeners.delete(callback);
      };
    }
    schedule = () => {
      if (this.disposed || this.timer !== void 0) return;
      this.timer = setTimeout(() => {
        this.timer = void 0;
        for (const callback of this.listeners) {
          try {
            void Promise.resolve(callback()).catch(
              (error) => console.error("[BetterGEO page]", error)
            );
          } catch (error) {
            console.error("[BetterGEO page]", error);
          }
        }
      }, 80);
    };
    dispose() {
      if (this.disposed) return;
      this.disposed = true;
      clearTimeout(this.timer);
      this.timer = void 0;
      this.observer.disconnect();
      this.listeners.clear();
      this.page.removeEventListener("popstate", this.schedule);
      this.page.removeEventListener("resize", this.schedule);
      document.removeEventListener("load", this.stylesLoaded, true);
      if (this.page.history.pushState === this.push) this.page.history.pushState = this.originalPush;
      if (this.page.history.replaceState === this.replace)
        this.page.history.replaceState = this.originalReplace;
    }
  };

  // src/core/scope.ts
  var Scope = class {
    controller = new AbortController();
    cleanups = /* @__PURE__ */ new Set();
    get signal() {
      return this.controller.signal;
    }
    get active() {
      return !this.signal.aborted;
    }
    own(cleanup) {
      const release = () => {
        if (this.cleanups.delete(release)) cleanup();
      };
      if (this.active) this.cleanups.add(release);
      else cleanup();
      return release;
    }
    listen(target, event, callback) {
      target.addEventListener(event, callback);
      this.own(() => target.removeEventListener(event, callback));
    }
    dispose() {
      if (!this.active) return;
      this.controller.abort();
      for (const cleanup of [...this.cleanups].reverse()) {
        try {
          cleanup();
        } catch (error) {
          console.error("[BetterGEO cleanup]", error);
        }
      }
      this.cleanups.clear();
    }
  };

  // src/core/settings.ts
  var FeatureManager = class {
    constructor(features, services) {
      this.features = features;
      this.services = services;
      const stored = GM_getValue("bettergeo.features.v1", {});
      this.settings = {};
      for (const feature of features) {
        const value = stored && typeof stored === "object" ? stored[feature.id] : void 0;
        this.settings[feature.id] = typeof value === "boolean" ? value : true;
      }
    }
    running = /* @__PURE__ */ new Map();
    settings;
    enabled(id) {
      return this.settings[id] === true;
    }
    start() {
      for (const feature of this.features)
        if (this.enabled(feature.id)) {
          try {
            this.activate(feature);
          } catch (error) {
            this.settings[feature.id] = false;
            console.error(`[BetterGEO ${feature.id}]`, error);
          }
        }
    }
    activate(feature) {
      if (this.running.has(feature.id)) return;
      const scope = new Scope();
      try {
        feature.enable(this.services, scope);
        this.running.set(feature.id, scope);
      } catch (error) {
        scope.dispose();
        throw error;
      }
    }
    set(id, enabled) {
      const feature = this.features.find((feature2) => feature2.id === id);
      if (!feature) throw new Error(`Unknown feature: ${id}`);
      const wasRunning = this.running.has(id);
      if (enabled) this.activate(feature);
      const next = { ...this.settings, [id]: enabled };
      try {
        GM_setValue("bettergeo.features.v1", next);
      } catch (error) {
        if (enabled && !wasRunning) {
          this.running.get(id)?.dispose();
          this.running.delete(id);
        }
        throw error;
      }
      this.settings = next;
      if (!enabled) {
        this.running.get(id)?.dispose();
        this.running.delete(id);
      }
    }
    dispose() {
      for (const scope of this.running.values()) scope.dispose();
      this.running.clear();
    }
  };

  // src/core/dom.ts
  function element(tag, className = "", text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function link(text, href, className = "") {
    const node = element("a", className, text);
    node.href = href;
    return node;
  }

  // src/core/menu.ts
  function openSettings(manager2) {
    if (!document.body) {
      document.addEventListener("DOMContentLoaded", () => openSettings(manager2), { once: true });
      return;
    }
    const existing = document.getElementById("bettergeo-settings-host")?.shadowRoot?.querySelector("dialog");
    if (existing) {
      existing.querySelector("h2")?.focus();
      return;
    }
    const host = element("div");
    host.id = "bettergeo-settings-host";
    const shadow = host.attachShadow({ mode: "open" });
    const style = element("style");
    style.textContent = `
:host { color-scheme: dark; }
*, *::before, *::after { box-sizing: border-box; }
dialog {
  width: min(480px, calc(100vw - 32px));
  max-height: calc(100dvh - 48px);
  padding: 0;
  border: 1px solid #ffffff12;
  border-radius: 20px;
  background: #18181d;
  color: #f1f1f4;
  font: 14px/1.5 system-ui, sans-serif;
  box-shadow: 0 24px 80px #0006;
  overflow: auto;
}
dialog::backdrop { background: #09090db3; backdrop-filter: blur(6px); }
.panel { display: flex; flex-direction: column; }
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 24px 20px;
}
h2 { outline: none; margin: 0; font-size: 22px; font-weight: 650; letter-spacing: -.7px; }
.subtitle { margin: 2px 0 0; color: #94949f; font-size: 12px; }
.features { padding: 0 12px; }
label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background .15s;
}
label:hover { background: #ffffff04; }
label + label { border-top: 1px solid #ffffff08; }
.copy { min-width: 0; }
strong { display: block; font-size: 13px; font-weight: 550; }
small { display: block; margin-top: 4px; color: #94949f; font-size: 12px; line-height: 1.5; }
input {
  appearance: none;
  flex: 0 0 34px;
  width: 34px;
  height: 20px;
  margin: 0;
  border: 1px solid #ffffff12;
  border-radius: 20px;
  background: #393940;
  cursor: pointer;
  transition: background .15s;
}
input::before {
  content: '';
  display: block;
  width: 14px;
  height: 14px;
  margin: 2px;
  border-radius: 50%;
  background: #e7e7ec;
  transition: transform .15s;
}
input:checked { background: #a491f2; border-color: transparent; }
input:checked::before { transform: translateX(14px); background: #fff; }
button {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #94949f;
  cursor: pointer;
}
button svg { width: 16px; height: 16px; pointer-events: none; }
button:hover { background: #ffffff09; color: #fff; }
input:focus-visible, button:focus-visible { outline: 2px solid #b5a3ff; outline-offset: 4px; }
footer { padding: 16px 24px 20px; color: #787884; font-size: 11px; }
@media (prefers-reduced-motion: reduce) { label, input, input::before { transition: none; } }
`;
    const dialog = element("dialog");
    dialog.id = "bettergeo-settings";
    dialog.setAttribute("aria-label", "BetterGEO settings");
    const panel = element("div", "panel");
    const header = element("header");
    const heading = element("div");
    const title = element("h2", "", "BetterGEO");
    title.tabIndex = -1;
    heading.append(title, element("p", "subtitle", "Settings"));
    header.append(heading);
    const close = element("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "1.75");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("aria-hidden", "true");
    const path2 = document.createElementNS(icon.namespaceURI, "path");
    path2.setAttribute("d", "M6 6l12 12M18 6L6 18");
    icon.append(path2);
    close.append(icon);
    close.setAttribute("aria-label", "Close settings");
    close.type = "button";
    close.addEventListener("click", () => dialog.close());
    header.append(close);
    panel.append(header);
    const features = element("div", "features");
    for (const feature of manager2.features) {
      const label = element("label"), toggle = element("input");
      toggle.type = "checkbox";
      toggle.checked = manager2.enabled(feature.id);
      toggle.setAttribute("role", "switch");
      const text = element("span", "copy");
      text.append(element("strong", "", feature.name), element("small", "", feature.description));
      toggle.addEventListener("change", () => {
        try {
          manager2.set(feature.id, toggle.checked);
        } catch (error) {
          toggle.checked = manager2.enabled(feature.id);
          console.error("[BetterGEO settings]", error);
        }
      });
      label.append(text, toggle);
      features.append(label);
    }
    panel.append(features, element("footer", "", "Changes save automatically."));
    dialog.append(panel);
    dialog.addEventListener("close", () => host.remove(), { once: true });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    shadow.append(style, dialog);
    document.body.append(host);
    dialog.showModal();
    title.focus({ preventScroll: true });
  }

  // src/geoguessr/responses.ts
  var record = (value) => !!value && typeof value === "object" && !Array.isArray(value);
  var optionalString = (value) => value == null || typeof value === "string";
  var optionalNumber = (value) => value == null || typeof value === "number" && Number.isFinite(value);
  function historyRound(value) {
    return record(value) && optionalString(value.startTime) && optionalString(value.endTime);
  }
  function historyTeam(value) {
    return record(value) && Array.isArray(value.players) && value.players.every(
      (player) => record(player) && typeof player.playerId === "string" && optionalNumber(player.rankedSystemRating) && optionalNumber(player.tier)
    );
  }
  function round(value) {
    return record(value) && typeof value.roundNumber === "number" && Number.isFinite(value.roundNumber) && optionalNumber(value.lat) && optionalNumber(value.lng) && optionalNumber(value.multiplier) && optionalNumber(value.damageMultiplier) && optionalString(value.startTime) && optionalString(value.endTime) && (value.panorama == null || record(value.panorama) && optionalNumber(value.panorama.lat) && optionalNumber(value.panorama.lng));
  }
  function team(value) {
    return record(value) && Array.isArray(value.players) && value.players.every(
      (player) => record(player) && typeof player.playerId === "string" && optionalNumber(player.rankedSystemRating) && optionalNumber(player.tier) && (player.guesses == null || Array.isArray(player.guesses))
    ) && (value.roundResults == null || Array.isArray(value.roundResults) && value.roundResults.every(
      (result) => record(result) && typeof result.roundNumber === "number"
    ));
  }
  function historyResponse(data) {
    if (!record(data) || !Array.isArray(data.entries))
      throw new Error("Unexpected game history response.");
    const entries = data.entries.filter(
      (entry) => record(entry) && typeof entry.gameId === "string" && entry.gameId.length && Array.isArray(entry.players) && entry.players.every(
        (player) => record(player) && typeof player.id === "string" && optionalString(player.nick) && optionalString(player.countryCode) && optionalNumber(player.rating) && optionalNumber(player.tier) && (player.pin == null || record(player.pin) && optionalString(player.pin.url))
      ) && (entry.duel == null || record(entry.duel) && optionalString(entry.duel.gameMode) && optionalString(entry.duel.winnerId) && (entry.duel.teams == null || Array.isArray(entry.duel.teams) && entry.duel.teams.every(historyTeam)) && (entry.duel.rounds == null || Array.isArray(entry.duel.rounds) && entry.duel.rounds.every(historyRound)))
    );
    return { entries };
  }
  function finishedDuelResponse(data, id) {
    if (!record(data) || data.gameId !== id || data.status !== "Finished" || !Array.isArray(data.rounds) || !data.rounds.every(round) || !Array.isArray(data.teams) || !data.teams.every(team) || data.options != null && !record(data.options))
      throw new Error("Finished duel data unavailable.");
    return data;
  }

  // src/geoguessr/countries.ts
  function countryCodes(value) {
    if (value === void 0 || value === null) return [];
    if (!Array.isArray(value)) throw new Error("Unexpected country statistics.");
    return [
      ...new Set(
        value.filter((code) => typeof code === "string" && /^[a-z]{2}$/i.test(code)).map((code) => code.toLowerCase())
      )
    ];
  }
  var regionNames;
  var regionLocale;
  function countryName(code) {
    try {
      const locale = document.documentElement.lang || navigator.language || "en";
      if (locale !== regionLocale) {
        regionNames = new Intl.DisplayNames([locale], { type: "region" });
        regionLocale = locale;
      }
      return regionNames?.of(code.toUpperCase()) ?? code.toUpperCase();
    } catch {
      return code.toUpperCase();
    }
  }

  // src/geoguessr/scores.ts
  var endpoint = /^\/api\/v3\/scores\/([^/]+)\/me\/games\/?$/;
  var ScoreIndex = class {
    maps = /* @__PURE__ */ new Map();
    matches(path2) {
      return endpoint.test(path2);
    }
    key(timestamp, points) {
      return `${Math.floor(timestamp / 1e3)}:${points}`;
    }
    accept(path2, data) {
      const map = path2.match(endpoint)?.[1];
      if (!map || !data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items))
        return;
      let games = this.maps.get(map);
      if (!games) {
        games = /* @__PURE__ */ new Map();
        this.maps.set(map, games);
        if (this.maps.size > 32) this.maps.delete(this.maps.keys().next().value);
      }
      for (const item of data.items) {
        if (!item || typeof item !== "object") continue;
        const game = item;
        const timestamp = typeof game.playedAt === "string" ? Date.parse(game.playedAt) : NaN;
        if (typeof game.gameToken !== "string" || !game.gameToken.length || !Number.isFinite(timestamp) || typeof game.points !== "number" || !Number.isFinite(game.points))
          continue;
        const key = this.key(timestamp, game.points);
        if (!games.has(key)) games.set(key, /* @__PURE__ */ new Set());
        games.get(key).add(game.gameToken);
      }
    }
    lookup(map, timestamp, points) {
      return this.maps.get(map)?.get(this.key(timestamp, points));
    }
  };

  // src/geoguessr/online-race.ts
  function onlineRacePlayers(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const data = JSON.parse(doc.querySelector("#__NEXT_DATA__")?.textContent ?? "null");
    const race = data?.props?.pageProps?.race;
    if (!race || typeof race !== "object" || Array.isArray(race))
      throw new Error("Online race standings unavailable.");
    const players = /* @__PURE__ */ new Map();
    for (const [region, value] of Object.entries(race)) {
      if (!value || typeof value !== "object" || !("players" in value) || !Array.isArray(value.players))
        throw new Error("Unexpected online race standings.");
      for (const player of value.players) {
        if (!player || typeof player.id !== "string" || !/^[a-f0-9]{24}$/i.test(player.id))
          throw new Error("Unexpected online race player.");
        players.set(player.id, {
          region: region === "Apac" ? "APAC" : region === "Emea" ? "EMEA" : region,
          name: typeof value.name === "string" ? value.name : "World League online race",
          nick: typeof player.nick === "string" ? player.nick : typeof player.alias === "string" ? player.alias : player.id,
          avatar: typeof player.avatar === "string" && /^pin\/[\w.-]+$/.test(player.avatar) ? player.avatar : void 0,
          countryCode: typeof player.countryCode === "string" && /^[a-z]{2}$/i.test(player.countryCode) ? player.countryCode.toLowerCase() : void 0,
          position: Number.isInteger(player.position) && player.position > 0 ? player.position : void 0,
          total: typeof player.total === "number" && Number.isFinite(player.total) ? player.total : void 0,
          points: Array.isArray(player.points) ? player.points.filter(
            (point) => typeof point === "number" && Number.isFinite(point)
          ) : []
        });
      }
    }
    return players;
  }

  // src/geoguessr/race-ratings.ts
  var raceRatingsPageSize = 100;
  var raceRatingsMaxPages = 20;
  async function collectRaceRatings(players, page2, signal, progress = () => {
  }) {
    const ratings = /* @__PURE__ */ new Map();
    const seen = /* @__PURE__ */ new Set();
    let scanned = 0;
    for (let index = 0; index < raceRatingsMaxPages && ratings.size < players.size; index++) {
      signal.throwIfAborted();
      const data = await page2(index * raceRatingsPageSize, raceRatingsPageSize);
      signal.throwIfAborted();
      if (!Array.isArray(data)) throw new Error("Unexpected global leaderboard response.");
      const before = seen.size;
      for (const row of data) {
        if (!row || typeof row.userId !== "string" || typeof row.rating !== "number" || !Number.isFinite(row.rating))
          throw new Error("Unexpected global leaderboard player.");
        seen.add(row.userId);
        if (players.has(row.userId)) ratings.set(row.userId, row.rating);
      }
      scanned += data.length;
      progress(ratings.size, scanned);
      if (data.length < raceRatingsPageSize || seen.size === before) break;
    }
    return { ratings, scanned };
  }

  // src/geoguessr/api.ts
  var RequestCache = class {
    entries = /* @__PURE__ */ new Map();
    get(key, load, ttl = 3e4) {
      const existing = this.entries.get(key);
      if (existing && existing.expires > Date.now()) return existing.promise;
      const entry = { promise: Promise.resolve().then(load), expires: Infinity };
      this.entries.set(key, entry);
      entry.promise.then(
        () => {
          entry.expires = Date.now() + ttl;
          if (this.entries.size > 100)
            for (const [key2, cached] of this.entries) {
              if (cached.expires !== Infinity) this.entries.delete(key2);
              if (this.entries.size <= 100) break;
            }
        },
        () => {
          if (this.entries.get(key) === entry) this.entries.delete(key);
        }
      );
      return entry.promise;
    }
  };
  var GeoGuessrApi = class {
    constructor(page2) {
      this.page = page2;
    }
    scores = new ScoreIndex();
    cache = new RequestCache();
    async onlineRacePlayers(signal) {
      const response = await this.page.fetch("/world-championship", {
        credentials: "same-origin",
        cache: "no-store",
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(2e4)]) : AbortSignal.timeout(2e4)
      });
      if (!response.ok) throw new Error(`Online race: HTTP ${response.status}`);
      return onlineRacePlayers(await response.text());
    }
    onlineRaceRatings(players, signal, progress) {
      return collectRaceRatings(
        players,
        (offset, limit) => this.json(
          `/api/v4/ranked-system/ratings?offset=${offset}&limit=${limit}`,
          "Global leaderboard",
          { signal: AbortSignal.any([signal, AbortSignal.timeout(2e4)]), cache: "no-store" }
        ),
        signal,
        progress
      );
    }
    async json(path2, label, options = {}) {
      const response = await this.page.fetch(path2, {
        credentials: "same-origin",
        signal: AbortSignal.timeout(2e4),
        ...options
      });
      if (!response.ok) throw new Error(`${label}: HTTP ${response.status}`);
      return response.json();
    }
    async randomMapUrl() {
      const data = await this.json("/api/v3/social/maps/browse/random", "Random map API", {
        cache: "no-store"
      });
      if (!data || typeof data !== "object" || !("url" in data) || typeof data.url !== "string")
        throw new Error("Random map URL unavailable.");
      const url = new URL(data.url.trim(), this.page.location.origin);
      if (url.origin !== this.page.location.origin || !/^\/maps\/[^/]+\/?$/.test(url.pathname) || url.username || url.password)
        throw new Error("Unexpected random map URL.");
      return url.href;
    }
    userStatus(userId) {
      return this.cache.get(`user-status:${userId}`, async () => {
        const data = await this.json(`/api/v3/users/${encodeURIComponent(userId)}`, "Profile API");
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Unexpected profile response.");
        const user = data;
        if (user.isBanned !== void 0 && typeof user.isBanned !== "boolean" || user.suspendedUntil !== void 0 && user.suspendedUntil !== null && typeof user.suspendedUntil !== "string")
          throw new Error("Unexpected moderation status.");
        return {
          isBanned: user.isBanned,
          suspendedUntil: user.suspendedUntil
        };
      });
    }
    rankedCountries(userId) {
      return this.cache.get(`ranked-countries:${userId}`, async () => {
        const data = await this.json(
          `/api/v4/ranked-system/progress/${encodeURIComponent(userId)}`,
          "Ranked progress API"
        );
        if (!data || typeof data !== "object" || Array.isArray(data))
          throw new Error("Unexpected ranked progress response.");
        const progress = data;
        return {
          bestCountries: countryCodes(progress.bestCountries),
          worstCountries: countryCodes(progress.worstCountries)
        };
      });
    }
    history(userId) {
      return this.cache.get(`history:${userId}`, async () => {
        const data = await this.json(
          `/api/v4/game-history/${encodeURIComponent(userId)}?gameMode=None`,
          "History API"
        );
        return historyResponse(data);
      });
    }
    finishedDuel(id) {
      return this.cache.get(
        `duel:${id}`,
        () => new Promise((resolve, reject) => {
          GM_xmlhttpRequest({
            method: "GET",
            url: `https://game-server.geoguessr.com/api/duels/${encodeURIComponent(id)}`,
            timeout: 2e4,
            onload(response) {
              try {
                if (response.status !== 200) throw new Error(`Duel API: HTTP ${response.status}`);
                resolve(finishedDuelResponse(JSON.parse(response.responseText), id));
              } catch (error) {
                reject(error);
              }
            },
            onerror: () => reject(new Error("Duel API request failed.")),
            ontimeout: () => reject(new Error("Duel API request timed out.")),
            onabort: () => reject(new Error("Duel API request aborted."))
          });
        })
      );
    }
  };

  // src/geoguessr/routes.ts
  var duelRoute = /^\/(?:[a-z]{2}\/)?((?:team-)?duels)\/([a-f0-9]{24}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})(?:\/summary)?\/?$/i;
  function duelId(path2 = location.pathname) {
    return path2.match(duelRoute)?.[2];
  }
  function profileId(path2 = location.pathname) {
    return path2.match(/^\/(?:[a-z]{2}\/)?user\/([^/]+)\/?$/)?.[1];
  }
  function mapId(path2 = location.pathname) {
    return path2.match(/^\/(?:[a-z]{2}\/)?maps\/([^/]+)/)?.[1];
  }
  var resultPath = (token) => `/results/${encodeURIComponent(token)}`;
  var duelPath = (id, view) => `/duels/${encodeURIComponent(id)}/${view}`;
  function viewedProfileId(path2 = location.pathname) {
    const direct = profileId(path2);
    if (direct) return direct;
    if (!/^\/(?:[a-z]{2}\/)?me\/profile\/?$/.test(path2)) return void 0;
    const value = document.querySelector('[name="copy-link"]')?.value;
    if (!value) return void 0;
    try {
      const url = new URL(value, location.origin);
      if (url.origin !== location.origin) return void 0;
      return profileId(url.pathname);
    } catch {
      return void 0;
    }
  }

  // src/geoguessr/summary.ts
  function summaryShape(game) {
    const options = game.options || {};
    const rounds = game.rounds.filter(
      (round2) => round2.startTime || round2.endTime || game.teams.some(
        (team2) => team2.roundResults?.some((result) => result.roundNumber === round2.roundNumber)
      )
    );
    return {
      gameId: game.gameId,
      context: game.context ?? null,
      finishedAt: Date.parse(rounds.at(-1)?.endTime ?? "") || void 0,
      options: {
        competitiveGameMode: options.competitiveGameMode,
        countAllGuesses: !!options.countAllGuesses,
        isRated: !!options.isRated,
        isTeamDuels: !!options.isTeamDuels,
        mapName: options.map?.name || "Recovered duel",
        mapSlug: options.mapSlug || options.map?.slug,
        mode: options.movementOptions?.forbidRotating ? "NoMoveNoZoom" : options.movementOptions?.forbidMoving ? "NoMove" : "Moving",
        roundWinMultiplierIncrement: options.roundWinMultiplierIncrement || 0
      },
      teams: game.teams.map((team2) => ({
        id: team2.id,
        name: team2.name,
        players: team2.players.map((player) => ({
          playerId: player.playerId,
          guesses: player.guesses || []
        })),
        roundResults: team2.roundResults || []
      })),
      rounds: rounds.map((round2) => ({
        roundNumber: round2.roundNumber,
        isHealingRound: !!round2.isHealingRound,
        multiplier: round2.multiplier ?? round2.damageMultiplier ?? 1,
        lat: round2.panorama?.lat ?? round2.lat,
        lng: round2.panorama?.lng ?? round2.lng,
        panorama: { lat: round2.panorama?.lat ?? round2.lat, lng: round2.panorama?.lng ?? round2.lng }
      }))
    };
  }
  function nativeProps(initial, current, game) {
    const shared = { ...initial.props, ...current };
    return {
      ...shared,
      __N_SSP: true,
      pageProps: {
        ...initial.props?.pageProps,
        ...current?.pageProps,
        statusCode: 200,
        game: summaryShape(game),
        userId: shared.accountProps?.account?.user?.userId ?? current?.pageProps?.userId ?? initial.props?.pageProps?.userId
      }
    };
  }

  // src/features/summary-recovery.ts
  var errorSelector = '[class*="error_errorPage__"]';
  var summaryRecovery = {
    id: "summary-recovery",
    name: "Recover old duel summaries",
    description: "Fix old duel summaries that show \u201CGame not found\u201D.",
    enable({ page: page2, api: api2, events: events2, network: network2 }, scope) {
      let previousId, attempted = false, busy = false, visit = 0;
      function syncVisit() {
        const id = duelId();
        if (id !== previousId) {
          previousId = id;
          attempted = false;
          visit++;
        }
        return id;
      }
      const valid = (id, version) => scope.active && visit === version && duelId() === id;
      function status(message) {
        const errorPage = document.querySelector(errorSelector);
        if (!errorPage) return;
        let line = errorPage.querySelector("[data-summary-recovery]");
        if (!line) {
          line = document.createElement("p");
          line.dataset.summaryRecovery = "";
          line.className = errorPage.querySelector("p")?.className || "";
          line.setAttribute("role", "status");
          line.style.marginTop = "12px";
          errorPage.append(line);
        }
        if (line.textContent !== message) line.textContent = message;
      }
      async function repair(game, initial, router, version) {
        const payload = nativeProps(initial, router.components?.[router.route]?.props, game);
        const summaryPath = location.pathname.match(/\/(?:team-)?duels\//)[0] + game.gameId + "/summary.json";
        const originalUrl = location.pathname + location.search + location.hash;
        const target = new URL(location.href);
        target.pathname = target.pathname.replace(/\/?$/, "").replace(/(?:\/summary)?$/, "/summary");
        target.searchParams.set("gg_summary_recovery", String(Date.now()));
        let intercepted = false;
        const remove = scope.own(
          network2.intercept((url) => {
            if (valid(game.gameId, version) && url.origin === location.origin && url.pathname.includes("/_next/data/") && url.pathname.endsWith(summaryPath)) {
              intercepted = true;
              return new page2.Response(JSON.stringify(payload), {
                status: 200,
                headers: { "content-type": "application/json" }
              });
            }
            return void 0;
          })
        );
        let timer;
        let abort;
        try {
          const result = await Promise.race([
            router.replace(target.pathname + target.search + target.hash, void 0, {
              shallow: false,
              scroll: false
            }),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error("Native recovery timed out.")), 12e3);
              abort = () => reject(new Error("Recovery disabled."));
              scope.signal.addEventListener("abort", abort, { once: true });
            })
          ]);
          if (!valid(game.gameId, version)) return;
          if (!intercepted || result === false) throw new Error("Native recovery did not complete.");
          await new Promise(
            (resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
          if (valid(game.gameId, version) && document.querySelector(errorSelector))
            throw new Error("The summary is still unavailable.");
        } finally {
          clearTimeout(timer);
          if (abort) scope.signal.removeEventListener("abort", abort);
          remove();
          if (visit === version && duelId() === game.gameId && location.pathname + location.search + location.hash === target.pathname + target.search + target.hash)
            page2.history.replaceState(page2.history.state, "", originalUrl);
        }
      }
      async function check() {
        const id = syncVisit(), version = visit, router = page2.next?.router;
        if (!id || busy || attempted || !router?.isReady || !document.querySelector(errorSelector))
          return;
        try {
          const initial = JSON.parse(
            document.getElementById("__NEXT_DATA__")?.textContent || "{}"
          );
          const current = router.components?.[router.route]?.props?.pageProps;
          const broken = current?.statusCode === 404 || initial.query?.token === id && initial.props?.pageProps?.statusCode === 404 || /Game not found|This game couldn't be found/i.test(document.body?.textContent || "");
          if (!broken) return;
          attempted = true;
          busy = true;
          status("Trying to display this summary\u2026");
          const game = await api2.finishedDuel(id);
          if (valid(id, version)) await repair(game, initial, router, version);
        } catch (error) {
          if (valid(id, version)) {
            console.error("[BetterGEO summary recovery]", error);
            status(
              "Could not display this summary: " + (error instanceof Error ? error.message : String(error))
            );
          }
        } finally {
          busy = false;
          if (scope.active && visit !== version) events2.schedule();
        }
      }
      scope.own(events2.subscribe(check));
      scope.own(
        () => document.querySelectorAll("[data-summary-recovery]").forEach((el) => el.remove())
      );
    }
  };

  // src/features/game-results.ts
  var gameResults = {
    id: "game-results",
    name: "Map history result links",
    description: "Add links to game results in the My Games score history on each map page.",
    enable({ events: events2, api: api2 }, scope) {
      const games = api2.scores;
      const rowSelector = 'button[class*="map-detail-leaderboard_row__"], button[aria-expanded]';
      function clearResult(container) {
        container.querySelector(":scope > .gg-result-action")?.remove();
        container.classList.remove("gg-result-row");
        container.style.removeProperty("--gg-icon-right");
      }
      function update() {
        const currentMapId = mapId();
        if (!currentMapId) {
          document.querySelectorAll(".gg-result-row").forEach(clearResult);
          return;
        }
        for (const row of document.querySelectorAll(rowSelector)) {
          const container = row.parentElement;
          if (!container) continue;
          const date = row.querySelector('[class*="cellDate__"] [title]') || [...row.querySelectorAll("[title]")].find(
            (el) => Number.isFinite(Date.parse(el.title))
          );
          if (!date) {
            clearResult(container);
            continue;
          }
          const points = row.querySelector('[class*="cellPoints__"]');
          const timestamp = Date.parse(date.title);
          const scoreText = points?.textContent || row.textContent?.match(/([\d,\s]+)\s*pts\b/i)?.[1];
          const digits = scoreText?.replace(/[^0-9]/g, "");
          const score = digits ? Number(digits) : NaN;
          if (!Number.isFinite(timestamp) || !Number.isFinite(score)) {
            clearResult(container);
            continue;
          }
          const oldAction = container.querySelector(":scope > .gg-result-action");
          const oldLink = oldAction?.querySelector("a");
          const tokens = games.lookup(currentMapId, timestamp, score);
          if (tokens?.size !== 1) {
            clearResult(container);
            continue;
          }
          const href = `${location.origin}${resultPath(tokens.values().next().value)}`;
          container.classList.add("gg-result-row");
          const arrow2 = row.querySelector('[class*="expandButton__"]') || row.lastElementChild;
          if (arrow2) {
            const offset = `${Math.max(24, row.getBoundingClientRect().right - arrow2.getBoundingClientRect().left + 8)}px`;
            if (container.style.getPropertyValue("--gg-icon-right") !== offset)
              container.style.setProperty("--gg-icon-right", offset);
          }
          if (oldLink?.href === href) continue;
          oldAction?.remove();
          const link2 = document.createElement("a");
          link2.className = "gg-result-link";
          link2.href = href;
          link2.target = "_blank";
          link2.rel = "noopener noreferrer";
          link2.setAttribute("aria-label", "View game result");
          link2.title = "Open game result in a new tab";
          link2.addEventListener("click", (event) => event.stopPropagation());
          const icon = document.createElement("img");
          icon.alt = "";
          icon.width = 18;
          icon.height = 18;
          icon.addEventListener(
            "error",
            () => {
              const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r="1" fill="white" stroke="none"/></svg>';
              icon.src = "data:image/svg+xml," + encodeURIComponent(svg);
            },
            { once: true }
          );
          icon.src = "/_next/static/media/info.1c18ae42.svg";
          link2.appendChild(icon);
          const action = document.createElement("div");
          action.className = "gg-result-action";
          action.appendChild(link2);
          row.insertAdjacentElement("afterend", action);
        }
      }
      let style;
      scope.own(
        events2.subscribe(() => {
          if (!document.head) return;
          if (!style) {
            style = document.createElement("style");
            style.textContent = CSS;
            document.head.append(style);
          }
          update();
        })
      );
      scope.own(() => {
        style?.remove();
        document.querySelectorAll(".gg-result-row").forEach(clearResult);
        document.querySelectorAll(".gg-result-action").forEach((action) => action.remove());
      });
    }
  };
  var CSS = `
.gg-result-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
}
.gg-result-row > button {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  width: 100%;
}
.gg-result-row > :not(button):not(.gg-result-action) {
  grid-column: 1 / -1;
}
.gg-result-row > .gg-result-action {
  grid-column: 1;
  grid-row: 1;
  align-self: center;
  justify-self: end;
  z-index: 1;
  margin: 0 var(--gg-icon-right, 36px) 0 0;
  padding: 0;
  background: transparent;
}
.gg-result-row > button > :last-child {
  margin-left: 34px !important;
  flex-shrink: 0;
  transition: none !important;
}
.gg-result-row:has(> button:hover) > button,
.gg-result-row:has(> .gg-result-action:hover) > button {
  background: rgba(255, 255, 255, 0.07) !important;
}
/* Low specificity lets the native classes supply their own appearance. */
:where(.gg-result-action) {
  display: flex;
  align-items: center;
}
:where(.gg-result-link) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: white;
  opacity: 0.75;
  text-decoration: none;
}
:where(.gg-result-link:hover) {
  opacity: 1;
  background: #ffffff15;
}
:where(.gg-result-link:focus-visible) {
  outline: 2px solid #a896ff;
  outline-offset: 2px;
}
:where(.gg-result-link img) {
  display: block;
  width: 18px;
  height: 18px;
}
`;

  // src/core/native-styles.ts
  function nativeStyles(hints = {
    widget_header___ZOfT: '[class*="widget_widgetInner__"] > [class*="widget_header__"]',
    widget_header__8mkus: '[class*="widget_title__"] > [class*="widget_header__"]'
  }) {
    const names = /* @__PURE__ */ new Set();
    function scan(rules) {
      for (const rule of rules) {
        if ("selectorText" in rule && typeof rule.selectorText === "string") {
          for (const match of rule.selectorText.matchAll(/\.([a-zA-Z_][\w-]*__[\w-]+)/g))
            names.add(match[1]);
        }
        if ("cssRules" in rule) {
          try {
            scan(rule.cssRules);
          } catch {
          }
        }
      }
    }
    for (const sheet of document.styleSheets) {
      try {
        scan(sheet.cssRules);
      } catch {
      }
    }
    const styledNames = new Set(names);
    for (const el of document.querySelectorAll("[class]"))
      for (const name of el.classList) names.add(name);
    const cache = /* @__PURE__ */ new Map();
    const byPrefix = /* @__PURE__ */ new Map();
    for (const name of names) {
      const prefix = name.slice(0, -5);
      const group = byPrefix.get(prefix) ?? [];
      group.push(name);
      byPrefix.set(prefix, group);
    }
    function resolveOne(name) {
      const cached = cache.get(name);
      if (cached) return cached;
      const prefix = name.slice(0, -5), candidates = byPrefix.get(prefix) ?? [];
      const styled = candidates.filter((candidate) => styledNames.has(candidate));
      const hint = hints[name];
      const contextual = hint ? [...document.querySelector(hint)?.classList ?? []].find(
        (candidate) => candidate.startsWith(prefix) && candidate.length === name.length
      ) : void 0;
      let result = name;
      if (styledNames.has(name)) result = name;
      else if (contextual && (!styled.length || styledNames.has(contextual))) result = contextual;
      else if (styled.length === 1) result = styled[0];
      else if (!names.has(name) && candidates.length === 1) result = candidates[0];
      cache.set(name, result);
      return result;
    }
    const resolve = (...snapshot) => snapshot.map(resolveOne).join(" ");
    return {
      resolve,
      has: (prefix) => [...styledNames].some((name) => name.startsWith(prefix))
    };
  }

  // src/core/profile-widget.ts
  function profileWidget(title, icon) {
    const styles = nativeStyles(), c = styles.resolve;
    const root = element("div", c("profile-v2_widgetRow__n1A_N"));
    const widget = element("div", c("widget_root__KcxU_", "widget_compact__eg_L_"));
    const border = element("div", c("widget_widgetBorder__aJQpv", "widget_hasLoaded__0Izv8"));
    const outer = element("div", c("widget_widgetOuter__SOAB_"));
    const inner = element("div", c("widget_widgetInner__qg276"));
    const heading = element(
      "h2",
      c("headline_heading__Bc8S9", "shared_boldWeight__VXL2d", "headline_italic__im8EF"),
      title
    );
    heading.style.cssText = "--fs:var(--font-size-16);--lh:var(--line-height-16)";
    const header = element("div", c("widget_header___ZOfT", "widget_compact__eg_L_"));
    const titleSlot = element("div", c("widget_title___eiUb"));
    const titleRow = element("div", c("widget_header__8mkus"));
    const content = element("div", c("widget_headerContent__Ljohq"));
    content.append(heading);
    icon.className = c("widget_icon__b0v5w");
    titleRow.append(icon);
    titleRow.append(content);
    titleSlot.append(titleRow);
    header.append(titleSlot);
    const body = element("div");
    inner.append(header, element("div", c("widget_dividerWrapper__tCjRQ")), body);
    outer.append(inner);
    border.append(outer);
    widget.append(border);
    root.append(widget);
    return { root, body, inner, header, content, styles };
  }

  // src/core/profile.ts
  function watchProfile(events2, scope, options) {
    let user, visit = 0, attempted = false, loading = false;
    let data;
    scope.own(() => {
      visit++;
      options.reset();
    });
    scope.own(
      events2.subscribe(async () => {
        const id = viewedProfileId();
        if (id !== user) {
          visit++;
          user = id;
          attempted = false;
          loading = false;
          data = void 0;
          options.reset();
        }
        if (!id || !document.head || loading) return;
        const target = options.target();
        if (!target) return;
        const current = visit;
        const valid = () => scope.active && current === visit && viewedProfileId() === id;
        if (!attempted) {
          attempted = true;
          loading = true;
          try {
            const result = await options.load(id);
            if (valid()) data = result;
          } catch (error) {
            if (valid()) console.error(`[BetterGEO ${options.name}]`, error);
          } finally {
            if (visit === current) loading = false;
          }
        }
        if (!valid() || data === void 0) return;
        const latest = options.target();
        if (latest?.isConnected) options.render(data, id, latest);
      })
    );
  }
  function profileWidgets() {
    return document.querySelector('[class*="profile-v2_staticWidgets__"]') || document.querySelector('[class*="profile-v2_widgetRow__"]')?.parentElement;
  }

  // src/features/country-performance.ts
  var countryPerformance = {
    id: "country-performance",
    name: "Country ranked stats",
    description: "Show a player\u2019s best and worst countries from ranked progress on their profile.",
    enable({ api: api2, events: events2 }, scope) {
      let widget;
      const style = element("style");
      style.textContent = CSS2;
      scope.own(() => style.remove());
      watchProfile(events2, scope, {
        name: "country performance",
        target: profileWidgets,
        load: (id) => api2.rankedCountries(id),
        reset() {
          widget?.remove();
          widget = void 0;
        },
        render(data, _, container) {
          if (widget?.isConnected || !data.bestCountries.length && !data.worstCountries.length)
            return;
          if (!style.isConnected) document.head.append(style);
          widget = countryPerformanceView(data);
          const ranked = [...container.querySelectorAll("h2")].find(
            (heading) => /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? "")
          );
          const rankedRow = ranked?.closest('[class*="profile-v2_widgetRow__"]');
          if (rankedRow && container.contains(rankedRow)) rankedRow.after(widget);
          else container.prepend(widget);
        }
      });
    }
  };
  function countryPerformanceView(data) {
    const rankedHeading = [...document.querySelectorAll("h2")].find(
      (heading) => /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? "")
    );
    const nativeIcon = rankedHeading?.closest('[class*="widget_title__"]')?.querySelector("img");
    const icon = nativeIcon ? nativeIcon.cloneNode(false) : element("img");
    if (!nativeIcon)
      icon.src = "/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-duels.f0444913.webp&w=256&q=75";
    icon.removeAttribute("id");
    icon.alt = "";
    icon.width = 40;
    icon.height = 40;
    icon.loading = "lazy";
    const { root, body, inner, header, content } = profileWidget("Country ranked stats", icon);
    header.classList.add("bettergeo-country-header");
    content.append(element("small", "bettergeo-country-credit", "Ranked Solo \xB7 BetterGEO"));
    root.id = "bettergeo-country-performance";
    root.classList.add("bettergeo-country-performance");
    inner.classList.add("bettergeo-country-inner");
    body.classList.add("bettergeo-country-groups");
    for (const [label, codes] of [
      ["Best countries", data.bestCountries],
      ["Worst countries", data.worstCountries]
    ]) {
      if (!codes.length) continue;
      const group = element("section", "bettergeo-country-group");
      group.setAttribute("aria-label", label);
      group.append(element("h3", "", label));
      const list = element("ul");
      for (const code of codes) {
        const name = countryName(code), chip = element("li", "bettergeo-country-chip");
        chip.title = name;
        const flag = element("img");
        flag.src = `https://flagcdn.com/w40/${code}.png`;
        flag.width = 21;
        flag.height = 15;
        flag.alt = "";
        flag.loading = "lazy";
        flag.addEventListener(
          "error",
          () => {
            flag.hidden = true;
          },
          { once: true }
        );
        chip.append(flag, element("span", "", name));
        list.append(chip);
      }
      group.append(list);
      body.append(group);
    }
    return root;
  }
  var CSS2 = `
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

  // src/core/navigation-menu.ts
  function dropdownLists() {
    const lists = [...document.querySelectorAll('[class*="menu-item_dropdown__"], [role="menu"]')];
    return lists.filter(
      (parent) => !lists.some((child) => child !== parent && parent.contains(child))
    );
  }
  function menuEntry(tag, titleText, descriptionText, icon, template) {
    const c = nativeStyles().resolve;
    const item = element(
      tag,
      template?.className ?? c("link_anchor__TGl1_", "menu-dropdown-item_dropdownItem__k29Nw")
    );
    icon.setAttribute("class", c("menu-dropdown-item_image__r1egm"));
    const title = element("div", c("menu-dropdown-item_title__4U4eM"), titleText);
    const description = element("div", c("menu-dropdown-item_description__uVic7"), descriptionText);
    item.append(icon, title, description);
    return { item, title };
  }
  function insertMenuEntry(container, item) {
    container.insertBefore(
      item,
      container.querySelector(':scope > [class*="menu-dropdown-secondary_container__"]')
    );
  }

  // src/features/tournaments-link.ts
  var path = "/multiplayer/tournaments";
  var tournamentsLink = {
    id: "tournaments-link",
    name: "Tournaments in Multiplayer",
    description: "Add a Tournaments shortcut inside the Multiplayer dropdown.",
    enable({ events: events2 }, scope) {
      const mounts = /* @__PURE__ */ new Map();
      scope.own(() => {
        mounts.forEach((item) => item.remove());
        mounts.clear();
      });
      scope.own(
        events2.subscribe(() => {
          for (const [container, item] of mounts)
            if (!container.isConnected || !item.isConnected) {
              item.remove();
              mounts.delete(container);
            }
          for (const container of dropdownLists()) {
            const links = [...container.querySelectorAll("a[href]")];
            const nativeTournament = links.find(
              (link2) => !link2.hasAttribute("data-bettergeo-tournaments") && new URL(link2.href, location.origin).pathname.replace(/^\/[a-z]{2}\//, "/") === path
            );
            if (nativeTournament) {
              mounts.get(container)?.remove();
              mounts.delete(container);
              continue;
            }
            if (mounts.has(container)) continue;
            const template = links.find((link2) => {
              const route = new URL(link2.href, location.origin).pathname.replace(
                /^\/[a-z]{2}\//,
                "/"
              );
              return route !== path && /^\/(?:multiplayer(?:\/|$)|competitive(?:\/|$)|duels(?:\/|$)|battle-royale(?:\/|$))/.test(
                route
              );
            });
            if (!template) continue;
            const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            icon.setAttribute("viewBox", "0 0 24 24");
            icon.setAttribute("width", "56");
            icon.setAttribute("height", "56");
            icon.setAttribute("fill", "none");
            icon.setAttribute("stroke", "#b5a4ff");
            icon.setAttribute("stroke-width", "1.6");
            icon.setAttribute("stroke-linecap", "round");
            icon.setAttribute("stroke-linejoin", "round");
            icon.setAttribute("aria-hidden", "true");
            const shape = document.createElementNS(icon.namespaceURI, "path");
            shape.setAttribute(
              "d",
              "M8 3h8v5a4 4 0 0 1-8 0V3zM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4M12 12v5m-3 4h6m-7 0v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
            );
            icon.append(shape);
            const { item } = menuEntry(
              "a",
              "Tournaments",
              "Browse multiplayer tournaments",
              icon,
              template
            );
            item.href = path;
            item.dataset.bettergeoTournaments = "";
            insertMenuEntry(container, item);
            mounts.set(container, item);
          }
        })
      );
    }
  };

  // src/features/random-map.ts
  var randomMap = {
    id: "random-map",
    name: "Random map in Singleplayer",
    description: "Add Random Map inside the Singleplayer dropdown.",
    enable({ api: api2, page: page2, events: events2 }, scope) {
      const mounts = /* @__PURE__ */ new Map();
      const pendingTabs = /* @__PURE__ */ new Set();
      let busy = false;
      const style = element("style");
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
      async function choose(event, button, label) {
        if (event.type === "auxclick" && event.button !== 1) return;
        if (event.type === "click" && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (busy || !scope.active) return;
        const startingUrl = page2.location.href;
        button.title = "Open a random community map";
        const newTab = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
        let tab;
        try {
          tab = newTab ? page2.open("about:blank", "_blank") : null;
        } catch {
          button.title = "Could not open a new tab. Try a normal click.";
          return;
        }
        if (newTab && !tab) {
          button.title = "Allow pop-ups to open a random map in a new tab.";
          return;
        }
        if (tab) {
          tab.opener = null;
          pendingTabs.add(tab);
        }
        busy = true;
        button.disabled = true;
        button.setAttribute("aria-busy", "true");
        label.textContent = "Finding map\u2026";
        try {
          const url = await api2.randomMapUrl();
          if (!scope.active) return;
          if (tab) {
            if (!tab.closed) tab.location.replace(url);
            pendingTabs.delete(tab);
          } else if (page2.location.href === startingUrl) page2.location.assign(url);
        } catch (error) {
          if (tab && pendingTabs.delete(tab)) tab.close();
          if (scope.active) {
            console.error("[BetterGEO random map]", error);
            button.title = "Could not load a random map. Click to try again.";
            label.textContent = "Retry random map";
          }
        } finally {
          busy = false;
          if (scope.active) {
            button.disabled = false;
            button.removeAttribute("aria-busy");
            if (label.textContent === "Finding map\u2026") label.textContent = "Random Map";
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
          const maps = [...anchor.querySelectorAll("a[href]")].find(isMapsLink);
          const originalIcon = maps?.querySelector("img");
          const icon = originalIcon ? originalIcon.cloneNode(false) : element("img");
          if (!originalIcon)
            icon.src = "/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fmaps.4f8b2837.webp&w=128&q=75";
          icon.removeAttribute("id");
          icon.alt = "";
          icon.width = 56;
          icon.height = 56;
          icon.loading = "lazy";
          const { item: button, title: label } = menuEntry(
            "button",
            "Random Map",
            "Discover a random community map",
            icon,
            maps
          );
          button.classList.add("bettergeo-random-map-button");
          button.dataset.bettergeoRandomMap = "";
          button.type = "button";
          button.title = "Open a random community map";
          button.addEventListener("click", (event) => {
            void choose(event, button, label);
          });
          button.addEventListener("auxclick", (event) => {
            void choose(event, button, label);
          });
          insertMenuEntry(anchor, button);
          mounts.set(anchor, button);
        }
      }
      scope.own(events2.subscribe(mount));
    }
  };
  function isMapsLink(link2) {
    try {
      return /^\/(?:[a-z]{2}\/)?maps(?:\/community)?\/?$/.test(
        new URL(link2.href, location.origin).pathname
      );
    } catch {
      return false;
    }
  }
  function singleplayerDropdowns() {
    return dropdownLists().filter(
      (popup) => [...popup.querySelectorAll("a[href]")].some(isMapsLink)
    );
  }

  // src/geoguessr/moderation.ts
  function moderationState(user, now = Date.now()) {
    const expiry = typeof user.suspendedUntil === "string" ? Date.parse(user.suspendedUntil) : NaN;
    let suspension = "unknown";
    if (Number.isFinite(expiry)) suspension = expiry > now ? "active" : "past";
    else if (user.suspendedUntil === null) suspension = "none";
    const banned = user.isBanned === true;
    return { banned, suspension, expiry };
  }

  // src/features/profile-status.ts
  var profileStatus = {
    id: "profile-status",
    name: "Profile ban and suspension status",
    description: "Show a red badge beside profile badges for active bans or suspensions. Hover for suspension time remaining.",
    enable({ api: api2, events: events2 }, scope) {
      let badge, row;
      let timer;
      const style = element("style");
      style.textContent = CSS3;
      function removeBadge() {
        badge?.remove();
        badge = void 0;
        row?.classList.remove("bettergeo-badges-row");
        row = void 0;
      }
      scope.own(() => style.remove());
      watchProfile(events2, scope, {
        name: "profile status",
        target: () => document.querySelector('[class*="profile-v2_headerMainContent__"]'),
        load: (id) => api2.userStatus(id),
        reset() {
          clearTimeout(timer);
          removeBadge();
        },
        render(data, _, header) {
          clearTimeout(timer);
          const state = moderationState(data);
          if (!state.banned && state.suspension !== "active") {
            removeBadge();
            return;
          }
          if (!style.isConnected) document.head.append(style);
          if (!badge?.isConnected) {
            removeBadge();
            badge = statusBadge(data);
            if (!badge) return;
            const pro = header.querySelector(
              '[data-qa="pro-tier"], [class*="profile-v2_proBadge__"]'
            );
            const wrapper = pro?.closest('[class*="profile-v2_proBadgeWrapper__"]') ?? header.querySelector('[class*="profile-v2_proBadgeWrapper__"]');
            if (wrapper) {
              row = wrapper;
              row.classList.add("bettergeo-badges-row");
              wrapper.append(badge);
            } else {
              const heading = header.querySelector("h1");
              if (heading) heading.after(badge);
              else header.append(badge);
            }
          }
          refreshTooltip(badge, data);
          if (state.suspension === "active")
            timer = setTimeout(
              () => {
                if (scope.active) events2.schedule();
              },
              Math.min(6e4, Math.max(1, state.expiry - Date.now()))
            );
        }
      });
    }
  };
  function remainingTime(milliseconds) {
    let minutes = Math.max(1, Math.ceil(milliseconds / 6e4));
    const days = Math.floor(minutes / 1440);
    minutes %= 1440;
    const hours = Math.floor(minutes / 60);
    minutes %= 60;
    const parts = [];
    if (days) parts.push(`${days} day${days === 1 ? "" : "s"}`);
    if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts.join(", ");
  }
  function refreshTooltip(badge, user) {
    const state = moderationState(user);
    const parts = state.banned ? ["Account banned."] : [];
    if (state.suspension === "active")
      parts.push(
        `Suspended: ${remainingTime(state.expiry - Date.now())} remaining. Ends ${new Date(state.expiry).toLocaleString()}.`
      );
    const text = parts.join(" ");
    if (badge.title !== text) badge.title = text;
    if (badge.getAttribute("aria-label") !== text) badge.setAttribute("aria-label", text);
  }
  function statusBadge(user) {
    const state = moderationState(user);
    if (!state.banned && state.suspension !== "active") return void 0;
    const badge = element(
      "p",
      `${nativeStyles().resolve("profile-v2_proBadge__Wlpxj")} bettergeo-restriction-badge`
    );
    badge.append(
      element("span", "bettergeo-restriction-label", state.banned ? "Banned" : "Suspended")
    );
    badge.id = "bettergeo-profile-status";
    badge.tabIndex = 0;
    refreshTooltip(badge, user);
    badge.addEventListener("mouseenter", () => refreshTooltip(badge, user));
    badge.addEventListener("focus", () => refreshTooltip(badge, user));
    return badge;
  }
  var CSS3 = `
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

  // src/features/match-history-view.ts
  var modeNames = {
    NmpzDuels: "NMPZ",
    NoMoveDuels: "No move",
    StandardDuels: "Moving"
  };
  var assets = {
    recent: "/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=640&q=75",
    replay: "/_next/static/media/replay.42141ac7.svg",
    summary: "/_next/static/media/location-pin.f96f50a0.svg"
  };
  function historyView(entries, userId, showAll) {
    const icon = image(assets.recent, "", 224, 230);
    icon.alt = "recent duels";
    const { root: widget, body, header, content, styles } = profileWidget("Recent Duels", icon);
    const c = styles.resolve;
    widget.classList.add("bettergeo-history");
    widget.id = "bettergeo-match-history";
    if (!styles.has("game-history-list-item_card__"))
      widget.classList.add("bettergeo-history-fallback");
    content.classList.add("bettergeo-history-title-line");
    content.append(element("small", "bettergeo-history-credit", "(unhidden by BetterGEO)"));
    const right = element("div", c("widget_rightSlot__rRuhJ"));
    const all = nativeButton("View all", styles);
    all.addEventListener("click", showAll);
    right.append(all);
    header.append(right);
    body.replaceWith(carousel(entries.slice(0, 5), userId, styles));
    return widget;
  }
  function nativeButton(text, styles = nativeStyles()) {
    const c = styles.resolve;
    const button = element(
      "button",
      c("button_button__HOmVR", "button_variantTertiary__WLCY9", "button_sizeSmall__1lL87")
    );
    button.type = "button";
    const wrapper = element("div", c("button_wrapper__C_4h8"));
    wrapper.append(element("span", c("button_label__mIsIc"), text));
    button.append(wrapper);
    return button;
  }
  function carousel(entries, userId, styles) {
    const c = styles.resolve;
    const widgetCarousel = element("div", c("widget_widgetCarousel__IAEDC"));
    const root = element("div", c("game-history-modal_carouselRoot__xADZm"));
    const container = element("div", c("carousel_carouselContainer__E1d_M"));
    const wrapper = element("div", c("carousel_carouselWrapper__OeuWZ"));
    const inner = element("div", c("carousel_carouselInner__n0vjp"));
    const spread = element("div", c("carousel_spread__YVvsz"));
    const item = element("div", c("game-history-modal_carouselItem__gZWWQ"));
    item.style.cssText = "width:min(100%,640px);max-width:100%;flex:0 0 auto;margin-inline:auto";
    spread.style.cssText = "width:100%;display:flex;justify-content:center";
    spread.append(item);
    inner.append(spread);
    wrapper.append(inner);
    const indicators = element("div", c("carousel_indicatorWrapper__MlquS"));
    let index = 0;
    const left = arrow("Previous duel", "left", styles), right = arrow("Next duel", "right", styles);
    const dots = entries.map((entry, position) => {
      const won = entry.duel?.winnerId === userId;
      const dot = element(
        "button",
        c("carousel_indicator__FO2KP", won ? "carousel_green__8yLi7" : "carousel_red__vZJ2m")
      );
      dot.type = "button";
      dot.setAttribute("aria-label", `Show duel ${position + 1}`);
      dot.style.cssText = "padding:0;border:0;cursor:pointer";
      dot.addEventListener("click", () => {
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
      left.style.visibility = left.disabled ? "hidden" : "";
      right.style.visibility = right.disabled ? "hidden" : "";
      dots.forEach((dot, i) => {
        dot.classList.toggle(c("carousel_active__Epbsk"), i === index);
        dot.setAttribute("aria-current", i === index ? "true" : "false");
      });
      item.setAttribute("aria-label", `Duel ${index + 1} of ${entries.length}`);
    }
    left.addEventListener("click", () => {
      if (index > 0) {
        index--;
        render();
      }
    });
    right.addEventListener("click", () => {
      if (index < entries.length - 1) {
        index++;
        render();
      }
    });
    container.append(left, wrapper, right, indicators);
    root.append(container);
    widgetCarousel.append(root);
    widgetCarousel.setAttribute("aria-label", "Recent duels");
    widgetCarousel.setAttribute("aria-roledescription", "carousel");
    render();
    return widgetCarousel;
  }
  function arrow(label, side, styles) {
    const c = styles.resolve;
    const button = element(
      "button",
      c(
        "carousel_arrowButton__XGlCA",
        side === "left" ? "carousel_leftArrowButton__ifAeT" : "carousel_rightArrowButton__VF_2e"
      )
    );
    button.type = "button";
    button.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", c("carousel_arrowSvg__XrIgh"));
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path2 = document.createElementNS(svg.namespaceURI, "path");
    path2.setAttribute(
      "d",
      side === "left" ? "M17,23a1,1,0,0,1-.707-.293l-10-10a1,1,0,0,1,0-1.414l10-10a1,1,0,0,1,1.414,1.414L8.414,12l9.293,9.293A1,1,0,0,1,17,23Z" : "M7,23a1,1,0,0,1-.707-1.707L15.586,12,6.293,2.707A1,1,0,0,1,7.707,1.293l10,10a1,1,0,0,1,0,1.414l-10,10A1,1,0,0,1,7,23Z"
    );
    svg.append(path2);
    button.append(svg);
    return button;
  }
  function gameCard(entry, userId, styles = nativeStyles(), showDate = true) {
    const c = styles.resolve, duel = entry.duel;
    const ratings = new Map(
      duel.teams?.flatMap((team2) => team2.players.map((player) => [player.playerId, player]))
    );
    const players = [...entry.players].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)).map((player) => ({
      ...player,
      rating: ratings.get(player.id)?.rankedSystemRating ?? player.rating,
      tier: ratings.get(player.id)?.tier ?? player.tier
    }));
    const item = element("div", c("game-history-list-item_item__rRU_J"));
    const result = !duel.winnerId ? [] : [
      duel.winnerId === userId ? "game-history-list-item_primaryUserWon__RmuIy" : "game-history-list-item_opponentWon__vX27C"
    ];
    const card = element("div", c("game-history-list-item_card__4tf1Q", ...result));
    const data = element("div", c("game-history-list-item_gameData__etu0v"));
    const left = element(
      "div",
      c(
        "game-history-list-item_gameDataSide__WonRL",
        "game-history-list-item_gameDataSideLeft__PvVLQ"
      )
    );
    const right = element(
      "div",
      c(
        "game-history-list-item_gameDataSide__WonRL",
        "game-history-list-item_gameDataSideRight__6KUOb"
      )
    );
    const center = element("div", c("game-history-list-item_centerColumn__OcNCH"));
    center.append(
      element(
        "span",
        c("game-history-list-item_mode__DhY8T"),
        modeNames[duel.gameMode ?? ""] ?? duel.gameMode ?? "Duels"
      ),
      element("div", c("game-history-list-item_vs__0Dtj2"), "VS")
    );
    if (players[0])
      left.append(
        playerColumn(players[0], "left", duel.winnerId, styles),
        avatar(players[0], styles)
      );
    for (const player of players.slice(1))
      right.append(avatar(player, styles), playerColumn(player, "right", duel.winnerId, styles));
    data.append(left, center, right);
    const actions = element("div", c("game-history-actions_actions__Y626Q"));
    for (const view of ["replay", "summary"]) {
      const tooltip = element("span", c("tooltip_reference___tWvM"));
      const action = link(
        "",
        duelPath(entry.gameId, view),
        c("link_anchor__TGl1_", "game-history-actions_actionBtn__u4zj2")
      );
      action.title = view === "replay" ? "Replay" : "Summary";
      action.setAttribute("aria-label", action.title);
      const icon = image(
        assets[view],
        c("game-history-actions_actionIcon__ohM8d"),
        view === "replay" ? 22 : 24,
        view === "replay" ? 22 : 24
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
        const dateSlot = element("span", c("game-history-list-item_date__G_uNE"));
        const text = element(
          "span",
          "",
          when.toLocaleDateString(void 0, { day: "2-digit", month: "2-digit", year: "2-digit" })
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
  function playerColumn(player, side, winnerId, styles) {
    const c = styles.resolve;
    const column = element(
      "div",
      c(
        side === "left" ? "game-history-player-column_left__cXQn4" : "game-history-player-column_right__vW2fr"
      )
    );
    if (winnerId)
      column.append(
        element(
          "span",
          c(
            player.id === winnerId ? "game-history-player-column_victory__PkWR6" : "game-history-player-column_defeat__Zv4p5"
          ),
          player.id === winnerId ? "VICTORY!" : "DEFEAT!"
        )
      );
    const nick = element("div", c("ellipsed-user-nick_root__8MmmI"));
    const identity = element(
      "div",
      c("player-nick_wrapper__WjkG6", "ellipsed-user-nick_identity__YFhgt")
    );
    identity.append(
      link(
        player.nick || "Unknown",
        `/user/${encodeURIComponent(player.id)}`,
        c("link_anchor__TGl1_", "nick_nick__THesc", "ellipsed-user-nick_nick__WF5w5")
      )
    );
    if (player.countryCode && /^[a-z]{2}$/i.test(player.countryCode)) {
      const flag = image(
        `https://flagcdn.com/w40/${player.countryCode.toLowerCase()}.png`,
        c("flag_flag__Fsx7Z", "player-nick_flag__yQWK5"),
        21,
        15
      );
      flag.alt = player.countryCode;
      identity.append(flag);
    }
    nick.append(identity);
    const rating = element("div", c("game-history-player-column_rating__mqEKT"));
    rating.append(
      element("span", c("game-history-player-column_ratingLabel____9TC"), "Rating"),
      ` ${player.rating ?? "\u2014"}`
    );
    column.append(nick, rating);
    return column;
  }
  function avatar(player, styles) {
    const c = styles.resolve;
    const cell = element("div", c("game-history-list-item_avatarCell__Z1U6s"));
    const title = element("div", c("avatar_titleAvatar__JsMrO"));
    const img = element("div", c("avatar_titleAvatarImage__sXIP7"));
    if (player.pin?.url) {
      const portrait = image(
        `/images/resize:auto:48:48/gravity:ce/plain/${player.pin.url}`,
        c("styles_image__3rHlb")
      );
      portrait.style.cssText = "position:absolute;width:100%;inset:0;object-fit:cover;color:transparent";
      portrait.loading = "eager";
      portrait.decoding = "async";
      img.append(portrait);
    }
    const border = image(
      `/static/avatars/tiers/low-quality/tier-${Number.isFinite(player.tier) ? player.tier : 100}.webp`,
      c("avatar_titleAvatarBorder__QmnOl")
    );
    border.style.cssText = "position:absolute;height:100%;width:100%;inset:0;color:transparent";
    border.decoding = "async";
    title.append(img, border);
    cell.append(title);
    return cell;
  }
  function image(src, className, width, height) {
    const img = element("img", className);
    img.src = src;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    if (width) img.width = width;
    if (height) img.height = height;
    return img;
  }

  // src/features/match-history-dialog.ts
  function openHistoryDialog(initial, userId, onClose) {
    const scope = new Scope(), styles = nativeStyles(), c = styles.resolve;
    const focused = document.activeElement;
    const dialog = element("dialog", "bettergeo-duels");
    dialog.setAttribute("aria-label", "Recent games");
    if (!styles.has("game-history-modal_root__"))
      dialog.classList.add("bettergeo-history-modal-fallback");
    if (!styles.has("game-history-list-item_card__"))
      dialog.classList.add("bettergeo-history-fallback");
    const overlay = element("div", c("version4_fullOverlay__IQxsi"));
    const portal = element("div", c("overlay-portal_destination__ghrwd"));
    const backlight = element(
      "div",
      c(
        "overlay-modal_backlight__RpQao",
        "overlay-modal_backlightDark__TqpAA",
        "overlay-modal_isAnimated__qxbgD",
        "overlay-modal_blurBackground__9_zFe"
      )
    );
    const container = element(
      "div",
      c(
        "overlay-modal_contentContainer___KC3A",
        "overlay-modal_alignVerticallyCenter__oydwB",
        "overlay-modal_isAnimated__qxbgD"
      )
    );
    const content = element(
      "div",
      c(
        "overlay-modal_content__d7Vy6",
        "overlay-modal_sizeLarge__oBI4H",
        "overlay-modal_fullHeight__wQygj"
      )
    );
    const root = element("div", c("game-history-modal_root__TZJqh"));
    const header = element("div", c("game-history-modal_divisionHeader__ELL4_"));
    const ranked = [...document.querySelectorAll("h2")].find((h) => /^ranked duels$/i.test(h.textContent?.trim() ?? ""))?.closest('[class*="widget_root__"]');
    const division = [...ranked?.querySelectorAll("img") ?? []].find(
      (img) => /champion|master|gold|silver|bronze/i.test(img.src)
    );
    const icon = division ? division.cloneNode(false) : element("img");
    if (!division)
      icon.src = "/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-duels.f0444913.webp&w=640&q=75";
    icon.removeAttribute("id");
    icon.removeAttribute("class");
    icon.removeAttribute("style");
    icon.alt = "";
    icon.width = 600;
    icon.height = 600;
    header.append(
      icon,
      element("p", c("game-history-modal_divisionHeaderText__BeuNw"), "Recent games")
    );
    const dropdownContainer = element("div", c("game-history-modal_dropdownContainer__aYYv3"));
    const dropdownSlot = element("div", c("game-history-modal_dropdown__tSpru"));
    const dropdown = element(
      "div",
      c(
        "dropdown_dropdown__GxB04",
        "dropdown_variantLightTransparent__YBisN",
        "dropdown_sizeDefault__nhnvm"
      )
    );
    const select = element("select", c("dropdown_select__WtHWX"));
    select.setAttribute("aria-label", "Game mode");
    for (const [value, label] of [
      ["None", "All"],
      ["StandardDuels", "Moving"],
      ["NoMoveDuels", "No move"],
      ["NmpzDuels", "NMPZ"]
    ]) {
      const option = element("option", "", label);
      option.value = value;
      select.append(option);
    }
    dropdown.append(select, element("div", c("dropdown_arrow__9Wc4k")));
    dropdownSlot.append(dropdown);
    dropdownContainer.append(dropdownSlot);
    const spacer = element("div", c("spacer_space__R4G0s", "spacer_height__ovvoK"));
    spacer.style.setProperty("--height", "32");
    const leaderboard = element("div", c("game-history-modal_leaderboardWrapper__p3_RH"));
    const listRoot = element("div", c("game-history-list_root__QvVPL"));
    const listContainer = element("div", c("game-history-list_leaderboardContainer__FnLO5"));
    const list = element("div", c("game-history-list_list__T_e20"));
    list.classList.add("bettergeo-duel-list");
    const status = element("p", "bettergeo-history-status");
    status.setAttribute("role", "status");
    status.hidden = true;
    listContainer.append(status, list);
    listRoot.append(listContainer);
    leaderboard.append(listRoot);
    root.append(
      header,
      dropdownContainer,
      spacer,
      element("div", c("game-history-modal_separator__gP85P")),
      leaderboard
    );
    content.append(root);
    const close = element(
      "button",
      c("overlay-modal_closeButton__8QTzI", "overlay-modal_closeButtonWhite__2Ozdd")
    );
    close.type = "button";
    close.name = "close";
    close.setAttribute("aria-label", "Close recent games");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("aria-hidden", "true");
    const path2 = document.createElementNS(svg.namespaceURI, "path");
    path2.setAttribute(
      "d",
      "M11.146,5.546l-.692-.692a.5.5,0,0,0-.708,0L8,6.6,6.254,4.854a.5.5,0,0,0-.708,0l-.692.692a.5.5,0,0,0,0,.708L6.6,8,4.854,9.746a.5.5,0,0,0,0,.708l.692.692a.5.5,0,0,0,.708,0L8,9.4l1.746,1.746a.5.5,0,0,0,.708,0l.692-.692a.5.5,0,0,0,0-.708L9.4,8l1.746-1.746A.5.5,0,0,0,11.146,5.546Z"
    );
    svg.append(path2);
    close.append(svg);
    container.append(content, close);
    portal.append(backlight, container);
    overlay.append(portal);
    dialog.append(overlay);
    function render() {
      const mode = select.value;
      list.replaceChildren(
        ...initial.filter(
          (entry) => entry.duel && Array.isArray(entry.players) && (mode === "None" || entry.duel.gameMode === mode)
        ).map((entry) => gameCard(entry, userId, styles))
      );
      status.textContent = list.children.length ? "" : "No recent games in this mode.";
      status.hidden = !!list.children.length;
      leaderboard.scrollTop = 0;
      content.scrollTop = 0;
    }
    const blockOutsideWheel = (event) => {
      if (!(event.target instanceof Node) || !content.contains(event.target)) event.preventDefault();
    };
    document.addEventListener("wheel", blockOutsideWheel, { capture: true, passive: false });
    scope.own(() => document.removeEventListener("wheel", blockOutsideWheel, true));
    const overflow = document.body.style.getPropertyValue("overflow");
    const priority = document.body.style.getPropertyPriority("overflow");
    document.body.style.setProperty("overflow", "hidden");
    scope.own(() => {
      if (overflow) document.body.style.setProperty("overflow", overflow, priority);
      else document.body.style.removeProperty("overflow");
    });
    content.style.overscrollBehavior = "contain";
    leaderboard.style.overscrollBehavior = "contain";
    scope.listen(select, "change", render);
    function finish() {
      if (!scope.active) return;
      scope.dispose();
      dialog.remove();
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
      onClose();
    }
    scope.listen(dialog, "close", finish);
    scope.listen(close, "click", finish);
    scope.listen(backlight, "click", finish);
    scope.listen(container, "click", (event) => {
      if (event.target === container) finish();
    });
    render();
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
    return finish;
  }

  // src/features/match-history.ts
  var widgetId = "bettergeo-match-history";
  var matchHistory = {
    id: "match-history",
    name: "Unhide recent duels",
    description: "Restore the Recent Duels panel when a player has hidden it on their profile.",
    enable({ api: api2, events: events2 }, scope) {
      let widget, closeModal;
      const style = element("style");
      style.textContent = CSS4;
      scope.own(() => style.remove());
      function showAll(data, id) {
        closeModal?.();
        closeModal = openHistoryDialog(data, id, () => {
          closeModal = void 0;
        });
      }
      watchProfile(events2, scope, {
        name: "match history",
        target() {
          const container = profileWidgets();
          const native = container && [...container.querySelectorAll("h2")].some(
            (heading) => !heading.closest(`#${widgetId}`) && /recent duels/i.test(heading.textContent ?? "")
          );
          if (native) {
            widget?.remove();
            widget = void 0;
            closeModal?.();
            return null;
          }
          return container;
        },
        load: (id) => api2.history(id),
        reset() {
          widget?.remove();
          widget = void 0;
          closeModal?.();
        },
        render(data, id, container) {
          if (widget?.isConnected) {
            if (!widget.classList.contains("bettergeo-history-fallback") || !nativeStyles().has("game-history-list-item_card__"))
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
        }
      });
    }
  };
  var CSS4 = `
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

  // src/features/race-player.ts
  function racePlayer(id, player, c, nativeBoard) {
    const nativeLink = nativeBoard?.querySelector(`a[href$="/user/${id}"]`);
    const nativeIdentity = nativeLink?.closest('[class*="player-nick_wrapper__"]');
    const identity = nativeIdentity ? nativeIdentity.cloneNode(true) : element("div", c("player-nick_wrapper__WjkG6", "global-leaderboard-row_player__5R_nz"));
    identity.querySelectorAll(".bettergeo-online-race").forEach((badge2) => badge2.remove());
    identity.removeAttribute("id");
    for (const node of identity.querySelectorAll("[id], [aria-describedby]")) {
      node.removeAttribute("id");
      node.removeAttribute("aria-describedby");
    }
    if (!nativeIdentity) {
      if (player.avatar) {
        const avatar2 = element(
          "div",
          c("legacy-avatar_avatar__Cyqz8", "global-leaderboard-row_avatar__F93eb")
        );
        const circle = element(
          "div",
          c(
            "styles_circle__xzz4g",
            "styles_variantFloating__EERDe",
            "styles_colorWhite__JDJEH",
            "styles_borderColorWhite__VsTBL",
            "styles_borderSizeFactorHalf__XbkiO"
          )
        );
        const rectangle = element("div", c("styles_rectangle__864ZT"));
        rectangle.style.paddingTop = "100%";
        const inner = element("div", c("styles_innerCircle__QspyH"));
        const content = element("div", c("styles_content__hkoJ_"));
        const image2 = element("img", c("styles_image__3rHlb"));
        image2.src = `/images/resize:auto:48:48/gravity:ce/plain/${player.avatar}`;
        image2.alt = "";
        image2.loading = "lazy";
        image2.draggable = false;
        image2.style.cssText = "position:absolute;width:100%;height:100%;inset:0;object-fit:cover";
        content.append(image2);
        inner.append(content);
        rectangle.append(inner);
        circle.append(rectangle);
        avatar2.append(circle);
        identity.append(avatar2);
      }
      if (player.countryCode) {
        const flag = element("img", c("flag_flag__Fsx7Z", "player-nick_flag__yQWK5"));
        flag.src = `https://flagcdn.com/w40/${player.countryCode}.png`;
        flag.alt = "";
        flag.title = countryName(player.countryCode);
        flag.loading = "lazy";
        flag.draggable = false;
        identity.append(flag);
      }
      identity.append(
        link(
          player.nick,
          `/user/${id}`,
          c("link_anchor__TGl1_", "nick_nick__THesc", "global-leaderboard-row_nick__3FxXj")
        )
      );
    }
    const badge = element(
      "span",
      "bettergeo-online-race",
      `${player.region}${player.position === void 0 ? "" : ` #${player.position}`}`
    );
    badge.dataset.region = player.region;
    badge.title = [
      player.name.toLowerCase().includes(player.region.toLowerCase()) ? player.name : `${player.name} \xB7 ${player.region}`,
      player.position === void 0 ? "" : `Regional position: #${player.position}`,
      player.total === void 0 ? "" : `Total: ${player.total} points`,
      ...player.points.map((points, index) => `Week ${index + 1}: ${points} points`)
    ].filter(Boolean).join("\n");
    badge.tabIndex = 0;
    identity.append(badge);
    return identity;
  }

  // src/features/race-leaderboard.ts
  function installRaceLeaderboard({ api: api2, events: events2 }, scope, knownPlayers, acceptPlayers) {
    let cache;
    let mounted;
    const style = element("style");
    style.textContent = CSS5;
    scope.own(() => {
      mounted?.scope.dispose();
      style.remove();
    });
    scope.own(
      events2.subscribe(() => {
        const onDuels = /^\/(?:[a-z]{2}\/)?multiplayer\/duels\/?$/.test(location.pathname);
        const tabs = onDuels ? document.querySelector('[class*="global-leaderboard_scopeTabs__"] [role="tablist"]') : null;
        const shell = tabs?.closest('[class*="leaderboard-shell_shell__"]');
        const content = shell?.querySelector('[class*="leaderboard-shell_content__"]');
        if (mounted && (mounted.tabs !== tabs || mounted.shell !== shell || mounted.content !== content || !mounted.tabs.querySelector("[data-bettergeo-race-tab]"))) {
          mounted.scope.dispose();
          mounted = void 0;
        }
        if (!tabs || !shell || !content || mounted) return;
        const template = tabs.querySelector('button[role="tab"]');
        if (!template) return;
        if (!style.isConnected) document.head.append(style);
        const c = nativeStyles().resolve;
        const cycle = new Scope();
        mounted = { tabs, shell, content, scope: cycle };
        const button = element("button", `${template.className} bettergeo-race-tab`, "ELO Race");
        button.type = "button";
        button.id = "bettergeo-race-tab";
        button.dataset.bettergeoRaceTab = "";
        button.setAttribute("role", "tab");
        button.setAttribute("aria-selected", "false");
        button.setAttribute("aria-controls", "bettergeo-race-panel");
        const panel = element("section", "bettergeo-race-panel");
        panel.id = "bettergeo-race-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", button.id);
        panel.hidden = true;
        const filters = element(
          "div",
          `${c("global-leaderboard_modeTabs__JMDtx")} bettergeo-race-filters`
        );
        filters.hidden = true;
        const filterRoot = element("div", c("tabs_root__HXSCq"));
        filterRoot.dataset.variant = "underline";
        filterRoot.dataset.rounded = "default";
        filterRoot.dataset.width = "auto";
        const filterList = element("div", c("tabs_list__KrxZ4"));
        const filterScroller = element("div", c("tabs_scroller__E54XO"));
        filterScroller.setAttribute("role", "group");
        filterScroller.setAttribute("aria-label", "Race region");
        filterList.append(filterScroller);
        filterRoot.append(filterList);
        filters.append(filterRoot);
        const status = element("p", "bettergeo-race-status");
        status.setAttribute("role", "status");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("viewBox", "0 0 24 24");
        icon.setAttribute("width", "14");
        icon.setAttribute("height", "14");
        icon.setAttribute("fill", "none");
        icon.setAttribute("stroke", "currentColor");
        icon.setAttribute("stroke-width", "2");
        icon.setAttribute("aria-hidden", "true");
        const updated = element("span", "bettergeo-race-updated");
        updated.title = "Ratings are cached for 5 minutes. Click the refresh button to fetch the latest ratings.";
        updated.tabIndex = 0;
        const refresh = element("button", "bettergeo-race-refresh");
        refresh.type = "button";
        refresh.title = "Refresh ratings";
        refresh.setAttribute("aria-label", "Refresh race ratings");
        const refreshIcon = icon;
        const arrow2 = document.createElementNS(icon.namespaceURI, "path");
        arrow2.setAttribute(
          "d",
          "M20 7v5h-5M4 17v-5h5M6.1 6.1A8 8 0 0 1 19.5 9M4.5 15a8 8 0 0 0 13.4 2.9"
        );
        refreshIcon.append(arrow2);
        refresh.append(refreshIcon);
        const metadata = element("span", "bettergeo-race-metadata");
        metadata.append(updated, refresh);
        const retry = element("button", `${template.className} bettergeo-race-retry`, "Retry");
        retry.type = "button";
        retry.hidden = true;
        const board = element("div", c("global-leaderboard_leaderboard__mx2Iy"));
        const headerTable = element(
          "table",
          `${c("global-leaderboard_table__6Y95Y")} bettergeo-race-table`
        );
        const head = element("thead");
        const headers = element("tr");
        for (const [label, className] of [
          ["", "global-leaderboard_rankHead___zVjK"],
          ["Name", "global-leaderboard_playerHead__l5F01"],
          ["Rating", "global-leaderboard_ratingHead__Q5Xbt"]
        ]) {
          const th = element("th", c(className), label);
          if (!label) th.setAttribute("aria-label", "Rating rank");
          th.scope = "col";
          if (label === "Name") th.append(metadata);
          headers.append(th);
        }
        head.append(headers);
        headerTable.append(head);
        const table = element(
          "table",
          `${c("global-leaderboard_table__6Y95Y")} bettergeo-race-table`
        );
        const body = element("tbody");
        table.append(body);
        const results = element(
          "div",
          `${c("global-leaderboard_rows__OlmnP")} bettergeo-race-results`
        );
        results.append(table);
        board.append(headerTable, results);
        panel.append(status, retry, board);
        tabs.append(button);
        const nativeModeTabs = shell.querySelector('[class*="global-leaderboard_modeTabs__"]');
        if (nativeModeTabs) nativeModeTabs.after(filters);
        else tabs.parentElement.after(filters);
        content.append(panel);
        let active = false;
        let region = "All";
        let snapshot;
        let request;
        const nativeAttributes = /* @__PURE__ */ new Map();
        const attributeNames = ["aria-selected", "data-state", "tabindex"];
        function render() {
          if (!snapshot) return;
          const entries = [...snapshot.players].filter(
            ([, player]) => region === "All" || player.region === region
          );
          entries.sort(([a, pa], [b, pb]) => {
            const ra = snapshot.ratings.get(a), rb = snapshot.ratings.get(b);
            if (ra === void 0) return rb === void 0 ? pa.nick.localeCompare(pb.nick) : 1;
            if (rb === void 0) return -1;
            return rb - ra || pa.nick.localeCompare(pb.nick);
          });
          const nativeBoard = [...content.querySelectorAll('[class*="global-leaderboard_leaderboard__"]')].find(
            (node) => !panel.contains(node)
          ) ?? null;
          const fragment = document.createDocumentFragment();
          for (const [index, [id, player]] of entries.entries()) {
            const rating = snapshot.ratings.get(id);
            const row = element("tr", c("global-leaderboard-row_row__Vk0Dt"));
            const rankCell = element("td", c("global-leaderboard-row_rankCell__rhsqZ"));
            rankCell.append(
              element(
                "div",
                c("global-leaderboard-row_rank__UxnQx"),
                rating === void 0 ? "\u2014" : String(index + 1)
              )
            );
            const name = element("td", c("global-leaderboard-row_playerCell__8Gl9V"));
            name.append(racePlayer(id, player, c, nativeBoard));
            const ratingCell = element("td", c("global-leaderboard-row_ratingCell__CSoq3"));
            ratingCell.append(
              element(
                "span",
                c("global-leaderboard-row_ratingValue__AX7HJ"),
                rating === void 0 ? "N/A" : rating.toLocaleString()
              )
            );
            row.append(rankCell, name, ratingCell);
            fragment.append(row);
          }
          body.replaceChildren(fragment);
          updated.textContent = `Updated ${new Date(snapshot.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
          status.textContent = entries.length ? "" : "No participants in this region.";
          status.hidden = entries.length > 0;
        }
        for (const label of ["All", "APAC", "EMEA", "Americas"]) {
          const filter = element("button", c("tabs_trigger__KOf2y"), label);
          filter.dataset.state = label === region ? "active" : "inactive";
          filter.type = "button";
          filter.setAttribute("aria-pressed", String(label === region));
          cycle.listen(filter, "click", () => {
            region = label;
            for (const item of filters.querySelectorAll("button")) {
              item.setAttribute("aria-pressed", String(item === filter));
              item.dataset.state = item === filter ? "active" : "inactive";
            }
            updateFilterUnderline();
            render();
          });
          filterScroller.append(filter);
        }
        function updateFilterUnderline() {
          const selected = filterScroller.querySelector('[aria-pressed="true"]');
          filterScroller.style.setProperty("--tab-list-w", `${filterScroller.scrollWidth}px`);
          filterScroller.style.setProperty("--tab-active-w", `${selected?.offsetWidth ?? 0}px`);
          filterScroller.style.setProperty("--tab-active-x", `${selected?.offsetLeft ?? 0}px`);
        }
        cycle.listen(window, "resize", updateFilterUnderline);
        function deactivate() {
          active = false;
          request?.abort();
          request = void 0;
          shell.classList.remove("bettergeo-race-open");
          panel.hidden = true;
          filters.hidden = true;
          button.setAttribute("aria-selected", "false");
          button.dataset.state = "inactive";
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
          if (force) cache = void 0;
          const controller = new AbortController();
          request = controller;
          const signal = controller.signal;
          snapshot = void 0;
          retry.hidden = true;
          refresh.disabled = true;
          status.hidden = false;
          board.hidden = true;
          panel.setAttribute("aria-busy", "true");
          status.textContent = "Loading race participants\u2026";
          try {
            const existing = force ? void 0 : knownPlayers();
            const players = existing ?? await api2.onlineRacePlayers(signal);
            signal.throwIfAborted();
            if (!existing) acceptPlayers(players);
            const key = [...players.keys()].sort().join(",");
            if (cache && Date.now() - cache.loadedAt < 5 * 6e4 && [...cache.players.keys()].sort().join(",") === key) {
              snapshot = { ...cache, players };
            } else {
              status.textContent = `Loading ratings \xB7 0 of ${players.size} found\u2026`;
              const result = await api2.onlineRaceRatings(new Set(players.keys()), signal, (found) => {
                if (!signal.aborted)
                  status.textContent = `Loading ratings \xB7 ${found} of ${players.size} found\u2026`;
              });
              signal.throwIfAborted();
              snapshot = { ...result, players, loadedAt: Date.now() };
              cache = snapshot;
            }
            if (!cycle.active || !active) return;
            render();
            board.hidden = false;
          } catch {
            if (!signal.aborted && cycle.active && active) {
              status.textContent = "Could not load race ratings. Please try again.";
              retry.hidden = false;
            }
          } finally {
            if (request === controller) {
              request = void 0;
              refresh.disabled = false;
              panel.removeAttribute("aria-busy");
            }
          }
        }
        cycle.listen(retry, "click", () => {
          void load();
        });
        cycle.listen(refresh, "click", () => {
          void load(true);
        });
        cycle.listen(button, "click", (event) => {
          event.stopPropagation();
          if (active) return;
          active = true;
          for (const tab of tabs.querySelectorAll('[role="tab"]')) {
            if (tab === button) continue;
            nativeAttributes.set(
              tab,
              attributeNames.map((name) => tab.getAttribute(name))
            );
            tab.setAttribute("aria-selected", "false");
            tab.setAttribute("data-state", "inactive");
          }
          button.setAttribute("aria-selected", "true");
          button.dataset.state = "active";
          shell.classList.add("bettergeo-race-open");
          panel.hidden = false;
          filters.hidden = false;
          updateFilterUnderline();
          void load();
        });
        cycle.listen(button, "keydown", (event) => {
          const key = event.key;
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(key)) return;
          event.preventDefault();
          event.stopPropagation();
          const native = [...tabs.querySelectorAll('button[role="tab"]')].filter(
            (tab) => tab !== button
          );
          const target = key === "ArrowLeft" ? native.at(-1) : key === "End" ? button : native[0];
          target?.click();
          target?.focus();
        });
        const nativeClick = (event) => {
          if (active && event.target instanceof Element && !panel.contains(event.target) && !filters.contains(event.target) && event.target.closest("button") !== button)
            deactivate();
        };
        shell.addEventListener("click", nativeClick, true);
        cycle.own(() => {
          deactivate();
          shell.removeEventListener("click", nativeClick, true);
          button.remove();
          panel.remove();
          filters.remove();
        });
      })
    );
  }
  var CSS5 = `
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
`;

  // src/features/online-race.ts
  var selector = '[class*="global-leaderboard-row_player__"] a[href*="/user/"], [class*="leaderboard"] [class*="player-nick_wrapper__"] a[href*="/user/"]';
  function refreshBadge(badge, player) {
    const text = `${player.region}${player.position === void 0 ? "" : ` #${player.position}`}`;
    const title = [
      player.name.toLowerCase().includes(player.region.toLowerCase()) ? player.name : `${player.name} \xB7 ${player.region}`,
      player.position === void 0 ? "" : `Regional position: #${player.position}`,
      player.total === void 0 ? "" : `Total: ${player.total} points`,
      ...player.points.map((points, index) => `Week ${index + 1}: ${points} points`)
    ].filter(Boolean).join("\n");
    if (badge.textContent !== text) badge.textContent = text;
    if (badge.dataset.region !== player.region) badge.dataset.region = player.region;
    if (badge.title !== title) badge.title = title;
    if (badge.getAttribute("aria-label") !== title) badge.setAttribute("aria-label", title);
  }
  var onlineRace = {
    id: "online-race",
    name: "Online race leaderboard tags",
    description: "Tag World League race participants and add an ELO Race leaderboard with region filters.",
    enable(services, scope) {
      const { api: api2, events: events2 } = services;
      const badges = /* @__PURE__ */ new Map();
      const style = element("style");
      style.textContent = `.bettergeo-online-race {
      display: inline-block; flex-shrink: 0; white-space: nowrap;
      padding: 2px 5px; border: 1px solid currentColor; border-radius: 4px;
      color: #ddd; background: #ffffff14;
      font-size: 10px; font-weight: 700; line-height: 1.3;
      vertical-align: middle; cursor: help;
    }
    /* World Championship race-standings region colours (design-system shade 50). */
    .bettergeo-online-race[data-region="APAC"] {
      color: #e94555; background: #e9455520;
    }
    .bettergeo-online-race[data-region="EMEA"] {
      color: #00a2fe; background: #00a2fe20;
    }
    .bettergeo-online-race[data-region="Americas"] {
      color: #3ae8bd; background: #3ae8bd20;
    }`;
      let players;
      let loading = false;
      let expires = 0;
      let retryAt = 0;
      let onDuels = false;
      let generation = 0;
      installRaceLeaderboard(
        services,
        scope,
        () => players,
        (result) => {
          generation++;
          players = result;
          loading = false;
          expires = Date.now() + 5 * 6e4;
          retryAt = 0;
          events2.schedule();
        }
      );
      scope.own(() => {
        badges.forEach((badge) => badge.remove());
        badges.clear();
        style.remove();
      });
      scope.own(
        events2.subscribe(() => {
          const isDuels = /^\/(?:[a-z]{2}\/)?multiplayer\/duels\/?$/.test(location.pathname);
          if (isDuels !== onDuels) {
            onDuels = isDuels;
            generation++;
            loading = false;
            expires = 0;
            retryAt = 0;
            players = void 0;
          }
          const links = new Set(
            isDuels ? [...document.querySelectorAll(selector)].filter(
              (link2) => !link2.closest(".bettergeo-race-panel")
            ) : []
          );
          for (const [link2, badge] of badges) {
            const id = new URL(link2.href).pathname.match(/\/user\/([a-f0-9]{24})\/?$/i)?.[1];
            const player = id ? players?.get(id) : void 0;
            if (!links.has(link2) || !badge.isConnected || badge.parentElement !== (link2.closest('[class*="player-nick_wrapper__"]') ?? link2.parentElement) || !player) {
              badge.remove();
              badges.delete(link2);
            } else {
              refreshBadge(badge, player);
              const container = badge.parentElement;
              if (container.lastElementChild !== badge) container.append(badge);
            }
          }
          if (!isDuels) return;
          if (!style.isConnected) document.head.append(style);
          if (!loading && Date.now() >= expires && Date.now() >= retryAt) {
            loading = true;
            const requestGeneration = generation;
            void api2.onlineRacePlayers().then((result) => {
              if (!scope.active || requestGeneration !== generation) return;
              players = result;
              expires = Date.now() + 5 * 6e4;
              events2.schedule();
            }).catch((error) => {
              if (!scope.active || requestGeneration !== generation) return;
              retryAt = Date.now() + 6e4;
              if (scope.active) console.error("[BetterGEO online race]", error);
            }).finally(() => {
              if (requestGeneration === generation) loading = false;
            });
          }
          if (!players) return;
          for (const link2 of links) {
            if (badges.has(link2)) continue;
            const id = new URL(link2.href).pathname.match(/\/user\/([a-f0-9]{24})\/?$/i)?.[1];
            const player = id ? players.get(id) : void 0;
            if (!player) continue;
            const badge = element("span", "bettergeo-online-race");
            refreshBadge(badge, player);
            badge.tabIndex = 0;
            (link2.closest('[class*="player-nick_wrapper__"]') ?? link2.parentElement)?.append(badge);
            badges.set(link2, badge);
          }
        })
      );
    }
  };

  // src/main.ts
  var page = unsafeWindow;
  var network = new Network(page);
  var events = new PageEvents(page);
  var api = new GeoGuessrApi(page);
  network.observe(
    (url) => url.origin === location.origin && api.scores.matches(url.pathname),
    (url, data) => {
      api.scores.accept(url.pathname, data);
      events.schedule();
    }
  );
  var manager = new FeatureManager(
    [
      summaryRecovery,
      gameResults,
      matchHistory,
      onlineRace,
      profileStatus,
      countryPerformance,
      randomMap,
      tournamentsLink
    ],
    { page, network, events, api }
  );
  manager.start();
  GM_registerMenuCommand("BetterGEO settings", () => openSettings(manager));
  window.addEventListener("pagehide", (event) => {
    if (event.persisted) return;
    manager.dispose();
    events.dispose();
    network.dispose();
  });
})();

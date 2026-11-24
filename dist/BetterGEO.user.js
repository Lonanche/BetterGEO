// ==UserScript==
// @name         BetterGEO
// @namespace    BetterGEO
// @version      0.3.0
// @description  Toggleable GeoGuessr improvements: old duel summaries, map result links, hidden recent duels, profile restrictions, country ranked stats, random maps, and tournaments.
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
  function hydrated(node2, page2 = window) {
    if (!node2) return false;
    return Object.keys(node2).some((key) => key.startsWith("__reactFiber$")) || page2.performance.now() > 2e4;
  }

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
    const node2 = document.createElement(tag);
    node2.className = className;
    if (text !== void 0) node2.textContent = text;
    return node2;
  }
  function link(text, href, className = "") {
    const node2 = element("a", className, text);
    node2.href = href;
    return node2;
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
            for (const [key2, cached2] of this.entries) {
              if (cached2.expires !== Infinity) this.entries.delete(key2);
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
    /** The signed-in account's user ID. */
    currentUserId() {
      return this.cache.get("current-user", async () => {
        const data = await this.json("/api/v3/profiles/", "Account API");
        const user = data && typeof data === "object" && "user" in data ? data.user : void 0;
        const id = user?.id ?? user?.userId;
        if (typeof id !== "string" || !id) throw new Error("Sign in to recover this summary.");
        return id;
      });
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

  // src/core/native-styles.ts
  var formats = [
    // Vite: _[local]_[hash:5]_[line]
    /^_(?<local>[A-Za-z][\w]*?)_(?<module>[a-z0-9]{5})_\d+$/,
    // Next.js: [file]_[local]__[hash:5]
    /^(?<module>[a-z][a-z0-9-]*)_(?<local>[A-Za-z][\w]*?)__[\w-]{5}$/
  ];
  function parseClass(name) {
    for (const format of formats) {
      const groups = name.match(format)?.groups;
      if (groups) return { module: groups.module, local: groups.local };
    }
    return void 0;
  }
  var looseSelector = (local) => `[class*="_${local}_"]`;
  var StyleIndex = class _StyleIndex {
    modules = /* @__PURE__ */ new Map();
    sheets = /* @__PURE__ */ new Map();
    add(name, sheet = -1) {
      const parsed = parseClass(name);
      if (!parsed) return;
      let locals = this.modules.get(parsed.module);
      if (!locals) this.modules.set(parsed.module, locals = /* @__PURE__ */ new Map());
      if (!locals.has(parsed.local)) locals.set(parsed.local, name);
      if (sheet >= 0) {
        let sheets = this.sheets.get(parsed.module);
        if (!sheets) this.sheets.set(parsed.module, sheets = /* @__PURE__ */ new Set());
        sheets.add(sheet);
      }
    }
    clone() {
      const copy = new _StyleIndex();
      for (const [module, locals] of this.modules) copy.modules.set(module, new Map(locals));
      for (const [module, sheets] of this.sheets) copy.sheets.set(module, new Set(sheets));
      return copy;
    }
    /** The generated module key for a signature, or undefined when it is not loaded. */
    find(spec2) {
      return this.candidates(spec2)[0];
    }
    /** Every module matching a signature, best first; more than one means it is ambiguous. */
    candidates(spec2) {
      const score = (module) => {
        const locals = this.modules.get(module);
        return spec2.signature.filter((local) => locals.has(local)).length;
      };
      const all = spec2.signature.length;
      let candidates = [...this.modules.keys()].filter((module) => score(module) === all);
      if (!candidates.length) {
        const best = Math.max(0, ...[...this.modules.keys()].map(score));
        if (best < Math.min(2, all) || best * 2 < all) return [];
        candidates = [...this.modules.keys()].filter((module) => score(module) === best);
      }
      if (candidates.length > 1 && spec2.near) {
        const near = this.find(spec2.near);
        const nearSheets = near ? this.sheets.get(near) : void 0;
        const together = candidates.filter(
          (module) => [...this.sheets.get(module) ?? []].some((sheet) => nearSheets?.has(sheet))
        );
        if (together.length) candidates = together;
      }
      return candidates;
    }
  };
  function selectors(rules, visit) {
    for (const rule of rules) {
      if ("selectorText" in rule && typeof rule.selectorText === "string")
        for (const match of rule.selectorText.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) visit(match[1]);
      if ("cssRules" in rule) {
        try {
          selectors(rule.cssRules, visit);
        } catch {
        }
      }
    }
  }
  var sheetNames = /* @__PURE__ */ new WeakMap();
  var cached;
  function stylesheetIndex() {
    const sheets = [];
    for (const sheet of document.styleSheets) {
      try {
        sheets.push({ sheet, rules: sheet.cssRules });
      } catch {
      }
    }
    const key = sheets.flatMap(({ sheet, rules }) => [sheet, rules.length]);
    if (cached && cached.key.length === key.length && cached.key.every((part, i) => part === key[i]))
      return cached.index;
    const index = new StyleIndex();
    sheets.forEach(({ sheet, rules }, position) => {
      let entry = sheetNames.get(sheet);
      if (!entry || entry.rules !== rules.length) {
        const names = [];
        selectors(rules, (name) => names.push(name));
        entry = { rules: rules.length, names };
        sheetNames.set(sheet, entry);
      }
      for (const name of entry.names) index.add(name, position);
    });
    cached = { key, index };
    return index;
  }
  function nativeStyles({ dom = true } = {}) {
    const styled = stylesheetIndex();
    const index = dom ? styled.clone() : styled;
    if (dom)
      for (const el of document.querySelectorAll("[class]"))
        for (const name of el.classList) index.add(name);
    const cache = /* @__PURE__ */ new Map();
    function module(spec2) {
      const cached2 = cache.get(spec2);
      if (cached2) return cached2;
      const key = index.find(spec2);
      const locals = key ? index.modules.get(key) : /* @__PURE__ */ new Map();
      const styledKey = styled.find(spec2);
      const result = {
        styled: !!styledKey && styledKey === key,
        cls: (...names) => names.filter((name) => !!name).map((name) => locals.get(name)).filter(Boolean).join(" "),
        sel: (local) => {
          const name = locals.get(local);
          return name ? `.${name}` : looseSelector(local);
        }
      };
      cache.set(spec2, result);
      return result;
    }
    return { module };
  }
  function nativeSelector(spec2, local) {
    return nativeStyles({ dom: false }).module(spec2).sel(local);
  }

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

  // src/geoguessr/styles.ts
  var spec = (name, signature, near) => ({
    name,
    signature,
    near
  });
  var profile = spec("profile", [
    "staticWidgets",
    "widgetRow",
    "proBadgeWrapper",
    "proBadge",
    "headerMainContent"
  ]);
  var widget = spec("widget", [
    "root",
    "compact",
    "widgetBorder",
    "hasLoaded",
    "widgetOuter",
    "widgetInner",
    "header",
    "title",
    "dividerWrapper",
    "rightSlot"
  ]);
  var profileWidget = spec("profile widget", [
    "header",
    "icon",
    "headerContent",
    "widgetData",
    "statContainer",
    "widgetCarousel"
  ]);
  var headline = spec("headline", ["heading", "italic", "balanceTextWrap"]);
  var typography = spec("typography", ["boldWeight", "white60Variant"]);
  var button = spec("button", [
    "button",
    "variantTertiary",
    "sizeSmall",
    "wrapper",
    "label",
    "loadingIndicator"
  ]);
  var carousel = spec("carousel", [
    "carouselContainer",
    "carouselWrapper",
    "carouselInner",
    "spread",
    "indicatorWrapper",
    "indicator",
    "green",
    "red",
    "active",
    "arrowButton",
    "leftArrowButton",
    "rightArrowButton",
    "arrowSvg"
  ]);
  var historyModal = spec("game history modal", [
    "root",
    "divisionHeader",
    "divisionHeaderText",
    "dropdownContainer",
    "dropdown",
    "leaderboardWrapper",
    "separator",
    "carouselRoot",
    "carouselItem"
  ]);
  var historyList = spec("game history list", ["root", "leaderboardContainer", "list"]);
  var historyItem = spec("game history item", [
    "item",
    "link",
    "card",
    "cardOverlay",
    "arrow",
    "tie",
    "primaryUserWon",
    "opponentWon",
    "gameData",
    "gameDataSide",
    "gameDataSideLeft",
    "gameDataSideRight",
    "avatarCell",
    "centerColumn",
    "mode",
    "vs",
    "date"
  ]);
  var historyPlayer = spec(
    "game history player",
    ["left", "right", "victory", "defeat", "tie", "rating", "ratingLabel"],
    historyItem
  );
  var historyNick = spec("game history nick", ["root", "identity", "nick"], historyItem);
  var avatar = spec("avatar", [
    "titleAvatar",
    "titleAvatarImage",
    "titleAvatarBorder",
    "titleAvatarBorderImage",
    "image"
  ]);
  var select = spec("select", [
    "dropdown",
    "select",
    "sizeDefault",
    "variantLightTransparent",
    "arrow"
  ]);
  var overlayModal = spec("overlay modal", [
    "backlight",
    "backlightDark",
    "isAnimated",
    "blurBackground",
    "contentContainer",
    "alignVerticallyCenter",
    "content",
    "sizeLarge",
    "fullHeight",
    "closeButton",
    "closeButtonWhite"
  ]);
  var overlayPortal = spec("overlay portal", ["destination", "destinationWithinChrome"]);
  var layout = spec("layout", ["fullOverlay", "sidebar", "mainOverlay"]);
  var spacer = spec("spacer", ["space", "height", "xlHeight"]);
  var menu = spec("header menu", ["dropdownContainer", "dropdown", "hoverEffect"]);
  var menuItem = spec("header menu item", [
    "dropdownItem",
    "noBorder",
    "image",
    "title",
    "description"
  ]);
  var errorPage = spec("error page", [
    "errorPage",
    "heading",
    "title",
    "cta",
    "illustration"
  ]);
  var mapScores = spec("map scores", [
    "rowContainer",
    "row",
    "cellDate",
    "cellPoints",
    "expandButton"
  ]);
  var media = (hash, width = 512) => `/images/resize:fit:${width}:0/gravity:ce/plain/media/sha256/${hash}.webp`;
  var images = {
    recentDuels: media("715db2907508a299c7054a05234d6832456b64fd15e5512d223d6ffe2d90fd0e"),
    rankedDuels: media("faee11a802cc9615cfe4351bd91a72afa6fe3f1cb757b4e41a87cb3b0eb1d8bb"),
    maps: media("601548a6eee2222041bb0e8dac00d949b88b740ef8cc4b06c9e890b2f58459ff", 128)
  };

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
        maxRoundTime: options.maxRoundTime ?? 0,
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
  function summaryProps(game, userId, current = {}) {
    return { ...current, statusCode: 200, game: summaryShape(game), userId };
  }

  // src/features/summary-recovery.ts
  var summaryRoute = /\/(?:team-)?duels\/\$token\/summary\/?$/;
  var errorSelector = () => nativeSelector(errorPage, "errorPage");
  function summaryMatch(router) {
    return router?.state?.matches?.find((match) => summaryRoute.test(match.routeId ?? ""));
  }
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
        const errorPage2 = document.querySelector(errorSelector());
        if (!errorPage2) return;
        let line = errorPage2.querySelector("[data-summary-recovery]");
        if (!line) {
          line = document.createElement("p");
          line.dataset.summaryRecovery = "";
          line.className = errorPage2.querySelector("p")?.className || "";
          line.setAttribute("role", "status");
          line.style.marginTop = "12px";
          errorPage2.append(line);
        }
        if (line.textContent !== message) line.textContent = message;
      }
      async function repair(game, userId, router, version) {
        const payload = summaryProps(game, userId, summaryMatch(router)?.loaderData?.props);
        let intercepted = false;
        const remove = scope.own(
          network2.intercept((url) => {
            if (!valid(game.gameId, version) || url.origin !== location.origin || !url.pathname.startsWith("/_serverFn/"))
              return void 0;
            const query = decodeURIComponent(url.search);
            if (!/duels\/\[token\]\/summary/.test(query) || !query.includes(game.gameId))
              return void 0;
            intercepted = true;
            return new page2.Response(JSON.stringify(payload), {
              status: 200,
              headers: { "content-type": "application/json" }
            });
          })
        );
        let timer;
        let abort;
        try {
          await Promise.race([
            router.invalidate(),
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error("Native recovery timed out.")), 12e3);
              abort = () => reject(new Error("Recovery disabled."));
              scope.signal.addEventListener("abort", abort, { once: true });
            })
          ]);
          if (!valid(game.gameId, version)) return;
          if (!intercepted) throw new Error("Native recovery did not complete.");
          await new Promise(
            (resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
          if (valid(game.gameId, version) && document.querySelector(errorSelector()))
            throw new Error("The summary is still unavailable.");
        } finally {
          clearTimeout(timer);
          if (abort) scope.signal.removeEventListener("abort", abort);
          remove();
        }
      }
      async function check() {
        const id = syncVisit(), version = visit, router = page2.__TSR_ROUTER__;
        const shown = document.querySelector(errorSelector());
        if (!id || busy || attempted || !router || !shown) return;
        if (!hydrated(shown)) {
          setTimeout(() => scope.active && events2.schedule(), 150);
          return;
        }
        try {
          const props = summaryMatch(router)?.loaderData?.props;
          const broken = props?.statusCode === 404 || /Game not found|couldn.t be found/i.test(document.body?.textContent || "");
          if (!broken) return;
          attempted = true;
          busy = true;
          status("Trying to display this summary\u2026");
          const [game, userId] = await Promise.all([api2.finishedDuel(id), api2.currentUserId()]);
          if (valid(id, version)) await repair(game, userId, router, version);
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
        const rowSelector = `button${nativeSelector(mapScores, "row")}, button[aria-expanded]`;
        for (const row of document.querySelectorAll(rowSelector)) {
          const container = row.parentElement;
          if (!container || !hydrated(row)) continue;
          const date = row.querySelector(`${looseSelector("cellDate")} [title]`) || [...row.querySelectorAll("[title]")].find(
            (el) => Number.isFinite(Date.parse(el.title))
          );
          if (!date) {
            clearResult(container);
            continue;
          }
          const points = row.querySelector(looseSelector("cellPoints"));
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
          const arrow2 = row.querySelector(looseSelector("expandButton")) || row.lastElementChild;
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
          icon.src = "data:image/svg+xml," + encodeURIComponent(infoIcon);
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
  var infoIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7" r="1" fill="white" stroke="none"/></svg>';
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

  // src/core/profile-widget.ts
  function profileWidget2(title, icon) {
    const styles = nativeStyles();
    const profile2 = styles.module(profile), frame = styles.module(widget), card = styles.module(profileWidget), headline2 = styles.module(headline), text = styles.module(typography);
    const root = element("div", profile2.cls("widgetRow"));
    const widget2 = element("div", frame.cls("root", "compact"));
    const border = element("div", frame.cls("widgetBorder", "hasLoaded"));
    const outer = element("div", frame.cls("widgetOuter"));
    const inner = element("div", frame.cls("widgetInner"));
    const heading = element(
      "h2",
      [headline2.cls("heading"), text.cls("boldWeight"), headline2.cls("italic")].join(" ").trim(),
      title
    );
    heading.style.cssText = "--fs:var(--font-size-16);--lh:var(--line-height-16)";
    const header = element("div", frame.cls("header", "compact"));
    const titleSlot = element("div", frame.cls("title"));
    const titleRow = element("div", card.cls("header"));
    const content = element("div", card.cls("headerContent"));
    content.append(heading);
    icon.className = card.cls("icon");
    titleRow.append(icon, content);
    titleSlot.append(titleRow);
    header.append(titleSlot);
    const body = element("div");
    inner.append(header, element("div", frame.cls("dividerWrapper")), body);
    outer.append(inner);
    border.append(outer);
    widget2.append(border);
    root.append(widget2);
    return { root, body, inner, header, titleRow, content, styles };
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
        if (!hydrated(target)) {
          setTimeout(() => scope.active && events2.schedule(), 150);
          return;
        }
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
    return document.querySelector(nativeSelector(profile, "staticWidgets")) || document.querySelector(nativeSelector(profile, "widgetRow"))?.parentElement;
  }

  // src/features/country-performance.ts
  var countryPerformance = {
    id: "country-performance",
    name: "Country ranked stats",
    description: "Show a player\u2019s best and worst countries from ranked progress on their profile.",
    enable({ api: api2, events: events2 }, scope) {
      let widget2;
      const style = element("style");
      style.textContent = CSS2;
      scope.own(() => style.remove());
      watchProfile(events2, scope, {
        name: "country performance",
        target: profileWidgets,
        load: (id) => api2.rankedCountries(id),
        reset() {
          widget2?.remove();
          widget2 = void 0;
        },
        render(data, _, container) {
          if (widget2?.isConnected || !data.bestCountries.length && !data.worstCountries.length)
            return;
          if (!style.isConnected) document.head.append(style);
          widget2 = countryPerformanceView(data);
          const ranked = [...container.querySelectorAll("h2")].find(
            (heading) => /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? "")
          );
          const rankedRow = ranked?.closest(nativeSelector(profile, "widgetRow"));
          if (rankedRow && container.contains(rankedRow)) rankedRow.after(widget2);
          else container.prepend(widget2);
        }
      });
    }
  };
  function countryPerformanceView(data) {
    const rankedHeading = [...document.querySelectorAll("h2")].find(
      (heading) => /^ranked (?:duels|solo)$/i.test(heading.textContent?.trim() ?? "")
    );
    const nativeIcon = rankedHeading?.closest(nativeSelector(widget, "title"))?.querySelector("img");
    const icon = nativeIcon ? nativeIcon.cloneNode(false) : element("img");
    if (!nativeIcon) icon.src = images.rankedDuels;
    icon.removeAttribute("id");
    icon.alt = "";
    icon.width = 40;
    icon.height = 40;
    icon.loading = "lazy";
    const { root, body, inner, header, titleRow, content } = profileWidget2(
      "Country ranked stats",
      icon
    );
    header.classList.add("bettergeo-country-header");
    titleRow.classList.add("bettergeo-country-title");
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
.bettergeo-country-title {
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
    const lists = [
      ...document.querySelectorAll(`${nativeSelector(menu, "dropdown")}, [role="menu"]`)
    ].filter((list) => list.querySelector("a[href]"));
    return lists.filter(
      (parent) => !lists.some((child) => child !== parent && parent.contains(child))
    );
  }
  function menuEntry(tag, titleText, descriptionText, icon, template) {
    const item = nativeStyles().module(menuItem);
    const node2 = element(tag, template?.className || item.cls("dropdownItem"));
    icon.setAttribute(
      "class",
      template?.querySelector("img")?.getAttribute("class") || item.cls("image")
    );
    const title = element("div", item.cls("title"), titleText);
    const description = element("div", item.cls("description"), descriptionText);
    node2.append(icon, title, description);
    return { item: node2, title };
  }
  function insertMenuEntry(container, item) {
    const selector = nativeSelector(menuItem, "dropdownItem");
    const native = [...container.children].filter(
      (child) => child !== item && child.matches(selector) && !Object.keys(child.dataset).some((key) => key.startsWith("bettergeo"))
    );
    const last = native.at(-1);
    if (last) last.after(item);
    else container.append(item);
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
        mounts.forEach((node2) => node2.remove());
        mounts.clear();
        pendingTabs.forEach((tab) => tab.close());
        pendingTabs.clear();
        style.remove();
      });
      async function choose(event, button2, label) {
        if (event.type === "auxclick" && event.button !== 1) return;
        if (event.type === "click" && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        if (busy || !scope.active) return;
        const startingUrl = page2.location.href;
        button2.title = "Open a random community map";
        const newTab = event.button === 1 || event.ctrlKey || event.metaKey || event.shiftKey;
        let tab;
        try {
          tab = newTab ? page2.open("about:blank", "_blank") : null;
        } catch {
          button2.title = "Could not open a new tab. Try a normal click.";
          return;
        }
        if (newTab && !tab) {
          button2.title = "Allow pop-ups to open a random map in a new tab.";
          return;
        }
        if (tab) {
          tab.opener = null;
          pendingTabs.add(tab);
        }
        busy = true;
        button2.disabled = true;
        button2.setAttribute("aria-busy", "true");
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
            button2.title = "Could not load a random map. Click to try again.";
            label.textContent = "Retry random map";
          }
        } finally {
          busy = false;
          if (scope.active) {
            button2.disabled = false;
            button2.removeAttribute("aria-busy");
            if (label.textContent === "Finding map\u2026") label.textContent = "Random Map";
          }
        }
      }
      function mount() {
        for (const [anchor, node2] of mounts)
          if (!anchor.isConnected || !node2.isConnected) {
            node2.remove();
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
          if (!originalIcon) icon.src = images.maps;
          icon.removeAttribute("id");
          icon.alt = "";
          icon.width = 56;
          icon.height = 56;
          icon.loading = "lazy";
          const { item: button2, title: label } = menuEntry(
            "button",
            "Random Map",
            "Discover a random community map",
            icon,
            maps
          );
          button2.classList.add("bettergeo-random-map-button");
          button2.dataset.bettergeoRandomMap = "";
          button2.type = "button";
          button2.title = "Open a random community map";
          button2.addEventListener("click", (event) => {
            void choose(event, button2, label);
          });
          button2.addEventListener("auxclick", (event) => {
            void choose(event, button2, label);
          });
          insertMenuEntry(anchor, button2);
          mounts.set(anchor, button2);
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
        target: () => document.querySelector(nativeSelector(profile, "headerMainContent")),
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
            const wrapperSelector = nativeSelector(profile, "proBadgeWrapper");
            const pro = header.querySelector(
              `[data-qa="pro-tier"], ${nativeSelector(profile, "proBadge")}`
            );
            const wrapper = pro?.closest(wrapperSelector) ?? header.querySelector(wrapperSelector);
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
      `${nativeStyles().module(profile).cls("proBadge")} bettergeo-restriction-badge`.trim()
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
  function node(tag, native, hook, text) {
    return element(tag, `${native} bgh-${hook}`.trim(), text);
  }
  function historyView(entries, userId, showAll) {
    const icon = image(images.recentDuels, "", 512, 512);
    icon.alt = "recent duels";
    const { root: widget2, body, header, content, styles } = profileWidget2("Recent Duels", icon);
    widget2.classList.add("bettergeo-history");
    widget2.id = "bettergeo-match-history";
    if (!styles.module(historyItem).styled) widget2.classList.add("bettergeo-history-fallback");
    content.classList.add("bettergeo-history-title-line");
    content.append(element("small", "bettergeo-history-credit", "(unhidden by BetterGEO)"));
    const right = node("div", styles.module(widget).cls("rightSlot"), "right-slot");
    const all = nativeButton("View all", styles);
    all.addEventListener("click", showAll);
    right.append(all);
    header.append(right);
    body.replaceWith(carousel2(entries.slice(0, 5), userId, styles));
    return widget2;
  }
  function nativeButton(text, styles) {
    const b = styles.module(button);
    const button2 = node("button", b.cls("button", "variantTertiary", "sizeSmall"), "button");
    button2.type = "button";
    const wrapper = element("div", b.cls("wrapper"));
    wrapper.append(element("span", b.cls("label"), text));
    button2.append(wrapper);
    return button2;
  }
  function carousel2(entries, userId, styles) {
    const c = styles.module(carousel), modal = styles.module(historyModal);
    const widgetCarousel = element("div", styles.module(profileWidget).cls("widgetCarousel"));
    const root = element("div", modal.cls("carouselRoot"));
    const container = node("div", c.cls("carouselContainer"), "carousel");
    const wrapper = node("div", c.cls("carouselWrapper"), "carousel-wrapper");
    const inner = element("div", c.cls("carouselInner"));
    const spread = element("div", c.cls("spread"));
    const item = element("div", modal.cls("carouselItem"));
    item.style.cssText = "width:min(100%,640px);max-width:100%;flex:0 0 auto;margin-inline:auto";
    spread.style.cssText = "width:100%;display:flex;justify-content:center";
    spread.append(item);
    inner.append(spread);
    wrapper.append(inner);
    const indicators = node("div", c.cls("indicatorWrapper"), "indicators");
    let index = 0;
    const left = arrow("Previous duel", "left", styles), right = arrow("Next duel", "right", styles);
    const active = c.cls("active") || "bgh-active";
    const dots = entries.map((entry, position) => {
      const won = entry.duel?.winnerId === userId;
      const dot = node(
        "button",
        c.cls("indicator", won ? "green" : "red"),
        `indicator bgh-${won ? "green" : "red"}`
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
        dot.classList.toggle(active, i === index);
        dot.classList.toggle("bgh-active", i === index);
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
    const c = styles.module(carousel);
    const button2 = node(
      "button",
      c.cls("arrowButton", side === "left" ? "leftArrowButton" : "rightArrowButton"),
      "arrow-button"
    );
    button2.type = "button";
    button2.setAttribute("aria-label", label);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", `${c.cls("arrowSvg")} bgh-arrow-svg`.trim());
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path2 = document.createElementNS(svg.namespaceURI, "path");
    path2.setAttribute(
      "d",
      side === "left" ? "M17,23a1,1,0,0,1-.707-.293l-10-10a1,1,0,0,1,0-1.414l10-10a1,1,0,0,1,1.414,1.414L8.414,12l9.293,9.293A1,1,0,0,1,17,23Z" : "M7,23a1,1,0,0,1-.707-1.707L15.586,12,6.293,2.707A1,1,0,0,1,7.707,1.293l10,10a1,1,0,0,1,0,1.414l-10,10A1,1,0,0,1,7,23Z"
    );
    svg.append(path2);
    button2.append(svg);
    return button2;
  }
  function gameCard(entry, userId, styles = nativeStyles(), showDate = true) {
    const c = styles.module(historyItem), duel = entry.duel;
    const ratings = new Map(
      duel.teams?.flatMap((team2) => team2.players.map((player) => [player.playerId, player]))
    );
    const players = [...entry.players].sort((a, b) => Number(b.id === userId) - Number(a.id === userId)).map((player) => ({
      ...player,
      rating: ratings.get(player.id)?.rankedSystemRating ?? player.rating,
      tier: ratings.get(player.id)?.tier ?? player.tier
    }));
    const outcome = !duel.winnerId ? "tie" : duel.winnerId === userId ? "primaryUserWon" : "opponentWon";
    const item = node("div", c.cls("item", "link"), "item");
    const card = node("div", c.cls("card", outcome), `card bgh-${outcome}`);
    const data = node("div", c.cls("gameData"), "game-data");
    const left = node("div", c.cls("gameDataSide", "gameDataSideLeft"), "side");
    const right = node("div", c.cls("gameDataSide", "gameDataSideRight"), "side");
    const center = node("div", c.cls("centerColumn"), "center");
    const mode = modeNames[duel.gameMode ?? ""];
    if (mode) center.append(node("span", c.cls("mode"), "mode", mode));
    center.append(node("div", c.cls("vs"), "vs", "VS"));
    if (players[0])
      left.append(
        playerColumn(players[0], "left", duel.winnerId, styles),
        avatar2(players[0], styles)
      );
    for (const player of players.slice(1))
      right.append(avatar2(player, styles), playerColumn(player, "right", duel.winnerId, styles));
    data.append(left, center, right);
    const date = duel.rounds?.[0]?.startTime;
    if (date && Number.isFinite(Date.parse(date))) {
      const when = new Date(date);
      item.title = when.toLocaleString();
      if (showDate) {
        const dateSlot = node("span", c.cls("date"), "date");
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
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", `${c.cls("arrow")} bgh-card-arrow`.trim());
    icon.setAttribute("viewBox", "0 0 24 24");
    icon.setAttribute("fill", "none");
    icon.setAttribute("stroke", "currentColor");
    icon.setAttribute("stroke-width", "2");
    icon.setAttribute("stroke-linecap", "round");
    icon.setAttribute("stroke-linejoin", "round");
    icon.setAttribute("aria-hidden", "true");
    const line = document.createElementNS(icon.namespaceURI, "line");
    for (const [key, value] of Object.entries({ x1: "4", y1: "12", x2: "20", y2: "12" }))
      line.setAttribute(key, value);
    const head = document.createElementNS(icon.namespaceURI, "polyline");
    head.setAttribute("points", "13 5 20 12 13 19");
    icon.append(line, head);
    const overlay = link(
      "",
      duelPath(entry.gameId, "summary"),
      `${c.cls("cardOverlay")} bgh-overlay`
    );
    overlay.setAttribute("aria-label", "Game analysis");
    card.append(data, icon, overlay);
    item.append(card);
    return item;
  }
  function nickClasses() {
    const wrapper = document.querySelector('[data-qa="user-card-title"] h1 > div');
    return {
      wrapper: wrapper?.className ?? "",
      nick: wrapper?.querySelector(":scope > span, :scope > a")?.className ?? "",
      flag: wrapper?.querySelector(":scope > img[title]")?.getAttribute("class") ?? ""
    };
  }
  function playerColumn(player, side, winnerId, styles) {
    const c = styles.module(historyPlayer), names = styles.module(historyNick), template = nickClasses();
    const column = node("div", c.cls(side), side);
    const result = !winnerId ? "tie" : player.id === winnerId ? "victory" : "defeat";
    column.append(
      node(
        "span",
        c.cls(result),
        result,
        { tie: "DRAW", victory: "VICTORY!", defeat: "DEFEAT!" }[result]
      )
    );
    const nick = element("div", names.cls("root"));
    const identity = node("div", `${template.wrapper} ${names.cls("identity")}`.trim(), "identity");
    identity.append(
      link(
        player.nick || "Unknown",
        `/user/${encodeURIComponent(player.id)}`,
        `${template.nick} ${names.cls("nick")} bgh-nick`.trim()
      )
    );
    if (player.countryCode && /^[a-z]{2}$/i.test(player.countryCode)) {
      const flag = image(
        `https://flagcdn.com/w40/${player.countryCode.toLowerCase()}.png`,
        template.flag,
        21,
        15
      );
      flag.alt = player.countryCode;
      identity.append(flag);
    }
    nick.append(identity);
    const rating = node("div", c.cls("rating"), "rating");
    if (player.rating !== void 0)
      rating.append(
        node("span", c.cls("ratingLabel"), "rating-label", "Rating"),
        ` ${player.rating}`
      );
    column.append(nick, rating);
    return column;
  }
  function avatar2(player, styles) {
    const c = styles.module(avatar);
    const cell = node("div", styles.module(historyItem).cls("avatarCell"), "avatar-cell");
    const title = node("div", c.cls("titleAvatar"), "avatar");
    const img = node("div", c.cls("titleAvatarImage"), "avatar-image");
    if (player.pin?.url) {
      const portrait = image(
        `/images/resize:fit:96:0/gravity:ce/plain/${player.pin.url}`,
        c.cls("image")
      );
      portrait.loading = "eager";
      portrait.decoding = "async";
      img.append(portrait);
    }
    const border = image(
      `/static/avatars/tiers/low-quality/tier-${Number.isFinite(player.tier) ? player.tier : 100}.webp`,
      `${c.cls("titleAvatarBorder", "titleAvatarBorderImage")} bgh-avatar-border`.trim()
    );
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
    const scope = new Scope(), styles = nativeStyles();
    const layout2 = styles.module(layout), portalStyles = styles.module(overlayPortal), modal = styles.module(overlayModal), history = styles.module(historyModal), list_ = styles.module(historyList), picker = styles.module(select);
    const focused = document.activeElement;
    const dialog = element("dialog", "bettergeo-duels");
    dialog.setAttribute("aria-label", "Recent games");
    if (!history.styled || !modal.styled) dialog.classList.add("bettergeo-history-modal-fallback");
    if (!styles.module(historyItem).styled) dialog.classList.add("bettergeo-history-fallback");
    const overlay = element("div", `${layout2.cls("fullOverlay")} bgh-overlay-root`.trim());
    const portal = element("div", portalStyles.cls("destination"));
    const backlight = element(
      "div",
      `${modal.cls("backlight", "backlightDark", "isAnimated", "blurBackground")} bgh-backlight`.trim()
    );
    const container = element(
      "div",
      `${modal.cls("contentContainer", "alignVerticallyCenter", "isAnimated")} bgh-modal-container`.trim()
    );
    const content = element(
      "div",
      `${modal.cls("content", "sizeLarge", "fullHeight")} bgh-modal-content`.trim()
    );
    const root = element("div", history.cls("root"));
    const header = element("div", `${history.cls("divisionHeader")} bgh-division`.trim());
    const ranked = [...document.querySelectorAll("h2")].find((h) => /^ranked duels$/i.test(h.textContent?.trim() ?? ""))?.closest(nativeSelector(widget, "root"));
    const division = [...ranked?.querySelectorAll("img") ?? []].find(
      (img) => /champion|master|gold|silver|bronze/i.test(img.src)
    );
    const icon = division ? division.cloneNode(false) : element("img");
    if (!division) icon.src = images.rankedDuels;
    icon.removeAttribute("id");
    icon.removeAttribute("class");
    icon.removeAttribute("style");
    icon.removeAttribute("srcset");
    icon.alt = "";
    icon.width = 600;
    icon.height = 600;
    header.append(
      icon,
      element("p", `${history.cls("divisionHeaderText")} bgh-division-text`.trim(), "Recent games")
    );
    const dropdownContainer = element(
      "div",
      `${history.cls("dropdownContainer")} bgh-dropdown-container`.trim()
    );
    const dropdownSlot = element("div", history.cls("dropdown"));
    const dropdown = element("div", picker.cls("dropdown", "variantLightTransparent", "sizeDefault"));
    const select2 = element("select", `${picker.cls("select")} bgh-select`.trim());
    select2.setAttribute("aria-label", "Game mode");
    for (const [value, label] of [
      ["None", "All"],
      ["StandardDuels", "Moving"],
      ["NoMoveDuels", "No move"],
      ["NmpzDuels", "NMPZ"]
    ]) {
      const option = element("option", "", label);
      option.value = value;
      select2.append(option);
    }
    dropdown.append(select2, element("div", picker.cls("arrow")));
    dropdownSlot.append(dropdown);
    dropdownContainer.append(dropdownSlot);
    const spacer2 = element("div", styles.module(spacer).cls("space", "height"));
    spacer2.style.setProperty("--height", "32");
    const leaderboard = element("div", history.cls("leaderboardWrapper"));
    const listRoot = element("div", list_.cls("root"));
    const listContainer = element("div", list_.cls("leaderboardContainer"));
    const list = element("div", list_.cls("list"));
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
      spacer2,
      element("div", `${history.cls("separator")} bgh-separator`.trim()),
      leaderboard
    );
    content.append(root);
    const close = element(
      "button",
      `${modal.cls("closeButton", "closeButtonWhite")} bgh-close`.trim()
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
      const mode = select2.value;
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
    scope.listen(select2, "change", render);
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
      let widget2, closeModal;
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
            widget2?.remove();
            widget2 = void 0;
            closeModal?.();
            return null;
          }
          return container;
        },
        load: (id) => api2.history(id),
        reset() {
          widget2?.remove();
          widget2 = void 0;
          closeModal?.();
        },
        render(data, id, container) {
          if (widget2?.isConnected) {
            if (!widget2.classList.contains("bettergeo-history-fallback") || !nativeStyles().module(historyItem).styled)
              return;
            widget2.remove();
          }
          const entries = data.entries.filter((entry) => entry.duel);
          if (!entries.length) return;
          if (!style.isConnected) document.head.append(style);
          widget2 = historyView(entries, id, () => showAll(entries, id));
          const firstRow = container.querySelector(nativeSelector(profile, "widgetRow"));
          if (firstRow) firstRow.after(widget2);
          else container.prepend(widget2);
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
/* Fallback shell for when GeoGuessr has not loaded the native modal CSS. Targets only
   BetterGEO's own bgh-* hooks, so it keeps working whatever GeoGuessr names its classes. */
.bettergeo-history-modal-fallback .bgh-overlay-root {
  position: fixed;
  inset: 0;
}
.bettergeo-history-modal-fallback .bgh-backlight {
  position: absolute;
  inset: 0;
  background: #000b;
  backdrop-filter: blur(4px);
}
.bettergeo-history-modal-fallback .bgh-modal-container {
  position: absolute;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 24px;
}
.bettergeo-history-modal-fallback .bgh-modal-content {
  width: min(860px, 94vw);
  height: 90vh;
  background: #242044;
  border-radius: 12px;
  overflow: auto;
}
.bettergeo-history-modal-fallback .bgh-division {
  text-align: center;
  padding: 16px;
}
.bettergeo-history-modal-fallback .bgh-division img {
  width: 100px;
  height: 100px;
  object-fit: contain;
}
.bettergeo-history-modal-fallback .bgh-division-text {
  font-size: 24px;
  font-weight: 700;
  font-style: italic;
  margin: 0;
}
.bettergeo-history-modal-fallback .bgh-dropdown-container {
  display: flex;
  justify-content: center;
}
.bettergeo-history-modal-fallback .bgh-select {
  padding: 8px 28px 8px 12px;
  background: #ffffff18;
  color: white;
  border: 1px solid #ffffff30;
  border-radius: 4px;
}
.bettergeo-history-modal-fallback .bgh-select option {
  color: #171426;
}
.bettergeo-history-modal-fallback .bgh-separator {
  border-top: 1px solid #ffffff20;
  margin: 24px 0;
}
.bettergeo-history-modal-fallback .bettergeo-duel-list {
  display: grid;
  gap: 12px;
  padding: 16px;
}
.bettergeo-history-modal-fallback .bgh-close {
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
.bettergeo-history-modal-fallback .bgh-close svg {
  width: 24px;
  height: 24px;
  fill: currentColor;
}
/* Fallback card layout for when the native game-history CSS chunk is not loaded. */
.bettergeo-history-fallback .bgh-button {
  border: 1px solid #ffffff40;
  border-radius: 24px;
  background: transparent;
  color: white;
  padding: 8px 18px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.bettergeo-history-fallback .bgh-carousel {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) 24px;
  align-items: center;
  gap: 8px;
  padding: 16px 8px 12px;
}
.bettergeo-history-fallback .bgh-carousel-wrapper {
  min-width: 0;
}
.bettergeo-history-fallback .bgh-arrow-button {
  background: none;
  border: 0;
  color: white;
  cursor: pointer;
  padding: 4px;
}
.bettergeo-history-fallback .bgh-arrow-svg {
  width: 16px;
  height: 24px;
  fill: currentColor;
}
.bettergeo-history-fallback .bgh-indicators {
  grid-column: 1/-1;
  display: flex;
  justify-content: center;
  gap: 8px;
  padding-top: 8px;
}
.bettergeo-history-fallback .bgh-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  opacity: 0.4;
}
.bettergeo-history-fallback .bgh-green {
  background: #6cb928;
}
.bettergeo-history-fallback .bgh-red {
  background: #c42424;
}
.bettergeo-history-fallback .bgh-indicator.bgh-active {
  opacity: 1;
  outline: 1px solid #fff;
  outline-offset: 2px;
}
.bettergeo-history-fallback .bgh-card {
  position: relative;
  border: 1px solid #ffffff30;
  border-radius: 8px;
  padding: 20px 46px 20px 16px;
  color: white;
}
.bettergeo-history-fallback .bgh-primaryUserWon {
  background: linear-gradient(135deg, #6cb92830, #6cb92815);
  border-color: #6cb92866;
}
.bettergeo-history-fallback .bgh-opponentWon {
  background: linear-gradient(135deg, #c4242430, #c4242415);
  border-color: #c4242466;
}
.bettergeo-history-fallback .bgh-game-data {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 16px;
}
.bettergeo-history-fallback .bgh-side {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-left,
.bettergeo-history-fallback .bgh-right {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-left {
  align-items: flex-end;
  text-align: right;
}
.bettergeo-history-fallback .bgh-right {
  align-items: flex-start;
}
.bettergeo-history-fallback .bgh-victory,
.bettergeo-history-fallback .bgh-defeat,
.bettergeo-history-fallback .bgh-tie {
  font-size: 11px;
  font-weight: 700;
}
.bettergeo-history-fallback .bgh-victory {
  color: #6cb928;
}
.bettergeo-history-fallback .bgh-defeat {
  color: #e44747;
}
.bettergeo-history-fallback .bgh-identity {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.bettergeo-history-fallback .bgh-identity a,
.bettergeo-history-fallback .bgh-button {
  position: relative;
  z-index: 1;
}
.bettergeo-history-fallback .bgh-nick {
  color: white;
  text-decoration: none;
  font-weight: 600;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bettergeo-history-fallback .bgh-rating {
  font-size: 11px;
  color: #ffffff99;
}
.bettergeo-history-fallback .bgh-rating-label {
  color: #ffffff66;
}
.bettergeo-history-fallback .bgh-avatar-cell {
  flex-shrink: 0;
}
.bettergeo-history-fallback .bgh-avatar {
  position: relative;
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
}
.bettergeo-history-fallback .bgh-avatar-image img {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  object-fit: cover;
}
.bettergeo-history-fallback .bgh-avatar-border {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.bettergeo-history-fallback .bgh-center {
  display: flex;
  align-items: center;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}
.bettergeo-history-fallback .bgh-mode {
  font-size: 11px;
  color: #ffffff99;
  font-weight: 600;
}
.bettergeo-history-fallback .bgh-vs {
  font-size: 14px;
  font-weight: 700;
  color: #ffffff66;
}
.bettergeo-history-fallback .bgh-card-arrow {
  position: absolute;
  right: 14px;
  top: 50%;
  width: 20px;
  height: 20px;
  transform: translateY(-50%);
  opacity: 0.7;
}
.bettergeo-history-fallback .bgh-overlay {
  position: absolute;
  inset: 0;
  border-radius: inherit;
}
@media (max-width: 600px) {
  .bettergeo-history-fallback .bgh-game-data {
    gap: 6px;
  }
  .bettergeo-history-fallback .bgh-side {
    gap: 4px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .bettergeo-history-fallback .bgh-nick {
    max-width: 72px;
  }
  .bettergeo-history-fallback .bgh-card {
    padding: 12px 36px 12px 6px;
  }
}
`;

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

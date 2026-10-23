import { build, context } from 'esbuild';
import { readFile } from 'node:fs/promises';
const { version } = JSON.parse(await readFile(new URL('./package.json', import.meta.url)));
const options = {
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  target: 'es2022',
  outfile: 'dist/BetterGEO.user.js',
  legalComments: 'none',
  banner: {
    js: `// ==UserScript==
// @name         BetterGEO
// @namespace    BetterGEO
// @version      ${version}
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
// @connect      elorace.lonanche.workers.dev
// @noframes
// ==/UserScript==`,
  },
};
if (process.argv.includes('--watch')) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('Watching src/ → dist/BetterGEO.user.js');
} else await build(options);

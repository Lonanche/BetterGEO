[![Install BetterGEO](https://img.shields.io/badge/Install-BetterGEO-9b87f5?style=for-the-badge)](https://raw.githubusercontent.com/lonanche/BetterGEO/main/dist/BetterGEO.user.js)

# BetterGEO

- **Recover old duel summaries:** fixes old duel summaries that show “Game not found”.
- **Map history result links:** adds links to game results in the My Games score history on each map page.
- **Unhide recent duels:** restores the Recent Duels panel when a player has hidden it on their profile. Includes a View all panel with All, Moving, No move, and NMPZ filters.
- **Profile ban and suspension status:** shows a red badge for active bans or suspensions. Hover for suspension time remaining.
- **Online race leaderboard tags:** adds region and projected regional place (for example EMEA #1), matched by profile ID from the public [elorace API](https://elorace.lonanche.workers.dev/api/v1/standings). Tooltips show projected and official points, weekly games, the snapshot time, and any stale/previous-week warning. Weekly projections enforce the 10-game minimum.
- **ELO Race leaderboard:** uses the same anonymous, shared dataset for participant identities, current Elo and projected regional ranks, with All/APAC/EMEA/Americas filters. No Google Sheets requests or client-side GeoGuessr leaderboard scanning. The Worker updates every five minutes; the refresh button reloads its shared cache rather than forcing collection. Missing Elo stays N/A. Stale snapshots remain visible with a warning; request failures show Retry. Tampermonkey requires access to elorace.lonanche.workers.dev. No GeoGuessr cookie is sent to this public API.

- **Country ranked stats:** displays a player's best and worst countries on their profile.
- **Random map in Singleplayer:** adds Random Map inside the Singleplayer dropdown.
- **Tournaments in Multiplayer:** adds a shortcut to multiplayer tournaments.

Toggle features through **Tampermonkey → BetterGEO settings**.

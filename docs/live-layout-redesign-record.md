# Poizen Lounge Live: layout redesign record

Branch: `live-layout-redesign` (not merged to `main`)
Date: 2026-10-22
Requested by: PoiZen / MuTe Poi (Maciel's Inc.)
Files: `index.html`, `settings.js` (new), `mobile.js`, `tests/settings.test.cjs` (new), `tests/mobile.test.cjs`

## What was asked (from the sketch and messages)
1. Remove the left sidebar. Header stays locked. Logo and "Poizen Lounge" move to the footer by the disclaimers.
2. Tabs become icon-only, in their own colours, hanging in a smile-shaped "necklace", centred in the header.
3. Today/Week/Month/All-time cells plus board totals scroll like a stock ticker, full width, as the bottom row of the header, above Live Sweat.
4. Live Sweat: narrower, centred, shorter. A carousel of games that have your picks.
5. The rest of the board fills the first screen so there is less scrolling.
6. Lounge Chat button is the logo only; chat opens as before.
7. Settings page reached from the bottom of the page. Options: tuck Live Sweat behind the banner, auto-hide the banner, hide the necklace until hover.
8. Glass-style cards, fewer rounded bubbles. "Think outside the box" on how the cards are displayed.

## What was built
| Area | Result |
|---|---|
| Header | Necklace centred in row 1 (icons in their colours, smile curve). Ticker is a full-width row 2. Logo moved to footer. |
| Ticker | Loops at any screen width. Speed setting (slow, normal, fast). Totals can be switched off. |
| Live Sweat | Shorter carousel, auto-rotates (4/7/10/15 s), pauses on hover or focus. Game context follows the current game. |
| Dashboard | Open slips, Game context + Activity tape, Contracts in three columns sized to the first screen. Columns scroll inside and fade at the bottom. |
| Settings (footer button, `#settings`) | Tuck Live Sweat, auto-hide banner, hide necklace until hover, ticker speed and totals, carousel auto-rotate and time, Glass cards, vibe and team colours, alerts, Restore defaults. Saved in localStorage key `pz_settings`. |
| Tucked Live Sweat | Slim tab under the banner on every page; drops the carousel down; Esc or an outside click closes it. |
| Banner auto-hide | Slides away on scroll down, returns on scroll up or from a faint handle at top centre. Desktop only. |
| Necklace hide | Fades out; returns when the pointer is over its area or it has keyboard focus. Desktop only. |
| Glass cards (on by default) | Frosted cards over a soft glow, flat rows, no boxes inside boxes. Dashboard is one sheet. Live page games are open rows on one sheet. Turn off for the old solid cards and card grid. |
| Chat | Logo-only button; chat itself unchanged. |

## Test evidence
Environment: Linux sandbox, Chromium via Playwright, page served locally. ESPN and other outside sites are blocked in the sandbox, so every visual check used three mocked NBA games.

| Check | Result |
|---|---|
| `npm test` (node --test) | 66 of 66 pass (AUTOMATED PASS; covers settings logic, ticker speed and looping, existing suites) |
| JS syntax check of the inline scripts | Pass |
| Page errors in the browser console during all runs | None |
| Header layout at 1920x1080 | Necklace centred, ticker full width, header 115 px |
| Dashboard fits the first screen at 1920x1080, 2560x1080, 3440x1440, 1366x768 | Pass (dashboard bottom stayed inside the viewport) |
| Carousel next/prev, survives a re-render, auto-rotate, pause | Pass |
| Necklace click changes tab | Pass |
| Ticker speed measured | slow about 10 px/s, normal about 20, fast about 40; totals switch removes totals cells |
| Tucked Live Sweat: tab shows, drop opens, Esc closes, Game context follows the carousel | Pass |
| Necklace hide: hidden, visible on hover, hidden again after leaving | Pass |
| Banner auto-hide: hides on scroll, handle shows it, hides again, scroll up shows | Pass |
| Settings via footer button, each setting saves and survives a reload, Restore defaults (two taps) | Pass |
| Glass on and off, Midnight and Daylight themes | Pass (visual check by screenshot) |
| Phone width (390 px): no sideways scroll, necklace hidden, bottom bar kept, game rows stack to two lines | Pass (visual check) |
| Tablet width (1000-1100 px) | Pass, no sideways scroll |

## Problems found and fixed along the way
- Mobile quick-action buttons landed inside the carousel: fixed with a marker after the hero.
- Ticker did not loop on very wide screens: fixed (always duplicates enough copies).
- A test referenced a function out of scope: fixed.
- Header grid put the ticker on a second row by accident: fixed with explicit grid rows.
- Banner hid only partly because the same variable drove its own offset: fixed with a separate height variable.
- Round 2 header put the necklace on the left and merged ticker into row 1; the owner did not ask for this. Reverted: necklace centred, ticker full-width row 2.
- The glow behind the glass cards did not show (painted under the body background): moved onto the body background.
- Hero text centred oddly (column flex direction): fixed.

## Not tested
- Real ESPN data, real team logos and headshots, real slips, live scoring updates (sandbox cannot reach ESPN).
- Vegas and team-colour themes, and the playoffs theme, with Glass on.
- A real phone or tablet with touch (only emulated sizes).
- Safari and Firefox (Chromium only). `backdrop-filter` and `color-mix` need current browsers.
- Games, Pick6, My Lounge and other tabs in Glass mode beyond a quick look (card glass styling applies, but the sheet-and-rows layout is Live page only).
- Performance with a full slate (many cards with blur).

## Open questions for the owner
- Keep the phone bottom bar as it is?
- Should the sheet-and-rows layout also be used on Pick6, Games and My Lounge?
- Do you want the Live page to show the full carousel and the dashboard together, or keep tucking Live Sweat as the default?

## Owner actions
- Test the branch on the real page with real data on your PC and phone.
- Say "merge it" if you approve. Nothing is merged to `main` yet, so the live site is unchanged.

## Physical acceptance checklist
1. Header: necklace centred, ticker full width under it, Live Sweat below. Header height feels like before.
2. Hover the necklace area with the setting on: icons appear, then fade when you leave.
3. Scroll with banner auto-hide on: banner leaves and returns.
4. Tuck Live Sweat: tab appears under the banner, drops the carousel, closes with Esc.
5. Dashboard shows slips, game context, contracts without scrolling the page.
6. Games board rows show the right teams, scores, picks, weather; clicking a row opens the game.
7. Settings: every switch works and survives a reload; Restore defaults works.
8. Glass off gives the old look.
9. Phone: nothing overflows; bottom bar works.
10. Chat button opens chat as before.

## Release and rollback
Commits on the branch (oldest first):
- `a1cccde` round 1: necklace, ticker totals, carousel, logo-only chat
- `1fbf541` round 2: dashboard, Settings page, tuck and hide options
- `2675940` header back to centred necklace, glass cards
- `3922e3f` lower board, footer and dashboard polish
- `d3b4afe` sheets instead of cards

SHA-256 at `d3b4afe`:
```
b9db2fe6b03092fd003be22870e28aa4d0b0f3445e4a949dae6594440f9607c2  index.html
1878821a7ce08de5d6580b143f1e1ba6992fc77c99711d1046ae8b59e8cc6403  settings.js
1952689e683d4cd4b6a5f7e87971eb1014e6ef3b5c5b15a01096f006374c8ab3  mobile.js
3fdac3e260ad44f1111a6e49b79d8d3274eeb2b7fb589f083c5f9415153857b5  tests/settings.test.cjs
3aa519be1eec278a5d2072967ace1096d50521d02a1215bed3d79dff8dc1c6fc  tests/mobile.test.cjs
```

Run locally: `npm test`, then `python3 -m http.server 8765` in the repo folder and open `http://localhost:8765/`.
Stop: close the server (Ctrl+C).
Restart or recover: reload the page. A user whose settings go odd can clear the `pz_settings` key (or tap Restore defaults).
Rollback: `main` is untouched. To undo after a merge, `git revert -m 1 <merge commit>` or redeploy the previous `main` commit `6634f3d`.
A pre-change backup of the whole repo is on the sandbox disk only (`/home/claude/backups`), not in GitHub.

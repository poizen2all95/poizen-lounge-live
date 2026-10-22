# NFL Clubhouse design QA

final result: passed

## Visual truth and capture

- Selected target: option 2, `C:/Users/Owner/.codex/generated_images/01a15b50-e5b7-7bf0-9a9b-acf7b670099a/exec-ed30052c-03d2-4039-97bb-b8791a213a9e.png`.
- Source pixels: 1487 × 1058. This is a generated desktop concept; it has no browser CSS size or intrinsic device density.
- Implementation: Edge, `http://127.0.0.1:8897/?team=nfl-lv#live`, NFL filter, Tickets selected, first actual ticket expanded. Local preview uses a public data snapshot and a local-only paid-layout fixture; production membership rules are unchanged.
- CSS viewport: 1487 × 1058, devicePixelRatio 1. CUA saved a 1472 × 1047 screenshot. Full-view comparison fits each image to the same 1100-pixel width; the small capture scaling is not treated as layout drift.
- Evidence folder: `C:/Users/Owner/Documents/Codex/2026-10-20/ok-t/work/theme-audit/`.
- Rendered screenshot: `clubhouse-raiders-reference-size.png`.
- Combined full-view evidence, opened and compared: `clubhouse-comparison.png`.
- Combined readable row-region evidence, opened and compared: `clubhouse-rows-comparison.png`.
- Responsive evidence: `clubhouse-mobile-raiders.png`, `clubhouse-mobile-players-after.png`; 390 × 844 CSS viewport. Final document/body width is 375 pixels inside the 390-pixel viewport, with the browser scrollbar; no horizontal overflow.
- Additional states: `clubhouse-commanders.png`, `clubhouse-players.png`, `clubhouse-sweat.png`.

## Findings and required fidelity surfaces

No actionable P0/P1/P2 findings remain after the iterations below.

1. **Fonts and typography:** condensed display lettering, substantial city/team hierarchy, readable names and targets, and restrained body text match the editorial direction. Names are 26px and targets 25px on desktop, with smaller responsive sizes. Secondary player information was increased to 11–12px. Long Commanders lettering fits; long player names wrap on phones. The app's existing display font is retained rather than attempting to reproduce lettering embedded in the generated mock.
2. **Spacing and layout rhythm:** the crest/stadium masthead, compact left navigation, Tickets/Players selector, league/status controls, ticket list, game panel, and totals reproduce the selected composition. Existing record ticker, header, Settings, receipt details, contract workspace, and alerts remain available. Their presence intentionally moves the ticket list below the concept's starting position. The real three-leg ticket determines row count and height, rather than the concept's four invented picks.
3. **Colors and tokens:** warm paper, dark ink, subtle separators, minimal shadow, and authentic team accents replace the earlier generic skins. Palette checks cover all 32 teams at contrast ratio 4.5 or better for the key ink/accent pairings. Outcome colors remain green/red and live state amber independently of team identity. League cues remain compact.
4. **Image quality and asset fidelity:** every team has a real official crest and a real home-stadium photo, stored locally. The Raiders photo is an authentic Allegiant exterior and is intentionally different from the generated reference. Player photos use the existing athlete identity feed. No logo or stadium is approximated with CSS art or a substitute drawing. All 62 images decode, with all manifest paths present. Some source venue photographs include historical sponsor signage; captions use the manifest's current venue identity.
5. **Copy and content:** all player names, jerseys, lines, projections, game context, entries, and returns use existing app data. The concept's fabricated odds, records and example picks were not copied. Unknown stats and unlinked venue selections remain explicitly unknown. Headers now follow the selected lifecycle filter instead of always saying Open tickets.

## Comparison history and fixes

- First desktop/functional pass: restored prediction history, sell/hold tools, alert preferences and activity tape; corrected dead/settling lifecycle priority; scoped player league/live filters; separated identical lines across different games; restored hit/miss numeric colors; cleared stale league filters. Regression fixtures cover these changes.
- Focused desktop visual pass: secondary player labels were too small against the reference. Increased player name, target, jersey, stat and status sizes, then captured and compared the revised full-view and row crops above.
- First mobile pass (`clubhouse-mobile-players.png`): status, matchup, chance and action were squeezed into one line, filter labels clipped, and totals collided. Stacked the mobile filter labels; placed player status/context on separate rows; separated total values and captions. Revised evidence is `clubhouse-mobile-players-after.png` and the final mobile capture.
- Latest-main integration: retained commit 3321ffd's Settings, ticker, necklace and Sweat behavior for non-NFL themes. NFL themes use the selected sidebar, with the same destinations plus Settings. Tucked Sweat starts closed in the NFL view so it does not obscure the masthead. Access/theme reconciliation runs before navigation, avoiding a stale NFL rail when access expires.
- Post-merge mobile pass: the new footer's minimum grid tracks caused 736px document width at a 390px viewport. Scoped the NFL phone footer to one flexible column and removed redundant home shortcuts from this layout. Recapture confirms 375px document width and usable persistent navigation.
- Dropdown/game-watch review: scoped next game to the selected league, including mixed tickets. Refresh deferral now expires after 12 seconds, clears on change/Escape/blur, and supports keyboard opening, avoiding an indefinitely paused live view.

## Interaction and implementation checklist

- [x] Tickets/Players selector, NFL filtering, first-ticket expansion and player aggregation inspected in Edge.
- [x] Player Game details opens the correct NE @ CHI game with context and linked picks.
- [x] Open Sweat opens the themed full-screen watch; Close returns to Live.
- [x] Raiders, long-name Commanders and non-NFL Bulls switching inspected; Bulls has no clubhouse masthead or visible sidebar and retains its necklace.
- [x] Phone filter text, totals, player rows, fixed navigation and horizontal overflow checked.
- [x] Browser error log checked; no captured console errors in the inspected local states.
- [x] All 32 asset identities and palette pairs covered by automated checks.
- [x] Full source/implementation comparison and readable row-region comparison opened together.

## Follow-up polish and limits

- P3: replace historical sponsor-sign photographs with newer official photographs as they become available; the physical venues are correct.
- This theme work does not establish that every imported market has a stats feed. Existing unsupported/unlinked labels remain visible, and projections remain estimates.
- Live hit/miss states are verified by deterministic fixtures because the browser data at inspection time was pregame. No game results were fabricated for screenshots.

## Deployment receipt

- Rebased on concurrent main update e299984, preserving its player-line Sweat overlay. Full suite after rebase: 87 passed, 0 failed.
- Published implementation commit: `390dec05a7ff8ed511b3c6512e609abc23c960a9`.
- GitHub Pages run `39845449151`: completed successfully.
- Opened the deployed Raiders theme in the existing signed-in Edge session. Authentic crest/stadium, Tickets/Players controls and NFL filter rendered; NFL selected 12 tracked tickets and NE @ CHI in next game. Captured error log was empty.
- Production evidence: `C:/Users/Owner/Documents/Codex/2026-10-20/ok-t/work/theme-audit/clubhouse-published.png`.

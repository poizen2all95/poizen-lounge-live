# NFL Clubhouse Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Apply the user-selected option 2 editorial design across all 32 NFL team themes, preserving live Lounge behavior.

**Architecture:** Add a small shared theme module with pure palette/identity/render helpers and a scoped stylesheet. Existing applyTeam access checks remain authoritative. A rendered masthead uses authentic local crests and stadium photos from a separate verified asset manifest; league/outcome colors remain independent.

**Tech Stack:** Existing vanilla HTML/CSS/JavaScript, Node test runner, existing jsdom.

**Spec:** User selected the second displayed concept; reference C:/Users/Owner/.codex/generated_images/01a15b50-e5b7-7bf0-9a9b-acf7b670099a/exec-ed30052c-03d2-4039-97bb-b8791a213a9e.png. Design context ../theme-audit/design-directions.md (outside repository).

## Global Constraints

- All 32 NFL teams receive recognizable crest, city/name, restrained brand accents and stadium identity.
- Matchup identity, player names, jerseys, stats, real odds, payout and outcomes always come from existing live data; concept placeholder odds/records are not copied.
- Preserve theme selection persistence, Pro gating, auth expiry reset, mobile navigation and all existing app sections.
- Follow selected warm-paper editorial design: large masthead, simple separators, restrained elevation and readable list rows.
- Do not touch unrelated uncommitted changes in the primary checkout.

## Review Focus

- Black/silver, pale gold, yellow and white team palettes need adequate text contrast.
- Missing or failed image sources must leave readable team identity and a usable layout.
- Team changes and expired access must update/clear mastheads and scoped colors together.
- Mobile masthead must remain compact; no horizontal overflow or obscured controls.
- Numeric live states remain legible without taking on arbitrary team colors.

### Task 1: Verified assets and pure theme helpers

**Files:** nfl-theme-assets.js, assets/nfl-teams/, clubhouse.js, tests/clubhouse.test.cjs.

- [x] Collect real team logos and home stadium images with source metadata.
- [x] Write tests for all 32 team identities, contrast, invalid IDs, safe URLs and missing-photo fallback.
- [x] Implement pure palette/contrast/team/render helpers to pass tests.

### Task 2: Editorial presentation and integration

**Files:** clubhouse.css, index.html, tests/clubhouse.test.cjs.

- [x] Add a visible masthead, coordinated light surfaces and team accents; render live page as readable ticket list with compact game context.
- [x] Integrate through existing applyTeam/render paths; clear styling on no-team/access loss; preserve non-NFL themes.
- [x] Extend visual treatment to Pick6, Games and Sweat without changing ticket data or alert behavior.
- [x] Run existing access/mobile tests and complete suite.

### Task 3: Browser verification and delivery

**Files:** design-qa.md and screenshot evidence in work/theme-audit/.

- [x] Start local preview, inspect Raiders plus contrasting NFL palettes in Edge, exercise navigation/theme changes and Sweat.
- [x] Compare selected reference and implementation; correct P0/P1/P2 layout, type, image and contrast differences.
- [x] Publish authorized changes after checks pass, verify Pages deployment and leave the result open.

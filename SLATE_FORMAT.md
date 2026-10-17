# Poizen Lounge — data for AI assistants

This folder powers PoiZen's public live picks board: https://poizen2all95.github.io/poizen-lounge-live/

If you are an AI helping PoiZen review picks, read these files:

- `slate.json` — the current week's tickets: Pick6 entries (legs, lines, multipliers, entry, payouts), first-TD bets, the 2+ TD scalp plan, and research lines. The live board reads its copy from a realtime database; this file is synced from it.
- `results.json` — recorded results used for the daily / weekly / monthly / all-time record.
- `engine.js` — how the board grades legs from ESPN box scores (market definitions are in `MARKETS`).

## Market keys

NFL: `pass_yds`, `pass_td`, `pass_att`, `completions`, `rush_yds`, `rush_att`, `rec_yds`, `receptions`, `rush_rec_yds`, `pass_rush_yds`, `anytime_td` (rush + rec TDs), `interceptions`
MLB: `hrr` (hits + runs + RBIs), `hits`, `runs`, `rbis`, `home_runs`, `batter_ks`, `pitcher_ks`, `pitcher_outs`

A leg is `{ "player": "<key in players>", "market": "<market key>", "line": 99.5, "dir": "over" | "under", "mult": "1.1x" }`.
`dir` defaults to `over` (DraftKings "MORE").

## Live data sources the board uses (all public ESPN endpoints)

- Scoreboard: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard`
- Game box score + scoring plays: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=<id>`
- Player game log: `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/<espnId>/gamelog`
- League injury report: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries`

When suggesting picks, cite the game log numbers you used and flag any leg whose season average does not beat its line — that is one of PoiZen's rules.

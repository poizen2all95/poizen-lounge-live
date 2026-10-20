/* Poizen Lounge — grading engine (pure functions, no DOM).
   Works in the browser (window.PZE) and in Node (module.exports) for tests.
   Data source: ESPN public site API (scoreboard + game summary). */
(function (root) {
  'use strict';

  const ESPN = {
    scoreboard: (sport) => `https://site.api.espn.com/apis/site/v2/sports/${sportPath(sport)}/scoreboard`,
    summary: (sport, id) => `https://site.api.espn.com/apis/site/v2/sports/${sportPath(sport)}/summary?event=${id}`,
    gamelog: (id) => `https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/${id}/gamelog`,
    injuries: () => 'https://site.api.espn.com/apis/site/v2/sports/football/nfl/injuries',
    search: (q) => `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(q)}&type=player&limit=6`,
  };
  function sportPath(s) { return ({mlb:'baseball/mlb',nba:'basketball/nba',wnba:'basketball/wnba',nhl:'hockey/nhl',cfb:'football/college-football'})[s] || 'football/nfl'; }

  // ---------- names ----------
  function norm(name) {
    return String(name || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[.'’`]/g, '')
      .replace(/-/g, ' ')
      .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, ' ')
      .replace(/[^a-z ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ---------- odds ----------
  function americanToDecimal(odds) {
    const n = Number(String(odds).replace('+', ''));
    if (!isFinite(n) || n === 0) return null;
    return n > 0 ? 1 + n / 100 : 1 + 100 / Math.abs(n);
  }

  // ---------- number parsing ----------
  function num(v) {
    if (v === undefined || v === null || v === '' || v === '-' || v === '--') return 0;
    const n = Number(v);
    return isFinite(n) ? n : 0;
  }
  function ipToOuts(ip) { // "5.2" -> 17 outs
    const [w, p] = String(ip || '0').split('.');
    return num(w) * 3 + num(p);
  }

  // ---------- summary parsing ----------
  function gameStatus(summary) {
    const comp = summary && summary.header && summary.header.competitions && summary.header.competitions[0];
    const st = (comp && comp.status) || {};
    const t = st.type || {};
    return {
      state: t.state || 'pre',               // pre | in | post
      name: t.name || '',
      completed: !!t.completed,
      detail: t.shortDetail || t.detail || '',
      period: st.period || 0,
      clock: st.displayClock || '',
      postponed: /POSTPONED|CANCELED|CANCELLED|SUSPENDED/.test(t.name || ''),
    };
  }

  function emptyStats() {
    return {
      passYds: 0, passTD: 0, passAtt: 0, completions: 0, ints: 0,
      rushYds: 0, rushTD: 0, rushAtt: 0,
      rec: 0, recYds: 0, recTD: 0, targets: 0,
      // mlb batting
      h: 0, r: 0, rbi: 0, hr: 0, bb: 0, k: 0, ab: 0,
      // mlb pitching
      pK: 0, pOuts: 0, pER: 0, pH: 0,
      // nba
      pts: 0, reb: 0, ast: 0, threes: 0, stl: 0, blk: 0, tov: 0, min: 0,
    };
  }

  function parseBox(summary, sport) {
    const players = {}; // key: espn id
    const byName = {};  // norm name -> id
    const teams = (summary && summary.boxscore && summary.boxscore.players) || [];
    for (const t of teams) {
      const team = t.team && t.team.abbreviation;
      for (const cat of t.statistics || []) {
        const keys = cat.keys || [];
        const kind = cat.name || cat.type;
        for (const a of cat.athletes || []) {
          const id = String(a.athlete && a.athlete.id);
          const name = a.athlete && a.athlete.displayName;
          if (!players[id]) players[id] = { id, name, team, stats: emptyStats(), cats: [] };
          const p = players[id];
          p.cats.push(kind);
          byName[norm(name)] = id;
          const v = {};
          keys.forEach((k, i) => { v[k] = (a.stats || [])[i]; });
          const s = p.stats;
          if (sport === 'mlb') {
            if (kind === 'batting') {
              s.h += num(v.hits); s.r += num(v.runs); s.rbi += num(v.RBIs); s.hr += num(v.homeRuns);
              s.bb += num(v.walks); s.k += num(v.strikeouts); s.ab += num(v.atBats);
            } else if (kind === 'pitching') {
              s.pK += num(v.strikeouts); s.pER += num(v.earnedRuns); s.pH += num(v.hits);
              s.pOuts += ipToOuts(v['fullInnings.partInnings']);
            }
          } else if (sport === 'nba') {
            s.pts += num(v.points); s.reb += num(v.rebounds); s.ast += num(v.assists);
            s.threes += num(String(v['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] || '0-0').split('-')[0]);
            s.stl += num(v.steals); s.blk += num(v.blocks); s.tov += num(v.turnovers); s.min += num(v.minutes);
          } else {
            if (kind === 'passing') {
              const ca = String(v['completions/passingAttempts'] || '0/0').split('/');
              s.completions += num(ca[0]); s.passAtt += num(ca[1]);
              s.passYds += num(v.passingYards); s.passTD += num(v.passingTouchdowns); s.ints += num(v.interceptions);
            } else if (kind === 'rushing') {
              s.rushAtt += num(v.rushingAttempts); s.rushYds += num(v.rushingYards); s.rushTD += num(v.rushingTouchdowns);
            } else if (kind === 'receiving') {
              s.rec += num(v.receptions); s.recYds += num(v.receivingYards); s.recTD += num(v.receivingTouchdowns);
              s.targets += num(v.receivingTargets);
            }
          }
        }
      }
    }
    return { players, byName };
  }

  // Scorer of a touchdown play, from ESPN text like
  // "J.K. Dobbins 4 Yd Rush (Wil Lutz Kick)" or "Rashid Shaheed 42 Yd pass from Sam Darnold (...)"
  function tdScorerFromText(text) {
    const m = String(text || '').match(/^(.+?)\s+-?\d+\s+(Yd|Yard|Yds)/i);
    if (m) return m[1].trim();
    const m2 = String(text || '').match(/^([^\d(]+?)\s+\d/);
    return m2 ? m2[1].trim() : null;
  }

  function scoringPlays(summary) {
    return ((summary && summary.scoringPlays) || []).map((p) => {
      const isTD = ((p.scoringType && p.scoringType.abbreviation) || (p.type && p.type.abbreviation)) === 'TD';
      const scorer = isTD ? tdScorerFromText(p.text) : null;
      return {
        isTD, scorer, scorerNorm: scorer ? norm(scorer) : null,
        text: (p.text || '').trim(), team: p.team && p.team.abbreviation,
        period: p.period && p.period.number, clock: p.clock && p.clock.displayValue,
      };
    });
  }

  function parseGame(summary, sport) {
    const status = gameStatus(summary);
    const box = parseBox(summary, sport);
    const plays = sport === 'nfl' ? scoringPlays(summary) : [];
    const firstTD = plays.find((p) => p.isTD) || null;
    const comp = summary && summary.header && summary.header.competitions && summary.header.competitions[0];
    const score = {};
    for (const c of (comp && comp.competitors) || []) score[c.team && c.team.abbreviation] = num(c.score);
    return { sport, status, box, plays, firstTD, score };
  }

  // ---------- markets ----------
  const MARKETS = {
    // NFL
    pass_yds: { sport: 'nfl', label: 'Passing Yards', short: 'Pass Yds', f: (s) => s.passYds },
    pass_td: { sport: 'nfl', label: 'Passing TDs', short: 'Pass TD', f: (s) => s.passTD },
    pass_att: { sport: 'nfl', label: 'Pass Attempts', short: 'Pass Att', f: (s) => s.passAtt },
    completions: { sport: 'nfl', label: 'Completions', short: 'Comp', f: (s) => s.completions },
    rush_yds: { sport: 'nfl', label: 'Rushing Yards', short: 'Rush Yds', f: (s) => s.rushYds },
    rush_att: { sport: 'nfl', label: 'Rush Attempts', short: 'Carries', f: (s) => s.rushAtt },
    rec_yds: { sport: 'nfl', label: 'Receiving Yards', short: 'Rec Yds', f: (s) => s.recYds },
    receptions: { sport: 'nfl', label: 'Receptions', short: 'Rec', f: (s) => s.rec },
    rush_rec_yds: { sport: 'nfl', label: 'Rush + Rec Yards', short: 'Rush+Rec Yds', f: (s) => s.rushYds + s.recYds },
    pass_rush_yds: { sport: 'nfl', label: 'Pass + Rush Yards', short: 'Pass+Rush Yds', f: (s) => s.passYds + s.rushYds },
    anytime_td: { sport: 'nfl', label: 'Rush + Rec TDs', short: 'TDs', f: (s) => s.rushTD + s.recTD },
    interceptions: { sport: 'nfl', label: 'Interceptions Thrown', short: 'INT', f: (s) => s.ints },
    // MLB
    hrr: { sport: 'mlb', label: 'Hits + Runs + RBIs', short: 'H+R+RBI', f: (s) => s.h + s.r + s.rbi },
    hits: { sport: 'mlb', label: 'Hits', short: 'Hits', f: (s) => s.h },
    runs: { sport: 'mlb', label: 'Runs', short: 'Runs', f: (s) => s.r },
    rbis: { sport: 'mlb', label: 'RBIs', short: 'RBI', f: (s) => s.rbi },
    home_runs: { sport: 'mlb', label: 'Home Runs', short: 'HR', f: (s) => s.hr },
    batter_ks: { sport: 'mlb', label: 'Batter Strikeouts', short: 'K', f: (s) => s.k },
    pitcher_ks: { sport: 'mlb', label: 'Pitcher Strikeouts', short: 'Ks', f: (s) => s.pK },
    pitcher_outs: { sport: 'mlb', label: 'Pitching Outs', short: 'Outs', f: (s) => s.pOuts },
    // NBA
    pts: { sport: 'nba', label: 'Points', short: 'Pts', f: (s) => s.pts },
    reb: { sport: 'nba', label: 'Rebounds', short: 'Reb', f: (s) => s.reb },
    ast: { sport: 'nba', label: 'Assists', short: 'Ast', f: (s) => s.ast },
    threes: { sport: 'nba', label: '3-Pointers Made', short: '3PM', f: (s) => s.threes },
    pra: { sport: 'nba', label: 'Pts + Reb + Ast', short: 'PRA', f: (s) => s.pts + s.reb + s.ast },
    pr: { sport: 'nba', label: 'Pts + Reb', short: 'P+R', f: (s) => s.pts + s.reb },
    pa: { sport: 'nba', label: 'Pts + Ast', short: 'P+A', f: (s) => s.pts + s.ast },
    ra: { sport: 'nba', label: 'Reb + Ast', short: 'R+A', f: (s) => s.reb + s.ast },
    stl: { sport: 'nba', label: 'Steals', short: 'Stl', f: (s) => s.stl },
    blk: { sport: 'nba', label: 'Blocks', short: 'Blk', f: (s) => s.blk },
    stocks: { sport: 'nba', label: 'Steals + Blocks', short: 'Stl+Blk', f: (s) => s.stl + s.blk },
    tov: { sport: 'nba', label: 'Turnovers', short: 'TO', f: (s) => s.tov },
  };

  function findPlayer(game, ref) {
    if (!game) return null;
    const { players, byName } = game.box;
    if (ref.espnId && players[String(ref.espnId)]) return players[String(ref.espnId)];
    const id = byName[norm(ref.name)];
    if (id) return players[id];
    // last-name + team fallback ("Jose Ramirez" vs "José Ramírez" handled by norm; this covers "Kenneth Walker" vs "Kenneth Walker III")
    const n = norm(ref.name);
    const hit = Object.values(players).find((p) => {
      const pn = norm(p.name);
      return (pn.startsWith(n) || n.startsWith(pn)) && (!ref.team || p.team === ref.team);
    });
    return hit || null;
  }

  /* Grade one prop leg.
     leg: { name, espnId, team, market, line, dir: 'over'|'under' }
     game: parseGame() result or null (not started / not found)
     returns { state, value, line, progress, note }
       state: scheduled | live | hit | miss | dnp | void */
  function gradeLeg(leg, game) {
    const line = Number(leg.line);
    if (leg.venueOnly) return { state: 'scheduled', value: null, line, progress: 0, note: 'Awaiting venue settlement; automatic stats unavailable' };
    const dir = leg.dir === 'under' ? 'under' : 'over';
    const mk = MARKETS[leg.market];
    if (!mk) return { state: 'error', value: null, line, progress: 0, note: `Unknown market "${leg.market}"` };
    if (!game || game.status.state === 'pre') return { state: 'scheduled', value: 0, line, progress: 0, note: '' };
    if (game.status.postponed) return { state: 'void', value: null, line, progress: 0, note: 'Game postponed — check DraftKings void rules' };
    const p = findPlayer(game, leg);
    const value = p ? mk.f(p.stats) : 0;
    const final = game.status.state === 'post';
    const progress = line > 0 ? Math.min(1, value / line) : (value > 0 ? 1 : 0);
    if (dir === 'over') {
      if (value > line) return { state: 'hit', value, line, progress: 1, note: final ? 'Final' : 'Cleared' };
      if (final) {
        if (!p) return { state: 'dnp', value: 0, line, progress: 0, note: 'No stats recorded — may be void (DNP). DraftKings rules decide.' };
        return { state: 'miss', value, line, progress, note: 'Final' };
      }
      return { state: 'live', value, line, progress, note: p ? `Needs ${fmt(line - value + (Number.isInteger(line) ? 1 : 0.5))} more` : 'No stats yet' };
    }
    // under
    if (value > line) return { state: 'miss', value, line, progress: 1, note: 'Went over' };
    if (final) {
      if (!p) return { state: 'dnp', value: 0, line, progress: 0, note: 'No stats recorded — may be void (DNP). DraftKings rules decide.' };
      return { state: 'hit', value, line, progress, note: 'Final' };
    }
    return { state: 'live', value, line, progress, note: `${fmt(line - value)} of room left` };
  }

  function fmt(n) {
    if (n === null || n === undefined || !isFinite(n)) return '–';
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  // ---------- tickets ----------
  /* Pick6 entry: { entry, legs:[...], payouts:{ "8":221.9, "7":5.5 } | null, toWin }
     payouts are DraftKings multipliers on the entry by number correct (when known). */
  function gradePick6(slip, gameFor) {
    const receipt = slip.settlement;
    if (receipt && receipt.source === 'venue' && Number.isFinite(receipt.payout) && receipt.payout >= 0 &&
        Array.isArray(receipt.legResults) && receipt.legResults.length === slip.legs.length &&
        receipt.legResults.every(s => ['hit', 'miss', 'void'].includes(s))) {
      const legs = slip.legs.map((leg, i) => ({ leg, g: { state: receipt.legResults[i], value: null, note: 'Confirmed venue receipt' } }));
      const hits = receipt.legResults.filter(s => s === 'hit').length;
      const misses = receipt.legResults.filter(s => s === 'miss').length;
      const dnps = receipt.legResults.filter(s => s === 'void').length;
      return { legs, n: legs.length, hits, misses, dnps, open: 0, potential: receipt.payout,
        payout: receipt.payout, state: receipt.payout > 0 ? (misses ? 'partial' : 'won') : 'lost', entry: Number(slip.entry) || 0 };
    }
    const legs = slip.legs.map((l, i) => {
      const recorded = slip.venueProgress && slip.venueProgress.source === 'venue' && Array.isArray(slip.venueProgress.legResults) && slip.venueProgress.legResults[i];
      return { leg: l, g: ['hit', 'miss', 'void'].includes(recorded)
        ? { state: recorded, value: null, line: Number(l.line), progress: recorded === 'hit' ? 1 : 0, note: 'Confirmed venue progress; ticket not settled' }
        : gradeLeg(l, gameFor(l)) };
    });
    const n = legs.length;
    const hits = legs.filter((x) => x.g.state === 'hit').length;
    const misses = legs.filter((x) => x.g.state === 'miss').length;
    const dnps = legs.filter((x) => x.g.state === 'dnp' || x.g.state === 'void').length;
    const open = legs.filter((x) => x.g.state === 'live' || x.g.state === 'scheduled').length;
    const started = legs.some((x) => x.g.state !== 'scheduled');
    const entry = Number(slip.entry) || 0;
    const tiers = slip.payouts || null;
    const tierMult = (k) => (tiers && tiers[String(k)]) ? Number(tiers[String(k)]) : 0;
    const allWin = Number(slip.toWin) || (tiers ? entry * tierMult(n) : 0);

    // best still possible = everything open hits
    const bestCorrect = hits + open;
    let potential;
    if (tiers) potential = entry * tierMult(bestCorrect);
    else potential = misses === 0 ? allWin : 0;

    let state = 'open';
    let payout = null;
    if (open === 0 && started) {
      if (dnps > 0) { state = 'review'; }
      else {
        payout = tiers ? entry * tierMult(hits) : (misses === 0 ? allWin : 0);
        state = payout > 0 ? (hits === n ? 'won' : 'partial') : 'lost';
      }
    } else if (started) {
      state = potential > 0 ? 'live' : 'dead';
    }
    return { legs, n, hits, misses, dnps, open, potential, payout, state, entry };
  }

  /* First-TD bet: { name, team, stake, odds } in a game */
  function gradeFirstTD(bet, game) {
    const dec = americanToDecimal(bet.odds) || 0;
    const ret = (Number(bet.stake) || 0) * dec;
    if (!game || game.status.state === 'pre') return { state: 'scheduled', ret, scorer: null };
    const ftd = game.firstTD;
    if (!ftd) {
      if (game.status.state === 'post') return { state: 'miss', ret, scorer: null, note: 'No touchdown scored' };
      return { state: 'live', ret, scorer: null, note: 'No TD yet' };
    }
    const mine = ftd.scorerNorm && (ftd.scorerNorm === norm(bet.name) || norm(bet.name).startsWith(ftd.scorerNorm) || ftd.scorerNorm.startsWith(norm(bet.name)));
    return { state: mine ? 'hit' : 'miss', ret, scorer: ftd.scorer, note: `First TD: ${ftd.scorer}` };
  }

  /* 2+ TD scalp target: { name, team, stake, odds, cashedOut } */
  function gradeScalp(t, game) {
    const dec = americanToDecimal(t.odds) || 0;
    const full = (Number(t.stake) || 0) * dec;
    if (t.cashedOut !== undefined && t.cashedOut !== null && t.cashedOut !== '') {
      return { state: 'cashed', tds: null, realized: Number(t.cashedOut), full };
    }
    if (!game || game.status.state === 'pre') return { state: 'scheduled', tds: 0, full };
    const p = findPlayer(game, t);
    const tds = p ? p.stats.rushTD + p.stats.recTD : 0;
    if (tds >= 2) return { state: 'hit', tds, full, realized: full };
    if (game.status.state === 'post') return { state: 'miss', tds, full, realized: 0 };
    if (tds === 1) return { state: 'td1', tds, full, note: 'TD #1 scored — check your cash-out offer on DraftKings' };
    return { state: 'live', tds, full };
  }

  // ---------- alerts: diff two graded snapshots ----------
  /* prev/next: { [key]: { kind, state, value, tds, label } } -> array of alert objects */
  function diffAlerts(prev, next) {
    const out = [];
    if (!prev) return out;
    for (const key of Object.keys(next)) {
      const a = prev[key];
      const b = next[key];
      if (!a) continue;
      if (b.kind === 'leg') {
        if (a.state !== 'hit' && b.state === 'hit') out.push({ key, tone: 'win', title: `${b.label} cleared`, body: `${fmt(b.value)} ${b.unit} (line ${fmt(b.line)})` });
        else if (a.state !== 'miss' && b.state === 'miss') out.push({ key, tone: 'loss', title: `${b.label} missed`, body: `${fmt(b.value)} ${b.unit} (line ${fmt(b.line)})` });
        else if (a.state !== 'dnp' && b.state === 'dnp') out.push({ key, tone: 'warn', title: `${b.label}: no stats`, body: 'Possible void — check DraftKings' });
      } else if (b.kind === 'scalp') {
        if ((a.tds || 0) < 1 && b.tds >= 1) out.push({ key, tone: 'gold', title: `${b.label} scored TD #1`, body: 'Check your cash-out offer now' });
        if ((a.tds || 0) < 2 && b.tds >= 2) out.push({ key, tone: 'win', title: `${b.label} scored TD #2`, body: '2+ TD ticket wins in full' });
      } else if (b.kind === 'ftd') {
        if (a.state !== b.state && (b.state === 'hit' || b.state === 'miss') && b.scorer) out.push({ key, tone: b.state === 'hit' ? 'win' : 'loss', title: b.state === 'hit' ? `${b.label} scored the first TD` : `First TD: ${b.scorer}`, body: b.state === 'hit' ? `Pays $${b.ret.toFixed(2)}` : `${b.label} first-TD bet lost` });
      } else if (b.kind === 'player-td') {
        if ((b.tds || 0) > (a.tds || 0)) out.push({ key, tone: 'gold', title: `TOUCHDOWN — ${b.label}`, body: `${b.tds} TD${b.tds > 1 ? 's' : ''} today` });
      }
    }
    return out;
  }

  // ---------- research helpers (game logs) ----------
  function gamelogRows(j) {
    const names = j.names || [];
    const st = (j.seasonTypes || []).find((s) => /Regular/i.test(s.displayName)) || (j.seasonTypes || [])[0];
    const ev = j.events || {};
    const rows = ((st && st.categories) || []).flatMap((c) => c.events || []).map((e) => {
      const o = { eventId: e.eventId, week: ev[e.eventId] && ev[e.eventId].week, opp: ev[e.eventId] && ev[e.eventId].opponent && ev[e.eventId].opponent.abbreviation, atVs: ev[e.eventId] && ev[e.eventId].atVs, result: ev[e.eventId] && ev[e.eventId].gameResult };
      names.forEach((n, i) => { o[n] = e.stats[i]; });
      return o;
    });
    const seen = {};
    return rows.filter((r) => (seen[r.eventId] ? false : (seen[r.eventId] = true))).sort((a, b) => a.week - b.week);
  }
  function rowStats(r) {
    const s = emptyStats();
    s.passYds = num(r.passingYards); s.passTD = num(r.passingTouchdowns); s.ints = num(r.interceptions);
    s.completions = num(r.completions); s.passAtt = num(r.passingAttempts);
    s.rushYds = num(r.rushingYards); s.rushTD = num(r.rushingTouchdowns); s.rushAtt = num(r.rushingAttempts);
    s.rec = num(r.receptions); s.recYds = num(r.receivingYards); s.recTD = num(r.receivingTouchdowns); s.targets = num(r.receivingTargets);
    return s;
  }
  function researchLine(rows, market, line, dir) {
    const mk = MARKETS[market];
    const vals = rows.map((r) => ({ week: r.week, opp: r.opp, v: mk.f(rowStats(r)) }));
    const n = vals.length;
    const sum = vals.reduce((a, x) => a + x.v, 0);
    const avg = n ? sum / n : 0;
    const sorted = vals.map((x) => x.v).sort((a, b) => a - b);
    const median = n ? (n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : 0;
    const over = vals.filter((x) => x.v > line).length;
    const hits = dir === 'under' ? n - over : over;
    const l3 = vals.slice(-3);
    const l3avg = l3.length ? l3.reduce((a, x) => a + x.v, 0) / l3.length : 0;
    return { vals, n, avg, median, hits, l3avg, max: sorted[n - 1] || 0, min: sorted[0] || 0 };
  }

  const api = { ESPN, norm, americanToDecimal, parseGame, parseBox, gameStatus, scoringPlays, tdScorerFromText, MARKETS, findPlayer, gradeLeg, gradePick6, gradeFirstTD, gradeScalp, diffAlerts, gamelogRows, researchLine, rowStats, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PZE = api;
})(typeof window !== 'undefined' ? window : globalThis);

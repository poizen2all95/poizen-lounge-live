/* Poizen Lounge — probability model.
   Pure functions, no network. Used by the board (live odds, Lab, coach, scalp advisor) and by admin.
   Every number here is an estimate built from game logs, Vegas totals and the game clock — not a guarantee. */
(function (root) {
  'use strict';

  // ---------- distributions ----------
  function erf(x) { // Abramowitz-Stegun 7.1.26
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
  }
  const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));
  function poissonCdf(k, lam) { // P(X <= k)
    if (k < 0) return 0; let term = Math.exp(-lam), sum = term;
    for (let i = 1; i <= k; i++) { term *= lam / i; sum += term; }
    return Math.min(1, sum);
  }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // markets that are counts (discrete, small) vs yardage (continuous)
  const TD_MARKETS = new Set(['anytime_td', 'pass_td', 'home_runs']);
  const COUNT_MARKETS = new Set(['receptions', 'completions', 'pass_att', 'rush_att', 'interceptions', 'hits', 'runs', 'rbis', 'hrr', 'batter_ks', 'pitcher_ks', 'pitcher_outs', 'reb', 'ast', 'threes', 'stl', 'blk', 'stocks', 'tov', 'ra']);
  const kindOf = (market) => (TD_MARKETS.has(market) ? 'td' : COUNT_MARKETS.has(market) ? 'count' : 'yards');

  /* P(final stat clears the line) for a stat with mean mu and spread sd, given direction */
  function pOver(kind, line, mu, sd) {
    if (!(mu >= 0)) return null;
    if (kind === 'td' || (kind === 'count' && mu < 12)) {
      const need = Math.floor(line) + 1; // "more than 0.5" means at least 1
      return 1 - poissonCdf(need - 1, Math.max(mu, 1e-6));
    }
    const s = Math.max(sd, 1e-6);
    return 1 - normCdf((line + (kind === 'count' ? 0.5 : 0) - mu) / s);
  }
  const dirP = (p, dir) => (p === null ? null : dir === 'under' ? 1 - p : p);

  // ---------- pre-game projection from a game log ----------
  /* vals: [{v}] oldest → newest.  ctx: { implied, leagueImplied, weather, teammatesOut, selfStatus, oppDefOut } */
  function project(market, sportKind, vals, ctx = {}) {
    const kind = kindOf(market);
    const xs = (vals || []).map((x) => Number(x.v)).filter((x) => isFinite(x));
    const n = xs.length;
    if (!n) return null;
    // recency-weighted mean blended with the plain season mean
    let wsum = 0, wtot = 0; xs.forEach((x, i) => { const w = Math.pow(0.85, n - 1 - i); wsum += w * x; wtot += w; });
    const mean = xs.reduce((a, b) => a + b, 0) / n;
    let mu = 0.6 * (wsum / wtot) + 0.4 * mean;
    const sample = n > 1 ? Math.sqrt(xs.reduce((a, x) => a + (x - mean) * (x - mean), 0) / (n - 1)) : 0;
    const drivers = [];
    let f = 1;
    // Vegas: more implied points → more yards and touchdowns
    if (ctx.implied && ctx.leagueImplied) {
      const r = ctx.implied / ctx.leagueImplied;
      const adj = kind === 'td' ? Math.pow(r, 1.1) : Math.pow(r, 0.45);
      f *= adj; if (Math.abs(adj - 1) >= 0.02) drivers.push({ label: `Team implied ${ctx.implied.toFixed(1)} pts`, pct: adj - 1 });
    }
    // weather hurts passing
    if (ctx.weather && /wind|rain|snow|storm/i.test(ctx.weather) && /pass|rec|completions/.test(market)) {
      const adj = /snow|storm/i.test(ctx.weather) ? 0.9 : 0.94; f *= adj; drivers.push({ label: `Weather: ${ctx.weather}`, pct: adj - 1 });
    }
    // a teammate at his position is out → more volume
    if (ctx.teammatesOut && ctx.teammatesOut.length) {
      const adj = 1 + Math.min(0.12, 0.06 * ctx.teammatesOut.length); f *= adj;
      drivers.push({ label: `${ctx.teammatesOut.slice(0, 2).join(', ')} out`, pct: adj - 1 });
    }
    // opponent missing defenders
    if (ctx.oppDefOut) { const adj = 1 + Math.min(0.06, 0.02 * ctx.oppDefOut); f *= adj; drivers.push({ label: `${ctx.oppDefOut} opposing defender${ctx.oppDefOut > 1 ? 's' : ''} out`, pct: adj - 1 }); }
    // his own status
    if (ctx.selfStatus && /question/i.test(ctx.selfStatus)) { f *= 0.9; drivers.push({ label: 'He is questionable', pct: -0.1 }); }
    mu *= f;
    let sd;
    if (kind === 'yards') sd = Math.max(sample, mu * 0.35, 8);
    else sd = Math.max(sample, Math.sqrt(Math.max(mu, 0.2)) * 1.1);
    const out = /^out$|reserve|\bir\b/i.test(ctx.selfStatus || '');
    return { mu, sd, kind, n, mean, sample, drivers, out };
  }

  /* pre-game hit chance for a leg, blended with the raw hit rate from the same games */
  function legChance(leg, proj, hitsInLog, nLog) {
    if (!proj) return null;
    if (proj.out) return { p: 0, model: 0, empirical: 0, note: 'Listed out' };
    const line = Number(leg.line);
    const model = dirP(pOver(proj.kind, line, proj.mu, proj.sd), leg.dir);
    const empirical = nLog ? (hitsInLog + 1) / (nLog + 2) : model;
    const w = nLog >= 8 ? 0.35 : 0.25;
    const p = clamp((1 - w) * model + w * empirical, 0.03, 0.97);
    return { p, model, empirical };
  }

  /* when there is no game log (MLB, rookies): treat the DraftKings line as the median — a coin flip with a sensible spread */
  function priorProjection(market, line) {
    const kind = kindOf(market);
    const L = Number(line);
    if (kind === 'td') return { mu: market === 'anytime_td' ? 0.55 : L + 0.25, sd: 0, kind, n: 0, drivers: [{ label: 'No game log — using the line as the center', pct: 0 }], prior: true };
    if (kind === 'count') return { mu: L + 0.33, sd: Math.sqrt(Math.max(L, 0.5)) * 1.1, kind, n: 0, drivers: [{ label: 'No game log — using the line as the center', pct: 0 }], prior: true };
    return { mu: L, sd: Math.max(L * 0.4, 8), kind, n: 0, drivers: [{ label: 'No game log — using the line as the center', pct: 0 }], prior: true };
  }

  // ---------- live ----------
  /* frac: share of the game played (0..1). value: stat so far. Blends the pre-game projection with his live pace. */
  function liveChance(leg, proj, value, frac, state) {
    if (state === 'hit') return 1;
    if (state === 'miss') return 0;
    if (state === 'dnp' || state === 'void') return null;
    const line = Number(leg.line); const dir = leg.dir === 'under' ? 'under' : 'over';
    const pr = proj || priorProjection(leg.market, line);
    if (!frac || frac <= 0 || state === 'scheduled') return dirP(pOver(pr.kind, line, pr.mu, pr.sd), dir);
    const r = clamp(1 - frac, 0, 1);
    const pace = frac > 0.15 ? value / frac : pr.mu;
    const wPace = pr.kind === 'td' ? 0 : clamp((frac - 0.15) / 0.7, 0, 0.6); // trust pace more as the game goes on (TDs are too lumpy for pace)
    const perGame = (1 - wPace) * pr.mu + wPace * pace;
    const remMu = perGame * r;
    const need = line - value; // remaining amount that keeps the over alive
    let pOv;
    if (pr.kind === 'td' || (pr.kind === 'count' && pr.mu < 12)) {
      const k = Math.floor(line) + 1 - value; // more needed
      pOv = k <= 0 ? 1 : 1 - poissonCdf(k - 1, Math.max(remMu, 1e-6));
    } else {
      const remSd = Math.max(pr.sd * Math.sqrt(r), 1e-6);
      pOv = r <= 0 ? (value > line ? 1 : 0) : 1 - normCdf((need + (pr.kind === 'count' ? 0.5 : 0) - remMu) / remSd);
    }
    return clamp(dir === 'under' ? 1 - pOv : pOv, 0, 1);
  }

  // ---------- slips ----------
  /* distribution of number of hits for independent legs with probabilities ps */
  function hitDist(ps) {
    let d = [1];
    for (const p of ps) { const nd = new Array(d.length + 1).fill(0); d.forEach((v, k) => { nd[k] += v * (1 - p); nd[k + 1] += v * p; }); d = nd; }
    return d;
  }
  /* payouts: { "<n correct>": multiplier }  (DraftKings Pick6 table). If missing, all-correct pays toWin. */
  function slipValue(ps, entry, payouts, toWin, corr = 1) {
    const n = ps.length; if (!n || ps.some((p) => p === null || p === undefined)) return null;
    const d = hitDist(ps);
    const table = payouts && Object.keys(payouts).length ? payouts : { [n]: Number(toWin) / Number(entry) || 0 };
    // correlation nudges the all-correct outcome; the mass comes from the n-1 bucket
    if (corr !== 1 && n > 1) { const add = d[n] * (corr - 1); const take = Math.min(add, d[n - 1]); d[n] += take; d[n - 1] -= take; }
    let ev = 0, pCash = 0;
    d.forEach((pk, k) => { const m = Number(table[k] || 0); ev += pk * m * entry; if (m > 0) pCash += pk; });
    const pAll = d[n];
    const mAll = Number(table[n] || 0);
    return { dist: d, pAll, pCash, ev, evNet: ev - entry, roi: entry ? ev / entry - 1 : 0, fairAll: pAll > 0 ? 1 / pAll : Infinity, offeredAll: mAll };
  }

  /* rough correlation read between legs. legs: [{market, dir, team, opp, pos}] */
  function correlation(legs) {
    const flags = []; let factor = 1;
    const passish = (m) => /pass_yds|completions|pass_att|pass_td/.test(m);
    const recish = (m) => /rec_yds|receptions/.test(m);
    for (let i = 0; i < legs.length; i++) for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j]; if (!a.team || !b.team) continue;
      const same = a.team === b.team, opp = a.opp === b.team;
      const bothOver = (a.dir || 'over') === 'over' && (b.dir || 'over') === 'over';
      if (!bothOver) continue;
      if (same && ((passish(a.market) && recish(b.market)) || (passish(b.market) && recish(a.market)))) { factor *= 1.1; flags.push({ good: true, text: `${a.name} and ${b.name} feed each other` }); }
      else if (same && /rush/.test(a.market) && /rush/.test(b.market) && a.pos === b.pos && a.pos === 'RB') { factor *= 0.92; flags.push({ good: false, text: `${a.name} and ${b.name} split the same carries` }); }
      else if (same && ((passish(a.market) && /rush_yds|rush_att/.test(b.market) && b.pos === 'RB') || (passish(b.market) && /rush_yds|rush_att/.test(a.market) && a.pos === 'RB'))) { factor *= 0.96; flags.push({ good: false, text: `${a.name} and ${b.name} pull against each other (pass vs run)` }); }
      else if (opp && passish(a.market) && passish(b.market)) { factor *= 1.06; flags.push({ good: true, text: `${a.name} vs ${b.name}: a shootout lifts both` }); }
    }
    return { factor: clamp(factor, 0.8, 1.35), flags };
  }

  // ---------- 2+ TD scalp ----------
  /* odds-implied TD rate: P(2+ TDs) from American odds with a vig haircut → Poisson rate per game */
  function lambdaFrom2Plus(dec, vig = 0.85) {
    const p = clamp((1 / dec) * vig, 0.005, 0.9);
    let lo = 0.01, hi = 6;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; const q = 1 - Math.exp(-m) * (1 + m); if (q < p) lo = m; else hi = m; }
    return (lo + hi) / 2;
  }
  /* after TD #1: what is the rest of the ticket worth? */
  function scalpFairValue(full, dec, frac, tds) {
    if (tds >= 2) return { fair: full, pMore: 1 };
    const lam = lambdaFrom2Plus(dec) * clamp(1 - frac, 0, 1);
    const need = 2 - (tds || 0);
    const pMore = 1 - poissonCdf(need - 1, lam);
    return { fair: full * pMore, pMore };
  }

  // ---------- coach ----------
  /* picks: [{market, dir, result, prob}] → hit rates by market+direction and calibration buckets */
  const COACH_MIN = 8;
  /* Wilson score interval (90% by default) for a hit rate */
  function wilson(h, n, z = 1.645) { if (!n) return [0, 1]; const p = h / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)); return [Math.max(0, (c - m) / d), Math.min(1, (c + m) / d)]; }
  function coach(picks, edges) {
    const done = picks.filter((p) => p.result === 'hit' || p.result === 'miss');
    const by = {};
    done.forEach((p) => { const k = p.market + '|' + (p.dir || 'over'); const o = (by[k] = by[k] || { market: p.market, dir: p.dir || 'over', n: 0, hit: 0, baseSum: 0, priced: 0 }); o.n++; if (p.result === 'hit') o.hit++;
      if (typeof p.prob === 'number') { o.baseSum += p.prob; o.priced++; } else o.baseSum += 0.5; });
    /* judge each stat against what it was priced at (price paid or the Lab's number), not a blanket hit-rate cutoff,
       and only once there is enough evidence: 8+ graded and the 90% range clear of the baseline */
    const markets = Object.values(by).map((o) => { const base = o.baseSum / o.n; const [lo, hi] = wilson(o.hit, o.n); const verdict = o.n < COACH_MIN ? 'early' : lo > base ? 'edge' : hi < base ? 'leak' : 'even';
      return { market: o.market, dir: o.dir, n: o.n, hit: o.hit, base, lo, hi, verdict, baseKind: o.priced === o.n ? 'price' : o.priced ? 'mixed' : 'coin' }; })
      .sort((a, b) => b.hit / b.n - a.hit / a.n || b.n - a.n);
    const buckets = (edges || [[0, 0.45, 'Under 45%'], [0.45, 0.6, '45–60%'], [0.6, 0.75, '60–75%'], [0.75, 1.01, '75%+']]).map(([lo, hi, label]) => {
      const xs = done.filter((p) => typeof p.prob === 'number' && p.prob >= lo && p.prob < hi);
      return { label, n: xs.length, expected: xs.length ? xs.reduce((a, p) => a + p.prob, 0) / xs.length : null, actual: xs.length ? xs.filter((p) => p.result === 'hit').length / xs.length : null };
    });
    return { n: done.length, hits: done.filter((p) => p.result === 'hit').length, markets, buckets };
  }

  // ---------- slip health (live) ----------
  /* legs: [{ p, state, game }] with p = live chance (hit = 1, miss = 0).
     health = geometric mean of every leg's chance × 100 — an 8-leg slip of 60% legs reads 60, a cashed leg pulls it up, a dead leg kills it. */
  function health(legs) {
    if (!legs.length) return { score: null, label: '', danger: [], clusters: [] };
    if (legs.some((l) => l.state === 'miss')) return { score: 0, label: 'Busted', danger: [], clusters: [] };
    const ps = legs.map((l) => clamp(l.p === null || l.p === undefined ? 0.5 : l.p, 0.001, 1));
    const score = Math.round(100 * Math.exp(ps.reduce((a, p) => a + Math.log(p), 0) / ps.length));
    const danger = legs.map((l, i) => ({ ...l, i })).filter((l) => l.state !== 'hit' && (l.p ?? 0.5) < 0.4);
    const byGame = {}; danger.forEach((l) => { if (l.game) (byGame[l.game] = byGame[l.game] || []).push(l.i); });
    const clusters = Object.entries(byGame).filter(([, xs]) => xs.length > 1).map(([game, idx]) => ({ game, idx }));
    const label = legs.every((l) => l.state === 'hit') ? 'Cashed' : score >= 70 ? 'Strong' : score >= 50 ? 'Alive' : score >= 30 ? 'Shaky' : 'Critical';
    return { score, label, danger: danger.map((l) => l.i), clusters };
  }

  // ---------- pre-bet gate ----------
  const GATE_DEFAULTS = { maxLegs: 6, minLegChance: 0.45, minHitRate: 0.5, avgBeatsLine: true, injury: 'doubtful', noNegCorr: true, minEV: 0, sizeGuard: true, coachLeaks: true };
  const INJ_RANK = { questionable: 1, doubtful: 2, out: 3 };
  /* slip: { legs:[{ name, line, dir, p, source, avg, hits, n, status, market }], value:{ evNet }, corr:{ flags }, sizeRecord:{ w, l, pl, size } }
     returns [{ id, label, state: 'pass'|'fail'|'warn'|'na', why, source }] */
  function gate(slip, rules) {
    const R = { ...GATE_DEFAULTS, ...(rules || {}) }; const out = [];
    const legs = slip.legs || [];
    const add = (id, label, state, why, source) => out.push({ id, label, state, why, source });
    add('maxLegs', `No more than ${R.maxLegs} legs`, legs.length <= R.maxLegs ? 'pass' : 'fail', `${legs.length} legs`, 'Your rule');
    const weak = legs.filter((l) => typeof l.p === 'number' && l.p < R.minLegChance);
    const unknownP = legs.filter((l) => l.source === 'prior');
    add('minLegChance', `Every leg at least ${Math.round(R.minLegChance * 100)}% in the Lab`, weak.length ? 'fail' : unknownP.length ? 'warn' : 'pass',
      weak.length ? weak.map((l) => `${l.name} ${Math.round(l.p * 100)}%`).join(', ') : unknownP.length ? `${unknownP.map((l) => l.name).join(', ')}: no game log, the Lab can only use the line` : 'All legs clear it', 'Lab: 2026 ESPN game logs, Vegas totals, injuries');
    if (R.avgBeatsLine) {
      const withLog = legs.filter((l) => typeof l.avg === 'number' && l.n);
      const bad = withLog.filter((l) => (l.dir === 'under' ? l.avg >= l.line : l.avg <= l.line));
      add('avgBeatsLine', 'Season average beats the line', !withLog.length ? 'na' : bad.length ? 'fail' : 'pass', bad.length ? bad.map((l) => `${l.name} averages ${Math.round(l.avg * 10) / 10} vs ${l.line}`).join(', ') : withLog.length < legs.length ? `${withLog.length} of ${legs.length} legs have a game log` : 'Every leg', 'ESPN 2026 game log');
    }
    const withLog2 = legs.filter((l) => l.n);
    const lowHit = withLog2.filter((l) => l.hits / l.n < R.minHitRate);
    add('minHitRate', `Cleared the line in ${Math.round(R.minHitRate * 100)}%+ of games`, !withLog2.length ? 'na' : lowHit.length ? 'fail' : 'pass', lowHit.length ? lowHit.map((l) => `${l.name} ${l.hits}/${l.n}`).join(', ') : 'Every leg with a log', 'ESPN 2026 game log');
    const limit = INJ_RANK[R.injury] || 2;
    const hurt = legs.filter((l) => l.status && (INJ_RANK[(String(l.status).toLowerCase().match(/out|doubtful|questionable/) || [''])[0]] || (/reserve|\bir\b/i.test(l.status) ? 3 : 0)) >= limit);
    add('injury', `No one ${R.injury} or worse`, hurt.length ? 'fail' : slip.injuriesLoaded === false ? 'warn' : 'pass', hurt.length ? hurt.map((l) => `${l.name}: ${l.status}`).join(', ') : slip.injuriesLoaded === false ? 'Injury report not loaded yet' : 'Nobody listed', 'ESPN NFL injury report');
    if (R.noNegCorr) { const neg = ((slip.corr && slip.corr.flags) || []).filter((f) => !f.good); add('noNegCorr', 'No legs working against each other', neg.length ? 'fail' : 'pass', neg.length ? neg.map((f) => f.text).join('; ') : 'None found', 'Lab correlation check'); }
    if (slip.value) add('minEV', R.minEV > 0 ? `Expected profit at least $${R.minEV}` : 'Positive expected value', slip.value.evNet >= R.minEV ? 'pass' : 'fail', `${slip.value.evNet >= 0 ? '+' : '-'}$${Math.abs(slip.value.evNet).toFixed(2)} expected on $${Number(slip.entry || 0).toFixed(2)}`, 'Lab vs the DraftKings payout table');
    if (R.coachLeaks && Array.isArray(slip.leaks)) {
      const hits = legs.map((l) => ({ l, k: slip.leaks.find((x) => x.market === l.market && (x.dir || 'over') === (l.dir || 'over')) })).filter((x) => x.k);
      add('coachLeaks', 'No stat the Coach flags as a leak', hits.length ? 'fail' : 'pass', hits.length ? hits.map(({ l, k }) => `${l.name}: ${k.label || l.market} ${k.hit}/${k.n} in your history`).join(', ') : slip.leaks.length ? `Leaks on file: ${slip.leaks.map((k) => `${k.label || k.market} ${k.hit}/${k.n}`).join(', ')}` : 'No leaks on file yet', 'Your ledger, via the Coach');
    }
    if (R.sizeGuard && slip.sizeRecord && slip.sizeRecord.n >= 3) { const s = slip.sizeRecord; add('sizeGuard', `Slip size is making money for you`, s.pl >= 0 ? 'pass' : 'fail', `${s.label}: ${s.w}-${s.l}, ${s.pl >= 0 ? '+' : '-'}$${Math.abs(s.pl).toFixed(2)}`, 'Your ledger'); }
    return out;
  }
  /* stats the Coach calls a leak: enough graded calls and a hit rate clearly below what they were priced at */
  function leaks(picks) { return coach(picks).markets.filter((m) => m.verdict === 'leak'); }
  /* scalp cash-out call: compare the book's offer with what holding is worth */
  function cashoutCall(offer, fair) {
    if (!(offer > 0) || !(fair >= 0)) return null;
    const edge = offer - fair, ratio = fair > 0 ? offer / fair : Infinity;
    return { take: offer >= fair, edge, ratio, verdict: offer >= fair ? 'Take it' : ratio >= 0.9 ? 'Close call — take it if you want the sure thing' : 'Hold' };
  }
  // ---------- honest numbers ----------
  /* DraftKings' own read on a leg, from its Pick6 multiplier: a lower multiplier means DK rates it likelier.
     Checked on PoiZen's 28 graded Pick6 legs: legs this rates under 45% hit 25%, over 55% hit 64%
     (Brier score .214 vs .250 for a coin flip). No multiplier -> 50/50, the line as the median. */
  function multPrior(mult) {
    const s = String(mult || ''); if (/gimme/i.test(s)) return 0.95;
    const m = Number((s.match(/([\d.]+)\s*x/i) || [])[1]); if (!(m > 0)) return 0.5;
    return clamp(0.5 - 0.25 * Math.log(m), 0.3, 0.75);
  }
  /* how much to trust our own model over DraftKings' read: more games in his log, more trust, never above 75% */
  const trustOf = (n) => 0.75 * (n || 0) / ((n || 0) + 8);
  function honest(raw, mult, n) { const prior = multPrior(mult); const w = trustOf(n); if (raw === null || raw === undefined) return { p: prior, raw, prior, w: 0 }; return { p: clamp(prior + (raw - prior) * w, 0.03, 0.97), raw, prior, w }; }
  /* in-game: the box score earns trust as the game goes on; a decided leg stays decided */
  function honestLive(raw, prior, w, frac) {
    if (raw === null || raw === undefined || raw >= 0.999 || raw <= 0.001) return raw;
    const k = (w || 0) + (1 - (w || 0)) * clamp(frac || 0, 0, 1); return clamp((prior ?? 0.5) + (raw - (prior ?? 0.5)) * k, 0, 1);
  }
  /* the hit rate every leg needs, on average, for an all-or-nothing slip to break even */
  function breakEven(entry, toWin, n) { const x = Number(toWin) / Number(entry); return x > 1 && n ? Math.pow(1 / x, 1 / n) : null; }

  // ---------- event contracts (DK Predictions, Robinhood): $1 per contract, priced in cents ----------
  const mlProb = (ml) => { const m = Number(ml); if (!m) return null; return m < 0 ? -m / (-m + 100) : 100 / (m + 100); };
  /* moneylines -> no-vig win chance for the home side */
  function devig(mlHome, mlAway) { const h = mlProb(mlHome), a = mlProb(mlAway); if (h === null || a === null) return null; return h / (h + a); }
  /* best available win chance for one side: final > ESPN live win probability > DraftKings line (no vig) > ESPN matchup predictor */
  function winChance(side, d) {
    if (!d) return null;
    if (d.final) return { p: d.winner === side ? 1 : 0, src: 'Final' };
    const flip = (x) => (side === 'home' ? x : 1 - x);
    if (typeof d.liveHome === 'number') return { p: clamp(flip(d.liveHome), 0, 1), src: 'ESPN live win probability' };
    const ml = devig(d.mlHome, d.mlAway); if (ml !== null) return { p: flip(ml), src: 'DraftKings line, vig removed' };
    if (typeof d.preHome === 'number') return { p: clamp(flip(d.preHome), 0, 1), src: 'ESPN matchup predictor' };
    return null;
  }
  /* 2+ TD (or n+) contract: the entry price is the market's pre-game read; scale the scoring rate by time left */
  function tdsChance(entryP, frac, tds, need = 2) {
    if (tds >= need) return 1;
    const lam = lambdaFrom2Plus(1 / clamp(entryP, 0.01, 0.95), 1) * clamp(1 - frac, 0, 1);
    return 1 - poissonCdf(need - (tds || 0) - 1, lam);
  }
  /* sell-or-hold for a contract position: bid and avg in cents, p = chance it settles YES */
  function contractCall(qty, avg, p, bid) {
    const q = Number(qty) || 0; const cost = (q * (Number(avg) || 0)) / 100; const hold = p === null || p === undefined ? null : q * p;
    const out = { qty: q, cost, hold, fairCents: hold === null ? null : p * 100, maxWin: q - cost };
    const b = Number(bid);
    if (b > 0) { out.proceeds = (q * b) / 100; out.pnlIfSold = out.proceeds - cost; out.call = hold === null ? null : cashoutCall(out.proceeds, hold); }
    return out;
  }
  /* exit at size: walk the bids (dollars, best first or any order) for qty contracts.
     Returns what actually fills from the visible book, the average price, and what is left unfilled.
     feeCents is per contract and optional — unknown fees stay unknown (feeKnown false). Visible depth can move: an estimate, not a fill. */
  function exitAtSize(bids, qty, feeCents) {
    const L = (bids || []).map(([p, q]) => [Number(p), Number(q)]).filter(([p, q]) => p > 0 && q > 0).sort((a, b) => b[0] - a[0]);
    let left = Math.max(0, Number(qty) || 0), filled = 0, gross = 0, levels = 0;
    for (const [p, q] of L) { if (left <= 0) break; const take = Math.min(left, q); filled += take; gross += take * p; left -= take; levels++; }
    const feeKnown = feeCents !== undefined && feeCents !== null && feeCents !== '' && isFinite(Number(feeCents));
    const fees = feeKnown ? (filled * Number(feeCents)) / 100 : null;
    return { filled, residual: left, avg: filled ? gross / filled : null, gross, fees, net: feeKnown ? gross - fees : null, feeKnown, levels, top: L.length ? L[0][0] : null, visible: L.reduce((a, [, q]) => a + q, 0) };
  }
  /* ---------- plans: the one definition of every tier ----------
     status: live = works today · server = built, switches on when the Poizen server is deployed · building = next release */
  const PLAN_ORDER = ['free', 'pro', 'elite'];
  const PLAN_NAMES = { free: 'Free', pro: 'Pro', elite: 'Elite' };
  const FOUNDING_CAP = 50;
  const FEATURES = {
    board: { tier: 'free', label: "PoiZen's live board, Games, Injuries, Lab, Pick'em and chat", status: 'live' },
    ownSlips: { tier: 'free', label: 'Build and track your own slips live', status: 'live' },
    honest: { tier: 'free', label: 'The honest read on every slip', status: 'live' },
    limits: { tier: 'free', label: 'Weekly limit and cool-off', status: 'live' },
    exportData: { tier: 'free', label: 'Export or delete all your data', status: 'live' },
    themes: { tier: 'free', label: 'Midnight, Daylight and Vegas themes — always free', status: 'live' },
    teamThemes: { tier: 'pro', label: 'Your team, your Lounge: NFL, MLB and NBA colors and team branding across the board', status: 'live' },
    ocr: { tier: 'pro', label: 'Read slips from a DraftKings screenshot', status: 'live' },
    coach: { tier: 'pro', label: 'Your Coach: each stat judged against what it was priced at, feeding your gate', status: 'live' },
    gateEdit: { tier: 'pro', label: 'Edit your own gate rules', status: 'live' },
    history: { tier: 'pro', label: 'Your full settled history (Free keeps the last 10)', status: 'live' },
    csv: { tier: 'pro', label: 'Ledger export to CSV', status: 'live' },
    playoffs: { tier: 'elite', label: 'Playoffs atmosphere theme, Midnight and Daylight', status: 'live' },
    positions: { tier: 'elite', label: 'Position desk: each position from plan to settled, with partial exits, fees and corrections kept', status: 'building' },
    books: { tier: 'elite', label: 'Live Kalshi order book and sell-it-all-now estimate on your own positions', status: 'server' },
    exposure: { tier: 'elite', label: 'Exposure across positions by game, team and player', status: 'building' },
    exitPlans: { tier: 'elite', label: 'Exit plans with target, stop and expiry alerts', status: 'building' },
  };
  const tierRank = (t) => Math.max(0, PLAN_ORDER.indexOf(t));
  function canUse(tier, feature) { const f = FEATURES[feature]; return !!f && tierRank(tier) >= tierRank(f.tier); }
  function planFeatures(tier) { return Object.entries(FEATURES).filter(([, f]) => f.tier === tier).map(([id, f]) => ({ id, ...f })); }
  /* ---------- positions: one record from plan to settled ----------
     Prices are dollars per contract (0–1). Exits and settlement are what you report until a venue confirms them.
     Corrections never overwrite: the original stays, the correction is applied on top and listed. */
  function positionState(p, mark) {
    const fx = { ...p };
    (p.corrections || []).forEach((c) => { if (c && c.field && c.field in fx) fx[c.field] = c.to; });
    const qty = Number(fx.qty) || 0; const entry = Number(fx.entry); const feeIn = Number(fx.fee) || 0;
    const exits = (fx.exits || []).filter((x) => x && x.qty > 0);
    const sold = exits.reduce((a, x) => a + x.qty, 0); const open = Math.max(0, qty - sold);
    const filled = qty > 0 && Number.isFinite(entry);
    const cost = filled ? qty * entry : 0; const fees = (filled ? feeIn : 0) + exits.reduce((a, x) => a + (Number(x.fee) || 0), 0);
    const proceeds = exits.reduce((a, x) => a + x.qty * x.price, 0);
    const settle = fx.settled && (fx.settled.result === 'yes' || fx.settled.result === 'no') ? (fx.settled.result === (fx.side || 'yes') ? 1 : 0) : null;
    const realizedCost = filled ? (settle !== null ? qty : sold) * entry : 0;
    const realized = proceeds + (settle !== null ? open * settle : 0) - realizedCost - fees;
    const m = Number(mark); const unrealized = filled && settle === null && open > 0 && Number.isFinite(m) ? open * (m - entry) : null;
    const stage = !filled ? 'planned' : settle !== null ? 'settled' : open === 0 ? 'closed' : sold > 0 ? 'partial' : 'live';
    const unconfirmed = exits.filter((x) => x.source !== 'venue').length + (fx.settled && fx.settled.source !== 'venue' ? 1 : 0);
    return { stage, qty, open, sold, entry: filled ? entry : null, cost, proceeds, fees, realized, unrealized, settle,
      net: realized + (unrealized || 0), corrected: (p.corrections || []).length > 0, unconfirmed, avgExit: sold ? proceeds / sold : null };
  }
  const gateVerdict = (checks) => (checks.some((c) => c.state === 'fail') ? 'fail' : checks.some((c) => c.state === 'warn') ? 'warn' : 'pass');

  const api = { normCdf, poissonCdf, kindOf, pOver, project, legChance, priorProjection, liveChance, hitDist, slipValue, correlation, lambdaFrom2Plus, scalpFairValue, coach, wilson, COACH_MIN, health, gate, gateVerdict, GATE_DEFAULTS, leaks, cashoutCall, mlProb, devig, winChance, tdsChance, contractCall, exitAtSize, PLAN_ORDER, PLAN_NAMES, FEATURES, canUse, planFeatures, tierRank, positionState, FOUNDING_CAP, multPrior, trustOf, honest, honestLive, breakEven };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PZM = api;
})(typeof window !== 'undefined' ? window : globalThis);

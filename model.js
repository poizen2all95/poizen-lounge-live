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
  const COUNT_MARKETS = new Set(['receptions', 'completions', 'pass_att', 'rush_att', 'interceptions', 'hits', 'runs', 'rbis', 'hrr', 'batter_ks', 'pitcher_ks', 'pitcher_outs']);
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
  function coach(picks) {
    const done = picks.filter((p) => p.result === 'hit' || p.result === 'miss');
    const by = {};
    done.forEach((p) => { const k = p.market + '|' + (p.dir || 'over'); const o = (by[k] = by[k] || { market: p.market, dir: p.dir || 'over', n: 0, hit: 0 }); o.n++; if (p.result === 'hit') o.hit++; });
    const markets = Object.values(by).sort((a, b) => b.hit / b.n - a.hit / a.n || b.n - a.n);
    const buckets = [[0, 0.45, 'Under 45%'], [0.45, 0.6, '45–60%'], [0.6, 0.75, '60–75%'], [0.75, 1.01, '75%+']].map(([lo, hi, label]) => {
      const xs = done.filter((p) => typeof p.prob === 'number' && p.prob >= lo && p.prob < hi);
      return { label, n: xs.length, expected: xs.length ? xs.reduce((a, p) => a + p.prob, 0) / xs.length : null, actual: xs.length ? xs.filter((p) => p.result === 'hit').length / xs.length : null };
    });
    return { n: done.length, hits: done.filter((p) => p.result === 'hit').length, markets, buckets };
  }

  const api = { normCdf, poissonCdf, kindOf, pOver, project, legChance, priorProjection, liveChance, hitDist, slipValue, correlation, lambdaFrom2Plus, scalpFairValue, coach };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PZM = api;
})(typeof window !== 'undefined' ? window : globalThis);

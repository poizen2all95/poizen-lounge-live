/* Poizen Lounge settings: defaults, validation and the small decisions the page makes from them. */
(function (root) {
  'use strict';
  const DEFAULTS = { sweatTucked: true, bannerHide: false, necklaceHide: false, glass: true, heroAuto: true, heroSecs: 7, tickerSpeed: 'normal', tickerTotals: true };
  const SPEEDS = { slow: 0.5, normal: 1, fast: 2 };
  const SECS = [4, 7, 10, 15];
  function normalize(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = { ...DEFAULTS };
    for (const k of ['sweatTucked', 'bannerHide', 'necklaceHide', 'glass', 'heroAuto', 'tickerTotals']) if (typeof r[k] === 'boolean') out[k] = r[k];
    if (SECS.includes(Number(r.heroSecs))) out.heroSecs = Number(r.heroSecs);
    if (Object.prototype.hasOwnProperty.call(SPEEDS, r.tickerSpeed)) out.tickerSpeed = r.tickerSpeed;
    return out;
  }
  /* The banner leaves after you scroll down past it and comes back on any scroll up or near the top. */
  function bannerAway(away, lastY, y, height) {
    if (y < height * 1.5) return false;
    if (y > lastY + 4) return true;
    if (y < lastY - 4) return false;
    return away;
  }
  /* Next carousel position, wrapping both ways; -1 when there is nothing to show. */
  function nextIndex(count, current, step) {
    if (!count) return -1;
    const at = current < 0 ? 0 : current;
    return (((at + step) % count) + count) % count;
  }
  const api = { DEFAULTS, SPEEDS, SECS, normalize, bannerAway, nextIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PZSettings = api;
})(typeof window !== 'undefined' ? window : globalThis);

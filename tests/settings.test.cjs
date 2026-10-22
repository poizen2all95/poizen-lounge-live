const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const S = require(path.join(__dirname, '..', 'settings.js'));

test('defaults: Live Sweat tucked behind the banner, banner and necklace stay visible', () => {
  assert.deepEqual(S.normalize(undefined), S.DEFAULTS);
  assert.equal(S.DEFAULTS.sweatTucked, true);
  assert.equal(S.DEFAULTS.bannerHide, false);
  assert.equal(S.DEFAULTS.necklaceHide, false);
  assert.equal(S.DEFAULTS.glass, true);
  assert.equal(S.normalize({ glass: false }).glass, false);
  assert.equal(S.normalize({ glass: 'no' }).glass, true);
});
test('saved settings keep valid values and drop invalid ones', () => {
  const out = S.normalize({ necklaceHide: true, sweatTucked: true, bannerHide: 'yes', heroSecs: 10, tickerSpeed: 'warp', extra: 1 });
  assert.equal(out.sweatTucked, true);
  assert.equal(out.necklaceHide, true);
  assert.equal(out.bannerHide, false, 'non-boolean ignored');
  assert.equal(out.heroSecs, 10);
  assert.equal(out.tickerSpeed, 'normal', 'unknown speed ignored');
  assert.equal('extra' in out, false);
  assert.equal(S.normalize({ heroSecs: 3 }).heroSecs, 7);
  assert.equal(S.normalize('junk').heroSecs, 7);
});
test('banner stays near the top, hides going down, returns going up, holds on tiny moves', () => {
  assert.equal(S.bannerAway(true, 0, 40, 65), false, 'near the top it is always shown');
  assert.equal(S.bannerAway(false, 200, 260, 65), true, 'scrolling down hides it');
  assert.equal(S.bannerAway(true, 260, 230, 65), false, 'scrolling up shows it');
  assert.equal(S.bannerAway(true, 260, 262, 65), true, 'jitter keeps the current state');
  assert.equal(S.bannerAway(false, 260, 262, 65), false);
});
test('carousel index wraps in both directions and handles an empty list', () => {
  assert.equal(S.nextIndex(3, 2, 1), 0);
  assert.equal(S.nextIndex(3, 0, -1), 2);
  assert.equal(S.nextIndex(3, -1, 1), 1, 'unknown current starts from the first');
  assert.equal(S.nextIndex(0, 0, 1), -1);
});

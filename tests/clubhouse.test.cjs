const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const clubhouse = require('../clubhouse.js');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const definitions = ['NFLC', 'NFLNAMES', 'NFLCITY'].map(name => {
  const definition = html.split('\n').find(line => line.startsWith(`const ${name} =`));
  assert.ok(definition, `${name} team configuration is missing`);
  return definition;
}).join('\n');
const teamStart = html.indexOf('const TEAMS =');
const teamEnd = html.indexOf('const teamLogo =', teamStart);
const context = {};
vm.runInNewContext(`${definitions}\n${html.slice(teamStart, teamEnd)}\nthis.teams = TEAMS;`, context);
const teams = JSON.parse(JSON.stringify(context.teams));
const assets = {
  LV: {
    name: 'Las Vegas Raiders', city: 'Las Vegas', nickname: 'Raiders',
    logo: 'assets/nfl-teams/lv.png',
    stadium: { id: 'allegiant', name: 'Allegiant Stadium', city: 'Las Vegas', photo: 'assets/nfl-teams/stadium-allegiant.jpg', source: 'https://www.raiders.com/stadium/' },
  },
};

function independentContrast(a, b) {
  const luminance = hex => {
    assert.match(hex, /^#[a-f0-9]{6}$/i);
    const channels = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

test('clubhouse exports the same pure API for the browser and CommonJS', () => {
  const browser = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(root, 'clubhouse.js'), 'utf8'), browser);
  for (const method of ['palette', 'contrast', 'team', 'render']) {
    assert.equal(typeof clubhouse[method], 'function', `CommonJS ${method}`);
    assert.equal(typeof browser.window.PZClubhouse?.[method], 'function', `browser ${method}`);
  }
});

test('contrast matches black/white and identical-color reference values', () => {
  assert.equal(clubhouse.contrast('#000000', '#ffffff'), 21);
  assert.equal(clubhouse.contrast('#ffffff', '#000000'), 21);
  assert.equal(clubhouse.contrast('#002244', '#002244'), 1);
});

test('every configured NFL team has readable ink and accents on the clubhouse paper', () => {
  assert.equal(teams.nfl.length, 32);
  for (const [abbr, , primary, secondary] of teams.nfl) {
    const colors = clubhouse.palette(primary, secondary);
    assert.equal(colors.paper, '#f5f3ef', `${abbr}: clubhouse paper`);
    assert.equal(colors.primary.toLowerCase(), `#${primary.toLowerCase()}`, `${abbr}: preserved primary identity`);
    assert.equal(colors.secondary.toLowerCase(), `#${secondary.toLowerCase()}`, `${abbr}: preserved secondary identity`);
    assert.ok(independentContrast(colors.ink, colors.paper) >= 4.5, `${abbr}: readable ink`);
    assert.ok(independentContrast(colors.accent, colors.paper) >= 4.5, `${abbr}: readable accent`);
    assert.ok(clubhouse.contrast(colors.ink, colors.paper) >= 4.5, `${abbr}: exported ink contrast`);
    assert.ok(clubhouse.contrast(colors.accent, colors.paper) >= 4.5, `${abbr}: exported accent contrast`);
    for (const key of Object.keys(colors)) assert.doesNotMatch(key, /win|loss|won|lost|hit|miss|danger|success|warning|good|bad/i, `${abbr}: theme must not redefine outcome semantics`);
  }
});

test('team resolves all NFL selections and rejects missing, malformed, and other-league IDs', () => {
  for (const [abbr, name] of teams.nfl) {
    const result = clubhouse.team(`nfl:${abbr}`, teams, assets);
    assert.equal(result.id, `nfl:${abbr}`);
    assert.equal(result.abbr, abbr);
    assert.equal(result.name, name);
    assert.ok(result.palette && result.city && result.nickname, `${abbr}: recognizable team identity`);
  }
  for (const selection of ['', null, undefined, 'nfl:', 'nfl:UNKNOWN', 'nfl:LV:extra', 'nba:CHI', 'mlb:LV', '__proto__:LV']) {
    assert.equal(clubhouse.team(selection, teams, assets), null, String(selection));
  }
});

test('known stadium assets retain their name, city, photo, and crest', () => {
  const result = clubhouse.team('nfl:LV', teams, assets);
  assert.equal(result.city, 'Las Vegas');
  assert.equal(result.nickname, 'Raiders');
  assert.equal(result.logo, assets.LV.logo);
  assert.equal(result.stadium.name, 'Allegiant Stadium');
  assert.equal(result.stadium.photo, assets.LV.stadium.photo);
  const dom = new JSDOM(clubhouse.render(result));
  assert.ok(dom.window.document.querySelector('.clubhouse-team'));
  assert.match(dom.window.document.body.textContent, /Las Vegas\s*Raiders/);
  assert.ok(dom.window.document.body.textContent.includes('Allegiant Stadium'));
  const sources = [...dom.window.document.querySelectorAll('img')].map(img => img.getAttribute('src'));
  assert.ok(sources.includes(result.logo), 'team crest remains visible');
  assert.ok(sources.includes(result.stadium.photo), 'stadium image is rendered');
  dom.window.close();
});

test('a known team without a stadium photo retains a recognizable masthead', () => {
  const result = clubhouse.team('nfl:NE', teams, {});
  assert.equal(result.name, 'New England Patriots');
  assert.ok(!result.stadium || !result.stadium.photo);
  const dom = new JSDOM(clubhouse.render(result));
  assert.ok(dom.window.document.querySelector('.clubhouse-team'));
  assert.match(dom.window.document.body.textContent, /New England\s*Patriots/);
  assert.ok(dom.window.document.querySelector('img[src]'), 'fallback crest does not depend on a stadium photo');
  assert.doesNotMatch(dom.window.document.body.textContent, /undefined|null|NaN/);
  dom.window.close();
});

test('render escapes team and stadium text rather than creating markup from brand data', () => {
  const result = clubhouse.team('nfl:LV', teams, assets);
  result.name = 'Raiders <script>alert(1)</script> & "Club"';
  result.city = '<img src=x onerror=alert(1)> Las Vegas';
  result.nickname = '<svg onload=alert(1)>Raiders</svg>';
  result.stadium = { ...result.stadium, name: '<iframe src="evil"></iframe> Allegiant & Field' };
  const dom = new JSDOM(clubhouse.render(result));
  assert.equal(dom.window.document.querySelectorAll('script,iframe,svg').length, 0);
  assert.equal(dom.window.document.querySelector('[onerror],[onload]'), null);
  assert.ok(dom.window.document.body.textContent.includes(result.name));
  assert.ok(dom.window.document.body.textContent.includes(result.stadium.name));
  dom.window.close();
});

test('render rejects script, data, insecure, protocol-relative, and quoted media URLs', () => {
  for (const source of ['javascript:alert(1)', 'data:image/svg+xml,<svg onload=alert(1)>', 'http://evil.example/image.jpg', '//evil.example/image.jpg', 'https://evil.example/x\" onerror=\"alert(1)', '../outside.jpg']) {
    const result = clubhouse.team('nfl:LV', teams, assets);
    result.logo = source;
    result.stadium = { name: 'Allegiant Stadium', photo: source };
    const dom = new JSDOM(clubhouse.render(result));
    for (const image of dom.window.document.querySelectorAll('img[src]')) {
      const value = image.getAttribute('src');
      assert.notEqual(value, source, `rejected media URL ${source}`);
      assert.ok(/^https:\/\//.test(value) || /^assets\/nfl-teams\/[a-zA-Z0-9._/-]+$/.test(value), `safe media source: ${value}`);
    }
    assert.equal(dom.window.document.querySelector('[onerror],[onload]'), null);
    dom.window.close();
  }
});

test('team resolution does not mutate shared configuration or invent sports metrics', () => {
  const before = JSON.stringify({ teams, assets });
  const result = clubhouse.team('nfl:LV', teams, assets);
  const output = clubhouse.render(result);
  assert.equal(JSON.stringify({ teams, assets }), before);
  assert.doesNotMatch(output, /win rate|hit rate|expected value|accuracy|projection|winning streak/i);
});

test('theme assets cover every NFL team with existing local crest and stadium files',()=>{
  const manifest=require('../nfl-theme-assets.js');
  for(const [abbr]of teams.nfl){const entry=manifest[abbr];assert.ok(entry,abbr);assert.ok(fs.existsSync(path.join(root,entry.logo)),abbr+' crest');assert.ok(entry.stadium?.name,abbr+' stadium');assert.ok(fs.existsSync(path.join(root,entry.stadium.photo)),abbr+' stadium photo');}
});

test('clubhouse follows selected NFL identity and clears its variables for other themes',()=>{
  const dom=new JSDOM('<!doctype html><html><body></body></html>');
  const ctx={window:{PZClubhouse:clubhouse,PZNFLAssets:assets},document:dom.window.document,TEAMS:teams};vm.createContext(ctx);
  const begin=html.indexOf('function clubhouseTheme()'),end=html.indexOf('function clubhouseAllRows()',begin);
  vm.runInContext(html.slice(begin,end),ctx);const el=dom.window.document.documentElement;
  el.dataset.team='nfl:LV';ctx.syncClubhouse();assert.equal(el.dataset.clubhouse,'nfl');assert.ok(el.style.getPropertyValue('--club-accent'));
  el.dataset.team='nba:CHI';ctx.syncClubhouse();assert.equal(el.dataset.clubhouse,undefined);assert.equal(el.style.getPropertyValue('--club-accent'),'');dom.window.close();
});

function liveHelpers(state = {}) {
  const begin = html.indexOf('function clubhouseTheme()');
  const end = html.indexOf('function clubhouseNextHTML(', begin);
  assert.ok(begin >= 0 && end > begin, 'clubhouse lifecycle and player helpers are present');
  const ctx = {
    S: { clubhouseLeague: '', clubhouseStatus: 'open', ...state },
    P: key => ({ sport: String(key).startsWith('nba') ? 'nba' : 'nfl' }),
    sweatDead: result => result.state === 'dead' || result.state === 'lost' || result.payout === 0,
    sweatDone: grade => ['hit', 'miss', 'void', 'dnp'].includes(grade.state),
    sweatLegLive: (leg, grade) => grade.state === 'live',
    sweatIsLive: result => result.legs.some(({ g }) => g.state === 'live'),
    sweatOtherSelections: ticket => ticket.other || [],
    sweatEvents: result => result.events || [],
    document: { activeElement: null },
    now: 10000,
  };
  ctx.Date = class extends Date { static now() { return ctx.now; } };
  vm.createContext(ctx);
  vm.runInContext(html.slice(begin, end), ctx);
  return ctx;
}

function selection(player, state = 'scheduled', extra = {}) {
  return { leg: { player, market: 'rec_yds', line: 35.5, dir: 'over', ...extra }, g: { state } };
}

function ticket(id, legs, { sport = 'nfl', payout = null, state = 'open', other = [] } = {}) {
  return { t: { id, sport, other }, r: { state, payout, legs } };
}

test('clubhouse lifecycle gives dead and settlement states priority over live legs', () => {
  const ctx = liveHelpers();
  assert.equal(ctx.clubhouseLifecycle(ticket('busted-live', [selection('nfl-a', 'live')], { state: 'dead' })), 'dead');
  assert.equal(ctx.clubhouseLifecycle(ticket('zero-payout-live', [selection('nfl-a', 'live')], { payout: 0 })), 'dead');
  assert.equal(ctx.clubhouseLifecycle(ticket('paid-live', [selection('nfl-a', 'live')], { payout: 12 })), 'settling');
  assert.equal(ctx.clubhouseLifecycle(ticket('finished', [selection('nfl-a', 'hit'), selection('nfl-b', 'void')])), 'settling');
  assert.equal(ctx.clubhouseLifecycle(ticket('live', [selection('nfl-a', 'hit'), selection('nfl-b', 'live')])), 'live');
  assert.equal(ctx.clubhouseLifecycle(ticket('future', [selection('nfl-a')])), 'upcoming');
  assert.equal(ctx.clubhouseLifecycle(ticket('unlinked', [], { other: ['Unlinked venue selection'] })), 'upcoming');
  assert.equal(ctx.clubhouseLifecycle(ticket('partially-linked', [selection('nfl-a', 'hit')], { other: ['Unlinked venue selection'] })), 'upcoming');
});

test('clubhouse status filters exclude completed tickets from upcoming and busted tickets from live', () => {
  const rows = [
    ticket('completed', [selection('nfl-a', 'hit')]),
    ticket('paid', [selection('nfl-a', 'hit')], { payout: 20 }),
    ticket('busted-live', [selection('nfl-a', 'live')], { state: 'dead' }),
    ticket('live', [selection('nfl-a', 'live')]),
    ticket('upcoming', [selection('nfl-a')]),
  ];
  const ctx = liveHelpers({ clubhouseStatus: 'upcoming' });
  assert.deepEqual(Array.from(ctx.clubhouseVisibleRows(rows), row => row.t.id), ['upcoming']);
  ctx.S.clubhouseStatus = 'live';
  assert.deepEqual(Array.from(ctx.clubhouseVisibleRows(rows), row => row.t.id), ['live']);
  ctx.S.clubhouseStatus = 'dead';
  assert.deepEqual(Array.from(ctx.clubhouseVisibleRows(rows), row => row.t.id), ['busted-live']);
  ctx.S.clubhouseStatus = 'settling';
  assert.deepEqual(Array.from(ctx.clubhouseVisibleRows(rows), row => row.t.id), ['completed', 'paid']);
  ctx.S.clubhouseStatus = 'open';
  assert.deepEqual(Array.from(ctx.clubhouseVisibleRows(rows), row => row.t.id), ['live', 'upcoming']);
  ctx.S.clubhouseStatus = 'all';
  assert.equal(ctx.clubhouseVisibleRows(rows).length, rows.length);
});

test('clubhouse player league filter applies to each leg of a mixed-league ticket', () => {
  const rows = [ticket('mixed', [selection('nfl-a', 'live'), selection('nba-a', 'live')], { sport: 'nba' })];
  const ctx = liveHelpers({ clubhouseLeague: 'nfl', clubhouseStatus: 'all' });
  assert.equal(ctx.clubhouseVisibleRows(rows).length, 1, 'mixed ticket contains an NFL selection');
  const entries = ctx.clubhousePlayerEntries(rows);
  assert.deepEqual(Array.from(entries, entry => entry.leg.player), ['nfl-a']);
  assert.deepEqual(Array.from(entries[0].tickets), ['mixed']);
  ctx.S.clubhouseLeague = 'nba';
  assert.deepEqual(Array.from(ctx.clubhousePlayerEntries(rows), entry => entry.leg.player), ['nba-a']);
});

test('clubhouse live player view omits scheduled and completed legs within a live ticket', () => {
  const rows = [ticket('mixed-status', [selection('nfl-live', 'live'), selection('nfl-future'), selection('nfl-done', 'hit')])];
  const ctx = liveHelpers({ clubhouseStatus: 'live' });
  assert.deepEqual(Array.from(ctx.clubhousePlayerEntries(rows), entry => entry.leg.player), ['nfl-live']);
});

test('clubhouse aggregates matching event selections across tickets without merging different games', () => {
  const rows = [
    ticket('a', [selection('nfl-a', 'live', { eventId: 'game-1' })]),
    ticket('b', [selection('nfl-a', 'live', { eventId: 'game-1' })]),
    ticket('c', [selection('nfl-a', 'scheduled', { eventId: 'game-2' })]),
  ];
  const ctx = liveHelpers({ clubhouseStatus: 'all' });
  const entries = ctx.clubhousePlayerEntries(rows);
  assert.equal(entries.length, 2);
  assert.deepEqual(Array.from(entries.find(entry => entry.leg.eventId === 'game-1').tickets).sort(), ['a', 'b']);
  assert.deepEqual(Array.from(entries.find(entry => entry.leg.eventId === 'game-2').tickets), ['c']);
  const unbound = [
    ticket('d', [selection('nfl-a', 'scheduled', { startsAt: '2026-10-22T23:00:00Z' })]),
    ticket('e', [selection('nfl-a', 'scheduled', { startsAt: '2026-10-29T23:00:00Z' })]),
  ];
  assert.equal(ctx.clubhousePlayerEntries(unbound).length, 2, 'distinct scheduled starts remain separate before event binding');
});

test('clubhouse Live retains contracts, alert preferences, and activity tape', () => {
  const begin = html.indexOf('function viewClubhouseLive()');
  const end = html.indexOf('/* ---------------- shared pieces', begin);
  assert.ok(begin >= 0 && end > begin);
  const source = html.slice(begin, end);
  for (const helper of ['contractsHTML', 'alertPrefsHTML', 'tapeHTML']) {
    assert.match(source, new RegExp(`\\b${helper}\\(\\)`), `${helper} remains available in the redesigned Live page`);
  }
});

test('clubhouse next-game events follow the selected league within mixed tickets', () => {
  const nflUpcoming = { id: 'nfl-next', sport: 'nfl', state: 'pre', date: '2026-10-23T00:15:00Z' };
  const nbaLive = { id: 'nba-live', sport: 'nba', state: 'in', date: '2026-10-22T23:00:00Z' };
  const nflFinal = { id: 'nfl-final', sport: 'nfl', state: 'post', date: '2026-10-21T23:00:00Z' };
  const mixed = ticket('mixed-games', [selection('nfl-a'), selection('nba-a', 'live')], { sport: 'nba' });
  mixed.r.events = [nbaLive, nflUpcoming, nflFinal];
  const ctx = liveHelpers({ clubhouseLeague: 'nfl' });
  assert.equal(typeof ctx.clubhouseEvents, 'function');
  assert.deepEqual(Array.from(ctx.clubhouseEvents([mixed]), event => event.id), ['nfl-next'], 'NBA live game cannot replace the selected NFL game');
  ctx.S.clubhouseLeague = 'nba';
  assert.deepEqual(Array.from(ctx.clubhouseEvents([mixed]), event => event.id), ['nba-live']);
});

test('clubhouse game watch removes finals and duplicate events, with live games first then start date', () => {
  const events = {
    later: { id: 'later', sport: 'nfl', state: 'pre', date: '2026-10-25T20:25:00Z' },
    earlier: { id: 'earlier', sport: 'nfl', state: 'pre', date: '2026-10-23T00:15:00Z' },
    liveLater: { id: 'live-later', sport: 'nba', state: 'in', date: '2026-10-22T23:30:00Z' },
    liveEarlier: { id: 'live-earlier', sport: 'nfl', state: 'in', date: '2026-10-22T23:00:00Z' },
    final: { id: 'final', sport: 'nfl', state: 'post', date: '2026-10-21T23:00:00Z' },
  };
  const a = ticket('a', []), b = ticket('b', []);
  a.r.events = [events.later, events.liveLater, events.final];
  b.r.events = [events.earlier, events.liveEarlier, { ...events.later }];
  const ctx = liveHelpers();
  assert.deepEqual(Array.from(ctx.clubhouseEvents([a, b]), event => event.id), ['live-earlier', 'live-later', 'earlier', 'later']);
});

function focusSelect(ctx, id) {
  ctx.document.activeElement = { id, matches: selectors => selectors.split(',').some(selector => selector.trim() === `#${id}`) };
}

test('clubhouse refresh deferral expires after a canceled dropdown even while focus stays on it', () => {
  const ctx = liveHelpers({ clubhouseEditingUntil: 11000 });
  assert.equal(typeof ctx.clubhouseDeferRender, 'function');
  focusSelect(ctx, 'clubLeague');
  assert.equal(ctx.clubhouseDeferRender(), true);
  ctx.now = 10999;
  assert.equal(ctx.clubhouseDeferRender(), true);
  ctx.now = 11000;
  assert.equal(ctx.clubhouseDeferRender(), false, 'deadline is exclusive');
  ctx.now = 12000;
  assert.equal(ctx.clubhouseDeferRender(), false, 'a canceled select cannot stop later live updates indefinitely');
});

test('clubhouse refresh defers only the two active selects and force always bypasses it', () => {
  const ctx = liveHelpers({ clubhouseEditingUntil: 11000 });
  assert.equal(ctx.clubhouseDeferRender(), false, 'no focused control');
  for (const id of ['clubLeague', 'clubStatus']) {
    focusSelect(ctx, id);
    assert.equal(ctx.clubhouseDeferRender(), true, id);
    assert.equal(ctx.clubhouseDeferRender(true), false, `${id}: explicit render overrides editing guard`);
  }
  focusSelect(ctx, 'anotherSelect');
  assert.equal(ctx.clubhouseDeferRender(), false, 'other selects do not pause the page');
  ctx.document.activeElement = { id: 'clubhouseButton', matches: () => false };
  assert.equal(ctx.clubhouseDeferRender(), false, 'nonselect focus does not pause the page');
  focusSelect(ctx, 'clubLeague');
  ctx.S.clubhouseEditingUntil = 0;
  assert.equal(ctx.clubhouseDeferRender(), false, 'focused select without an active edit deadline');
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const mathScript = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(x => x[1]).find(x => x.includes('root.PZM = api'));
const context = { module: { exports: {} } };
vm.runInNewContext(mathScript.split('/* Poizen Lounge — slip builder')[0], context);
const M = context.module.exports;

test('basic themes remain free while team themes require Pro and playoffs require Elite', () => {
  assert.equal(M.canUse('free', 'themes'), true);
  assert.equal(M.canUse('free', 'teamThemes'), false);
  assert.equal(M.canUse('pro', 'teamThemes'), true);
  assert.equal(M.canUse('pro', 'playoffs'), false);
  assert.equal(M.canUse('elite', 'playoffs'), true);
});
test('a requested team waits for paid auth and clears on expiry or account mismatch', () => {
  const rootEl = {dataset:{vibe:'midnight'},style:{setProperty(){},removeProperty(){}}};
  const S = {me:{user:null,tier:null}};
  const ctx = {S, M, OWNER_EMAIL:'owner@example.com', document:{documentElement:rootEl}, TEAMS:{nfl:[['LV','Las Vegas Raiders','000000','A5ACAF']]}, updateVibeBtn(){},renderTeamGrid(){},teamLogo(){return 'logo.png';}, store:{get(){return 'nfl:DAL';}}, params:new URLSearchParams('team=nfl-lv')};
  vm.createContext(ctx);
  const meTier = html.slice(html.indexOf('function meTier()'),html.indexOf('const isOwner'));
  const team = html.slice(html.indexOf('const hexRgb ='),html.indexOf('function updateVibeBtn()'));
  vm.runInContext(meTier + '\n' + team,ctx);
  vm.runInContext(html.split('\n').find(x=>x.startsWith('S.requestedTeam = params.get')) + '\n' + html.match(/function preferredTeam\(\) \{[^\n]+\}/)[0],ctx);
  vm.runInContext('applyTeam(preferredTeam())',ctx);
  assert.equal(rootEl.dataset.team,undefined);
  S.me.user={email:'member@example.com'};
  S.me.tier={tier:'pro',email:'member@example.com',until:Date.now()+100000};
  vm.runInContext('applyTeam(preferredTeam())',ctx);
  assert.equal(rootEl.dataset.team,'nfl:LV');
  S.me.tier.until=Date.now()-1;
  vm.runInContext('applyTeam(preferredTeam())',ctx);
  assert.equal(rootEl.dataset.team,undefined);
  S.me.tier.until=Date.now()+100000;S.me.tier.email='someone-else@example.com';
  vm.runInContext('applyTeam(preferredTeam())',ctx);
  assert.equal(rootEl.dataset.team,undefined);
});
test('five mobile destinations keep every existing section reachable', () => {
  assert.ok(fs.existsSync(path.join(root, 'mobile.js')), 'mobile navigation module is missing');
  const ui = require('../mobile.js');
  assert.equal(ui.PRIMARY.length, 5);
  const ids = ['live', 'me', 'pick6', 'ftd', 'scalp', 'pickem', 'games', 'injuries', 'research', 'ledger'];
  for (const id of ids) assert.ok(ui.PRIMARY.some(x => x.id === ui.groupFor(id)), `${id} has no destination`);
});
test('ticker wraps seamlessly, pauses, and clamps long background gaps', () => {
  assert.ok(fs.existsSync(path.join(root, 'mobile.js')), 'ticker module is missing');
  const { nextOffset } = require('../mobile.js');
  assert.equal(nextOffset(199, 100, 200, false), 1);
  assert.equal(nextOffset(199, 100, 200, true), 199);
  assert.equal(nextOffset(0, 30000, 200, false), 2);
  assert.equal(nextOffset(12, 100, 0, false), 12);
});
test('ticker keeps fractional movement between browser scroll events', () => {
  const callbacks = [];
  class Element {
    constructor() { this.children = []; this.events = {}; this.clientWidth = 100; this._scroll = 0; this.hidden = false; }
    addEventListener(name, fn) { this.events[name] = fn; }
    setAttribute() {}
    getBoundingClientRect() { return { width: 300 }; }
    cloneNode() { return new Element(); }
    appendChild(el) { this.children.push(el); }
    replaceChildren(el) { this.children = [el]; }
    get firstElementChild() { return this.children[0]; }
    contains() { return false; }
    set scrollLeft(value) { this._scroll = Math.round(value); }
    get scrollLeft() { return this._scroll; }
  }
  const record = new Element(), pause = new Element(), more = new Element();
  const doc = { hidden: false, activeElement: null, getElementById: id => ({record, recordPause:pause, mobileMore:more})[id], addEventListener() {}, createElement: () => new Element() };
  const window = { document:doc, matchMedia:() => ({matches:false,addEventListener(){}}), requestAnimationFrame: fn => callbacks.push(fn), addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(root,'mobile.js'),'utf8'), {window,performance:{now:()=>0}});
  window.PZMobile.setRecord('<div>Record</div>');
  let now = 0;
  for (let i=0; i<12; i++) { const batch=callbacks.splice(0); now+=16; batch.forEach(fn=>fn(now)); record.events.scroll?.(); }
  assert.ok(record.scrollLeft >= 3, `ticker stalled at ${record.scrollLeft}px`);
  const before = record.scrollLeft;
  doc.hidden=true;
  callbacks.splice(0).forEach(fn=>fn(now+100));
  assert.equal(record.scrollLeft,before);
});
test('mobile theme sheet focuses its first control and traps forward/reverse Tab', () => {
  const events={};
  const doc={hidden:false,activeElement:null,addEventListener(name,fn){events[name]=fn;}};
  const first={focus(){doc.activeElement=this;}}, last={focus(){doc.activeElement=this;}};
  const menu={hidden:false,querySelector(){return first;},querySelectorAll(){return [first,last];},contains(el){return el===first||el===last;}};
  const inertElement={addEventListener(){}};
  doc.getElementById=id=>id==='vibeMenu'?menu:inertElement;
  const window={document:doc,matchMedia:q=>({matches:q.includes('max-width'),addEventListener(){}}),requestAnimationFrame(){},addEventListener(){}};
  vm.runInNewContext(fs.readFileSync(path.join(root,'mobile.js'),'utf8'),{window,performance:{now:()=>0}});
  window.PZMobile.themeOpened();assert.equal(doc.activeElement,first);
  events.keydown({key:'Tab',shiftKey:true,preventDefault(){}});assert.equal(doc.activeElement,last);
  events.keydown({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(doc.activeElement,first);
  doc.activeElement={};
  events.keydown({key:'Tab',shiftKey:false,preventDefault(){}});assert.equal(doc.activeElement,first);
});
test('all inline scripts parse', () => {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (!/application\/ld\+json/.test(match[1])) new vm.Script(match[2]);
  }
});

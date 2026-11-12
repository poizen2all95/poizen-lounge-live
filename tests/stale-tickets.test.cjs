const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const src=html.slice(html.indexOf('const STALE_MS'),html.indexOf('parkStale(S.slate);'));
const DAY=86400e3,now=Date.parse('2026-11-12T12:00:00Z');
const at=d=>new Date(now-d*DAY).toISOString();
function run(pick6,updated){const c={S:{},esc:String,Date,Math,Number};vm.createContext(c);vm.runInContext(src,c);const s={pick6,updated};c.parkStale(s,now);return {s,S:c.S,notice:c.staleNotice()};}
test('an unsettled ticket last seen more than 8 days ago leaves the live board',()=>{
 const {s,S}=run([{id:'old',verifiedAt:at(12),legs:[]},{id:'new',verifiedAt:at(2),legs:[]}]);
 assert.deepEqual(s.pick6.map(t=>t.id),['new']);assert.deepEqual(S.stale.map(t=>t.id),['old']);
});
test('settled tickets and tickets with no capture time are never parked',()=>{
 const {s,S}=run([{id:'paid',verifiedAt:at(20),settlement:{payout:0}},{id:'manual',legs:[]}]);
 assert.equal(s.pick6.length,2);assert.equal(S.stale.length,0);
});
test('the newest sighting on the ticket counts, including venue progress',()=>{
 const {s}=run([{id:'x',verifiedAt:at(12),venueProgress:{verifiedAt:at(1)}}]);
 assert.equal(s.pick6.length,1);
});
test('the notice counts parked tickets and names the last DraftKings sync',()=>{
 const r=run([{id:'a',verifiedAt:at(12)},{id:'b',verifiedAt:at(11)}],at(11));
 assert.match(r.notice,/2 older tickets are waiting on a result from DraftKings/);assert.match(r.notice,/Nov 1/);
 assert.equal(run([{id:'n',verifiedAt:at(1)}]).notice,'');
});

function sync(days,contracts){const c={S:{},esc:String,Date,Math,Number};vm.createContext(c);vm.runInContext(src,c);c.parkStale({pick6:[],contracts,updated:days===null?undefined:at(days)},now);return c.tradeSync(now);}
test('the trades pill is green within a day, amber after one, red after three',()=>{
 assert.equal(sync(0.2).tone,'ok');assert.equal(sync(2).tone,'warn');assert.equal(sync(11).tone,'bad');
 assert.match(sync(11).when,/Nov 1/);assert.match(sync(11).title,/DraftKings/);
});
test('a contract seen more recently than any ticket counts as the last sync; no data shows no pill',()=>{
 assert.equal(sync(11,[{id:'c',verifiedAt:at(0.5)}]).tone,'ok');
 assert.equal(sync(null),null);
});
test('Live Sweat starts closed and the empty board shows the record',()=>{
 assert.match(html,/S\.sweatOpen = false;/);assert.doesNotMatch(html,/No slips on the board yet/);
 assert.match(html,/function lastResultsHTML\(\)/);
});

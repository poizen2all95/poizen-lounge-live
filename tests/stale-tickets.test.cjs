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
 assert.equal(sync(11,[{id:'c',venue:'DraftKings Predictions',verifiedAt:at(0.5)}]).tone,'ok');
 assert.equal(sync(11,[{id:'k',venue:'Kalshi',verifiedAt:at(0.5)}]).tone,'bad');
 assert.equal(sync(null),null);
});
test('Live Sweat starts closed and the empty board shows the record',()=>{
 assert.match(html,/S\.sweatOpen = false;/);assert.doesNotMatch(html,/No slips on the board yet/);
 assert.match(html,/function lastResultsHTML\(\)/);
});

test('the nav bar is five icons plus More, with no visible words',()=>{
 const m=html.match(/const NAV5 = \[([^\]]+)\]/);assert.equal(m[1].split(',').length,5);
 const neck=html.slice(html.indexOf('function necklaceHTML'),html.indexOf('function renderNav'));assert.doesNotMatch(neck,/data-label/);assert.match(neck,/aria-label/);
 const mob=fs.readFileSync(path.join(__dirname,'..','mobile.js'),'utf8');const bar=mob.slice(mob.indexOf('bottom.innerHTML'),mob.indexOf('const grid'));assert.doesNotMatch(bar,/<span>/);assert.match(bar,/aria-label/);
});
test('lottos fold only when there are three or more, and closed trades moved to the Ledger',()=>{
 const src2=html.slice(html.indexOf('function lottoFold'),html.indexOf('function viewLive'));
 const c={window:{PZTradeCards:{slipLotto:t=>t.entry<=1}},money:n=>'$'+n,Math,Number};vm.createContext(c);vm.runInContext(src2,c);
 const mk=(e,p,state='open')=>({t:{entry:e},r:{entry:e,potential:p,state}});
 assert.equal(c.lottoFold([mk(1,5),mk(1,9),mk(10,30)],()=>'x').fold,'');
 const f=c.lottoFold([mk(1,5),mk(1,269),mk(1,900,'dead'),mk(10,30)],()=>'x');assert.equal(f.real.length,1);assert.match(f.fold,/3 lottos · \$3 in · best still alive: \$269/);
 const ct=html.slice(html.indexOf('function contractsHTML'),html.indexOf('function contractsPanel'));assert.doesNotMatch(ct,/closed trades · history/);assert.match(html,/closedTradesHTML\(\) \+/);
});

test('the stage adds up money in play, the best payout and money by venue, and speaks plainly when empty',()=>{
 const src3=html.slice(html.indexOf('function stageMath'),html.indexOf('function stageBadge'));
 const c={Math,Object,Date};vm.createContext(c);vm.runInContext(src3,c);
 const list=[{venue:'Kalshi',cost:2,pays:46.85},{venue:'Kalshi',cost:0.5,pays:333.33,lotto:true},{venue:'DraftKings',cost:10,pays:30}];
 const m=c.stageMath(list);assert.equal(m.n,3);assert.equal(m.inPlay,12.5);assert.equal(m.best,333.33);assert.equal(m.venues[0][0],'DraftKings');
 assert.match(c.stageVoice(list,m),/2 plays with real money on them, and 1 lotto/);
 assert.match(c.stageVoice([],c.stageMath([])),/Nothing live/);
});

test('a plan posted more than eight days ago leaves the board; an undated or recent one stays',()=>{
 const c={S:{},esc:String,Date,Math,Number};vm.createContext(c);vm.runInContext(src,c);
 const s={pick6:[],firstTD:{bets:[1],postedAt:at(26)},scalp:{shifts:[1],postedAt:at(3)},research:[{player:'x'}],researchPostedAt:at(26)};
 c.parkStale(s,now);
 assert.equal(s.firstTD,undefined);assert.ok(s.scalp);assert.equal(s.research.length,0);
 assert.equal(c.S.oldPlans.firstTD,at(26));assert.equal(c.S.oldPlans.scalp,undefined);assert.match(c.oldPlanDate('firstTD'),/Oct 1[67]/);
 const u={pick6:[],firstTD:{bets:[1]},research:[{player:'x'}]};c.parkStale(u,now);assert.ok(u.firstTD);assert.equal(u.research.length,1);assert.equal(c.oldPlanDate('firstTD'),'');
});
test('a trade is over once its market has closed, even with no game status',()=>{
 const line=html.match(/const tradeOver = [^\n]*/)[0];
 const c={S:{tradeStatus:{a:{status:'ended'}}},Date,Number};vm.createContext(c);vm.runInContext(line+'this.tradeOver=tradeOver;',c);
 assert.equal(c.tradeOver({id:'a'}),true);
 assert.equal(c.tradeOver({id:'k',closesAt:new Date(Date.now()-3600e3).toISOString()}),true);
 assert.equal(c.tradeOver({id:'k',closesAt:new Date(Date.now()+3600e3).toISOString()}),false);
 assert.equal(c.tradeOver({id:'n'}),false);
});
test('the owner console date-stamps a plan when it is new or its content changes, and keeps the date otherwise',()=>{
 const admin=fs.readFileSync(path.join(__dirname,'..','admin.html'),'utf8');
 const a=admin.indexOf('{ const sig = (v) =>'),b=admin.indexOf('A.slate.updated = new Date().toISOString();',a);assert.ok(a>0&&b>a);
 const run=(slate)=>{const c={A:{slate},JSON,Date};vm.createContext(c);vm.runInContext(admin.slice(a,b),c);return c.A.slate;};
 const fresh=run({firstTD:{bets:[{player:'a'}]},research:[]});assert.ok(fresh.firstTD.postedAt&&fresh.firstTD.postedSig);
 const kept=run({firstTD:{bets:[{player:'a'}],postedAt:'2026-10-17T00:46:59Z'}});assert.equal(kept.firstTD.postedAt,'2026-10-17T00:46:59Z');assert.ok(kept.firstTD.postedSig);
 const same=run(JSON.parse(JSON.stringify(kept)));assert.equal(same.firstTD.postedAt,'2026-10-17T00:46:59Z');
 const edited=JSON.parse(JSON.stringify(kept));edited.firstTD.bets.push({player:'b'});assert.notEqual(run(edited).firstTD.postedAt,'2026-10-17T00:46:59Z');
});

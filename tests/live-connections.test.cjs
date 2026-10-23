const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),E=require('../engine.js');
test('live refresh fills imported player identities from verified same-league metadata without replacing existing identities',()=>{
 const players={new:{name:'Drake Maye',sport:'nfl'},existing:{name:'Drake Maye',sport:'nfl',espnId:'current',team:'CURRENT'},other:{name:'Drake Maye',sport:'nba'}};
 E.hydratePlayers(players,{canonical:{name:'Drake Maye',sport:'nfl',espnId:'4431452',team:'NE',number:'10'}});
 assert.equal(players.new.espnId,'4431452');assert.equal(players.new.team,'NE');assert.equal(players.existing.espnId,'current');assert.equal(players.existing.team,'CURRENT');assert.equal(players.other.espnId,undefined);
});
test('newly synced upcoming receipts without old stage metadata bind to the exact upcoming game',()=>{
 const html=fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8');
 const leg={player:'p',market:'pts',line:20,venueOnly:true};const t={source:'dk-live-capture',verifiedAt:'2026-10-23T19:00:00Z',legs:[leg]};
 const c={S:{events:{game:{id:'game',sport:'nba',date:'2026-10-23T23:00:00Z',comps:[{id:'1'}]}}},E,P:()=>({sport:'nba',teamId:'1'}),activeTickets:()=>[t],eventFor:()=>null};
 vm.createContext(c);vm.runInContext(html.slice(html.indexOf('function eventForLeg('),html.indexOf('function gameForLeg(')),c);
 assert.equal(c.eventForLeg(leg)?.id,'game');assert.equal(leg.eventId,'game');
 delete leg.eventId;delete leg.startsAt;t.venueProgress={source:'venue',legResults:['hit']};assert.equal(c.eventForLeg(leg),null);
});
test('confirmed venue progress keeps its result and also shows exact-game player stats',()=>{
 const game={id:'event',sport:'nba',status:{state:'in'},box:{players:{one:{id:'one',name:'Player',stats:{pts:22}}},byName:{player:'one'}}};
 const r=E.gradePick6({entry:1,toWin:3,legs:[{name:'Player',espnId:'one',market:'pts',line:20.5,eventId:'event',venueOnly:true}],venueProgress:{source:'venue',legResults:['hit']}},()=>game);
 assert.equal(r.legs[0].g.state,'hit');assert.equal(r.legs[0].g.value,22);
});

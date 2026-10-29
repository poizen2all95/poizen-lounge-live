const {test}=require('node:test');const assert=require('node:assert/strict');const T=require('../trade-status.js');
const H=3600e3,D=24*H,CAP=Date.parse('2026-10-22T14:00:00Z');
const ev=(id,sport,hoursAfterCap,state,comps,completed=state==='post')=>({id,sport,date:new Date(CAP+hoursAfterCap*H).toISOString(),state,completed,comps});
const comp=(abbr,name,winner)=>({abbr,name,winner});

test('reads the live-capture format: wins, props and anytime scorers',()=>{
 const r=T.parseLegs("OKC Thunder — To Win | 22+ — Shai Gilgeous-Alexander Points | Jack Hughes — Anytime Goalscorer | D'Andre Swift — Anytime TD Scorer | 200+ — Caleb Williams Passing Yards");
 assert.equal(r.unparsed,0);assert.deepEqual(r.legs.map(l=>l.kind),['win','prop','prop','prop','prop']);
 assert.deepEqual(r.legs[1],{kind:'prop',player:'Shai Gilgeous-Alexander',market:'pts',line:21.5,inclusive:22});
 assert.equal(r.legs[2].market,'goals');assert.equal(r.legs[3].market,'anytime_td');assert.equal(r.legs[4].market,'pass_yds');
});
test('reads the receipt format, including alternating player / anytime tokens',()=>{
 const a=T.parseLegs('6 Pick Combo: Jack Hughes · Anytime Goalscorer · David Pastrnak · Anytime Goalscorer');
 assert.equal(a.unparsed,0);assert.deepEqual(a.legs.map(l=>l.player),['Jack Hughes','David Pastrnak']);
 const b=T.parseLegs('5 Pick Combo: CHI Bears To Win · NO Saints To Win · 2+ Drake Maye Passing Touchdowns');
 assert.equal(b.unparsed,0);assert.deepEqual(b.legs.map(l=>l.kind),['win','win','prop']);assert.equal(b.legs[2].market,'pass_td');
});
test('a title cut off mid-leg is counted as unparsed, never guessed',()=>{
 const r=T.parseLegs('3 Pick Combo: 1+ Brice Turang Home Runs · MIL Brewers To Win · 1+ Jake Bau');
 assert.equal(r.legs.length,2);assert.equal(r.unparsed,1);
 assert.equal(T.parseLegs('OKC Thunder — To Win | MIA Heat — To').unparsed,1);
 assert.equal(T.parseLegs('').legs.length,0);
});
test('a lost leg kills the whole combo even when other games are still to play',()=>{
 const events=[ev('1','nba',9,'post',[comp('OKC','Thunder',false),comp('HOU','Rockets',true)]),ev('2','nba',10,'pre',[comp('BOS','Celtics',undefined),comp('NYK','Knicks',undefined)])];
 const r=T.resolve({verifiedAt:new Date(CAP).toISOString(),title:'OKC Thunder — To Win | BOS Celtics — To Win'},{now:CAP+12*H,events});
 assert.equal(r.status,'dead');
});
test('every game final and every leg hit is won; a push or missing stats is only ended',()=>{
 const events=[ev('1','nba',9,'post',[comp('OKC','Thunder',true),comp('HOU','Rockets',false)]),ev('2','nba',10,'post',[comp('BOS','Celtics',true),comp('NYK','Knicks',false)])];
 const c={verifiedAt:new Date(CAP).toISOString(),title:'OKC Thunder — To Win | BOS Celtics — To Win'};
 assert.equal(T.resolve(c,{now:CAP+2*D,events}).status,'won');
 const tie=[ev('1','nba',9,'post',[comp('OKC','Thunder',undefined),comp('HOU','Rockets',undefined)]),events[1]];
 assert.equal(T.resolve(c,{now:CAP+2*D,events:tie}).status,'ended');
});
test('a title that was cut off can never be called won, but can be ended once its found games are final',()=>{
 const events=[ev('1','nba',9,'post',[comp('OKC','Thunder',true),comp('HOU','Rockets',false)])];
 const c={verifiedAt:new Date(CAP).toISOString(),title:'OKC Thunder — To Win | MIA Heat — To'};
 assert.equal(T.resolve(c,{now:CAP+12*H,events}).status,'upcoming','too soon to assume the cut-off leg is done');
 assert.equal(T.resolve(c,{now:CAP+5*D,events}).status,'ended');
});
test('a game in progress makes the trade live; an unstarted game keeps it upcoming',()=>{
 const c={verifiedAt:new Date(CAP).toISOString(),title:'OKC Thunder — To Win'};
 assert.equal(T.resolve(c,{now:CAP+9*H,events:[ev('1','nba',8,'in',[comp('OKC','Thunder'),comp('HOU','Rockets')],false)]}).status,'live');
 assert.equal(T.resolve(c,{now:CAP+H,events:[ev('1','nba',8,'pre',[comp('OKC','Thunder'),comp('HOU','Rockets')],false)]}).status,'upcoming');
});
test('no game found is only called ended once the trade is days old',()=>{
 const c={verifiedAt:new Date(CAP).toISOString(),title:'OKC Thunder — To Win'};
 assert.equal(T.resolve(c,{now:CAP+H,events:[]}).status,'unknown');
 assert.equal(T.resolve(c,{now:CAP+5*D,events:[]}).status,'unknown','a week out games are possible, so do not guess earlier');
 const r=T.resolve(c,{now:CAP+8*D,events:[]});assert.equal(r.status,'ended');assert.match(r.reason,/8 days ago/);
 assert.equal(T.resolve({title:'OKC Thunder — To Win'},{now:CAP,events:[]}).status,'unknown','no capture time means no guess');
});
test('NY Giants is read as the NFL team when the other legs are football, and not the MLB club',()=>{
 const events=[ev('f','nfl',9,'post',[comp('NYG','Giants',true),comp('PHI','Eagles',false)]),ev('m','mlb',9,'post',[comp('SF','Giants',false),comp('LAD','Dodgers',true)]),ev('g','nfl',10,'post',[comp('CHI','Bears',true),comp('MIN','Vikings',false)])];
 const r=T.resolve({verifiedAt:new Date(CAP).toISOString(),title:'5 Pick Combo: CHI Bears To Win · NY Giants To Win'},{now:CAP+2*D,events});
 assert.equal(r.status,'won');
});
test('props are graded by the page and read from the game their team plays',()=>{
 const events=[ev('1','nba',9,'post',[comp('BOS','Celtics',true),comp('NYK','Knicks',false)])];
 const players={'Jayson Tatum':{sport:'nba',team:'BOS'}};
 const mk=state=>T.resolve({verifiedAt:new Date(CAP).toISOString(),title:'25+ — Jayson Tatum Points'},{now:CAP+2*D,events,player:n=>players[n]||null,gradeProp:()=>state});
 assert.equal(mk('hit').status,'won');assert.equal(mk('miss').status,'dead');assert.equal(mk('dnp').status,'ended');
 const unknown=T.resolve({verifiedAt:new Date(CAP).toISOString(),title:'25+ — Nobody Known Points'},{now:CAP+8*D,events,player:()=>null});
 assert.equal(unknown.status,'ended','unknown player falls back to the age rule, and says why');assert.match(unknown.reason,/days ago/);
});

test('a team name must agree with its abbreviation: the NFL Jets are not the NHL Jets',()=>{
 assert.equal(T.teamMatches('NY Jets',{abbr:'NYJ',name:'Jets'}),true);
 assert.equal(T.teamMatches('NY Jets',{abbr:'WPG',name:'Jets'}),false);
 assert.equal(T.teamMatches('LA Lakers',{abbr:'LAL',name:'Lakers'}),true);
 assert.equal(T.teamMatches('UTA Jazz',{abbr:'UTAH',name:'Jazz'}),true);
 assert.equal(T.teamMatches('NY Giants',{abbr:'SF',name:'Giants'}),false);
 assert.equal(T.teamMatches('Thunder',{abbr:'OKC',name:'Thunder'}),true);
 const events=[ev('n','nhl',9,'post',[comp('WPG','Jets',false),comp('DAL','Stars',true)]),ev('f','nfl',9,'post',[comp('NYJ','Jets',true),comp('NE','Patriots',false)])];
 const r=T.resolve({verifiedAt:new Date(CAP).toISOString(),title:'NY Jets — To Win'},{now:CAP+2*D,events});
 assert.equal(r.status,'won','must read the football game, not the hockey one');
});
test('points + rebounds + assists reads as the combined market',()=>{
 const r=T.parseLegs('22+ — Giannis Antetokounmpo Points + Rebounds + Assists | 5+ — Ja Morant Assists');
 assert.equal(r.unparsed,0);assert.equal(r.legs[0].market,'pra');assert.equal(r.legs[0].player,'Giannis Antetokounmpo');assert.equal(r.legs[1].market,'ast');
});

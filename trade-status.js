/* Work out whether a DraftKings Predictions trade is still to play, live, over or already lost, from nothing but its title and when it was captured.
   Pure and synchronous: the page supplies the games (compact ESPN scoreboard events) and a grader for player props. */
(function(root){
 'use strict';
 const HOUR=3600e3,DAY=24*HOUR;
 /* what DraftKings calls a stat -> the engine's market key */
 const STATS={'points':'pts','rebounds':'reb','assists':'ast','points + rebounds + assists':'pra','points + rebounds':'pr','points + assists':'pa','rebounds + assists':'ra','three pointers made':'threes','hits':'hits','runs':'runs','rbis':'rbis','home runs':'home_runs','hits + runs + rbis':'hrr','passing yards':'pass_yds','passing attempts':'pass_att','strikeouts thrown':'pitcher_ks','rushing yards':'rush_yds','receiving yards':'rec_yds','passing touchdowns':'pass_td','receptions':'receptions','shots on goal':'shots_on_goal'};
 const STAT_RE=Object.keys(STATS).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[+]/g,'\\+')).join('|');
 const ANY={'goalscorer':'goals','td scorer':'anytime_td'};
 const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const num=x=>{const n=Number(x);return Number.isFinite(n)?n:null;};
 const who=raw=>{const m=String(raw).trim().match(/^(.*?)\s*\(([A-Za-z&]{2,6})\)$/);return m?{player:m[1].trim(),hint:m[2].toUpperCase()}:{player:String(raw).trim()};};

 /* Titles come in two shapes (live capture: "A — To Win | 20+ — P Points | P — Anytime Goalscorer"; receipt: "6 Pick Combo: 20+ P Points · A To Win · P · Anytime Goalscorer").
    Anything that cannot be read, such as a title cut off mid-leg, is counted in `unparsed` and never guessed at. */
 function parseLegs(title){
  const t=String(title||'').trim(),legs=[],lost=[];let unparsed=0;
  const body=t.replace(/^\d+\s*Pick Combo:\s*/i,'');
  const dash=/\s—\s/.test(body);
  const add=(l)=>legs.push(l);
  if(dash){
   body.split(/\s*\|\s*/).forEach(raw=>{
    const p=raw.trim();if(!p)return;let m;
    if((m=p.match(/^(.+?)\s+—\s+To Win$/i)))return add({kind:'win',team:m[1].trim()});
    if((m=p.match(/^(.+?)\s+—\s+Anytime (Goalscorer|TD Scorer)$/i)))return add({kind:'prop',...who(m[1]),market:ANY[m[2].toLowerCase()],line:0.5,inclusive:1});
    if((m=p.match(new RegExp('^(\\d+(?:\\.\\d+)?)\\+\\s+—\\s+(.+?)\\s+('+STAT_RE+')$','i')))){const n=num(m[1]);return add({kind:'prop',...who(m[2]),market:STATS[m[3].toLowerCase()],line:n-0.5,inclusive:n});}
    if((m=p.match(/^(.+?)\s+([+-]\d+(?:\.\d+)?)\s+—\s+Spread$/i)))return add({kind:'spread',team:m[1].trim(),spread:num(m[2])});
    unparsed++;lost.push(p);
   });
  }else{
   let name=null;
   body.split(/\s*·\s*/).forEach(raw=>{
    const p=raw.trim();if(!p)return;let m;
    if((m=p.match(/^Anytime (Goalscorer|TD Scorer)$/i))){if(name){add({kind:'prop',player:name,market:ANY[m[1].toLowerCase()],line:0.5,inclusive:1});name=null;}else unparsed++;return;}
    if((m=p.match(/^(.+?)\s+To Win$/i))){if(name){unparsed++;name=null;}return add({kind:'win',team:m[1].trim()});}
    if((m=p.match(new RegExp('^(\\d+(?:\\.\\d+)?)\\+\\s+(.+?)\\s+('+STAT_RE+')$','i')))){if(name){unparsed++;name=null;}const n=num(m[1]);return add({kind:'prop',player:m[2].trim(),market:STATS[m[3].toLowerCase()],line:n-0.5,inclusive:n});}
    if(name)unparsed++;
    name=p;
   });
   if(name)unparsed++;
  }
  return {legs,unparsed,lost,length:t.length};
 }

 function statFromFragment(frag){
  const f=String(frag||'').toLowerCase().trim();if(f.length<2)return null;
  const keys=Object.keys(STATS).filter(k=>k.startsWith(f));if(!keys.length)return null;
  const base=keys.sort((a,b)=>a.length-b.length)[0];return keys.every(k=>k.startsWith(base))?STATS[base]:null;
 }
 /* the last leg of a title cut off at the capture's length limit: a full player name followed by the start of the stat */
 function recoverTail(part,ctx){
  const m=String(part).match(/^(\d+(?:\.\d+)?)\+\s+—\s+(.+)$/);if(!m||!ctx.player)return null;const n=num(m[1]),words=m[2].trim().split(/\s+/);
  for(let i=words.length-1;i>=2;i--){const w=who(words.slice(0,i).join(' '));if(!ctx.player(w.player,w.hint))continue;const market=statFromFragment(words.slice(i).join(' '));if(market)return {kind:'prop',...w,market,line:n-0.5,inclusive:n,recovered:true};}
  return null;
 }
 /* "OKC Thunder" -> the competitor called Thunder; "LA Lakers" has no abbreviation to trust, so match on the team name */
 function abbrMatches(a,b){const fix=x=>({was:'wsh',pho:'phx'})[x]||x;a=fix(norm(a));b=fix(norm(b));return !!a&&!!b&&(a===b||(Math.min(a.length,b.length)>=2&&(a.startsWith(b)||b.startsWith(a))));}
 function teamMatches(label,comp){
  const l=norm(label),n=norm(comp.name);if(!n||!l.endsWith(n))return false;
  /* the part before the nickname ("NY" in "NY Jets") must agree with the club's abbreviation, so the NFL Jets are not the NHL Jets */
  const pre=l.slice(0,l.length-n.length);if(!pre)return true;
  return abbrMatches(pre,comp.abbr);
 }
 function inWindow(ev,cap,hi){const d=Date.parse(ev.date);return Number.isFinite(d)&&d>=cap-3*HOUR&&d<=hi;}
 function spreadState(ev,comp,spread){
  if(ev.state==='in')return 'live';if(ev.state!=='post')return 'scheduled';
  const other=(ev.comps||[]).find(c=>c!==comp),a=num(comp.score),b=other?num(other.score):null;
  if(a===null||b===null)return 'void';const m=a-b+spread;return m>0?'hit':m<0?'miss':'void';
 }
 function legState(ev,comp){
  if(ev.state==='in')return 'live';
  if(ev.state!=='post')return 'scheduled';
  if(!ev.completed&&ev.completed!==undefined)return 'live';
  if(comp&&comp.winner===true)return 'hit';
  if(comp&&comp.winner===false)return (ev.comps||[]).some(c=>c.winner===true)?'miss':'void';
  return 'void';
 }

 /* ctx: { now, events:[compact], player(name)->{sport,team}|null, gradeProp(leg,event,player)->state|null } */
 function resolve(contract,ctx){
  const now=ctx.now,cap=Date.parse(contract.verifiedAt||contract.at||'');
  const parsed=parseLegs(contract.title);
  if(parsed.length>=199&&parsed.lost.length){const last=parsed.lost[parsed.lost.length-1],leg=recoverTail(last,ctx);if(leg){parsed.legs.push(leg);/* the title ended at the length limit, so more legs may follow: it stays unfinished and can be lost but never won */}}
  if(!Number.isFinite(cap))return {status:'unknown',reason:'No capture time',legs:[],unparsed:parsed.unparsed};
  /* nothing readable: the only thing known is how long ago it was placed, and a game is never more than a few days out */
  if(!parsed.legs.length){const a=now-cap;return a>=3*DAY?{status:'ended',reason:'Captured '+Math.floor(a/DAY)+' days ago; the legs could not be read',legs:[],unparsed:parsed.unparsed}:{status:'upcoming',reason:'Too recent to be over',legs:[],unparsed:parsed.unparsed};}
  const hi=Math.min(cap+10*DAY,now+14*DAY),events=(ctx.events||[]).filter(e=>inWindow(e,cap,hi));
  const propSports=new Set();
  const out=parsed.legs.map(l=>{
   if(l.kind==='prop'){const p=ctx.player?ctx.player(l.player,l.hint):null;if(p&&p.sport)propSports.add(p.sport);return {...l,p};}
   return {...l};
  });
  /* a team name like "NY Giants" fits two sports; trust the sport the props point to, else the sport most legs agree on */
  const winSports={};
  out.filter(l=>l.kind==='win'||l.kind==='spread').forEach(l=>{new Set(events.filter(e=>e.comps.some(c=>teamMatches(l.team,c))).map(e=>e.sport)).forEach(s=>{winSports[s]=(winSports[s]||0)+1;});});
  const best=Object.entries(winSports).sort((a,b)=>b[1]-a[1]);
  const tradeSport=propSports.size===1?[...propSports][0]:(best.length&&(best.length===1||best[0][1]>best[1][1])?best[0][0]:null);
  out.forEach(l=>{
   l.state=null;l.event=null;
   if(l.kind==='win'||l.kind==='spread'){
    let cands=events.filter(e=>e.comps.some(c=>teamMatches(l.team,c))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    /* a combo can mix sports (NBA props and an MLB team); only when the name fits more than one sport does the trade's sport decide */
    const sports=new Set(cands.map(e=>e.sport));
    if(sports.size>1){const pick=tradeSport&&sports.has(tradeSport)?tradeSport:Object.entries(winSports).sort((a,b)=>b[1]-a[1]).map(x=>x[0]).find(x=>sports.has(x));cands=pick?cands.filter(e=>e.sport===pick):[];}
    const ev=cands[0];if(ev){const mine=ev.comps.find(c=>teamMatches(l.team,c));l.event=ev;l.state=l.kind==='spread'?spreadState(ev,mine,l.spread):legState(ev,mine);}
   }else if(l.p){
    const cands=events.filter(e=>e.sport===l.p.sport&&e.comps.some(c=>abbrMatches(c.abbr,l.p.team))).sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
    const ev=cands[0];if(ev){l.event=ev;l.state=ev.state==='pre'?'scheduled':(ctx.gradeProp?ctx.gradeProp(l,ev,l.p):null)||(ev.state==='post'?'over':'live');}
   }
  });
  const known=out.filter(l=>l.event),unresolved=out.length-known.length+parsed.unparsed,age=now-cap;
  const base={legs:out,unparsed:parsed.unparsed,resolved:known.length,unresolved};
  if(out.some(l=>l.state==='miss'))return {...base,status:'dead',reason:'A leg missed'};
  if(out.some(l=>l.state==='live'))return {...base,status:'live',reason:'A game is in progress'};
  const allOver=known.length>0&&known.every(l=>l.event.state==='post');
  if(allOver&&unresolved===0){
   return out.every(l=>l.state==='hit')?{...base,status:'won',reason:'Every leg hit'}:{...base,status:'ended',reason:'Every game is final'};
  }
  if(allOver&&age>=1*DAY)return {...base,status:'ended',reason:'The games found are final and it was captured '+Math.floor(age/DAY)+' days ago; the rest could not be matched'};
  if(known.length&&known.some(l=>l.event.state==='pre'))return {...base,status:'upcoming',reason:'A game has not started'};
  if(!known.length&&age>=3*DAY)return {...base,status:'ended',reason:'Captured '+Math.floor(age/DAY)+' days ago and no upcoming game was found'};
  return {...base,status:'upcoming',reason:known.length?'Waiting on the remaining games':'No game found yet, so none has started'};
 }
 const api={parseLegs,resolve,teamMatches,STATS};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZTradeStatus=api;
})(typeof window!=='undefined'?window:globalThis);

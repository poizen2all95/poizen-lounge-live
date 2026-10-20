/* Receipt updates are local until the owner reviews and publishes them. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PZBoardUpdates=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),arr=x=>Array.isArray(x)?x:Object.values(x||{});
 function safe(x){if(!x||typeof x!=='object')return;for(const k of Object.keys(x)){if(['__proto__','prototype','constructor'].includes(k))throw Error('Unsafe import key');safe(x[k]);}}
 const amount=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const legId=l=>(l.player+'_'+l.market+'_'+String(Number(l.line)).replace('.','p')).replace(/[^a-zA-Z0-9_-]/g,'');
 function parse(text,options={}){
  text=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'');if(!text)throw Error('Paste a receipt or choose an export first.');
  if(text.startsWith('{')){const b=JSON.parse(text);safe(b);return b.slate?{...b.slate,history:b.history,verifiedAt:b.exported||b.slate.updated}:b;}
  const link=options.receiptUrl||text.match(/https:\/\/predictions\.draftkings\.com\/[^\s]+\/position\/\d+/)?.[0]||'';
  const m=link.match(/^https:\/\/predictions\.draftkings\.com\/(?:en\/)?my-trades\/(?:open|settled)\/details\/position\/(\d+)(?:[?#].*)?$/);if(!m)throw Error('Add the DraftKings receipt link so repeated imports update the same position.');
  if(/^\s*\d+ text /m.test(text))text=[...text.matchAll(/^\s*\d+ text (.+)$/gm)].map(m=>m[1]).join('\n');
  const start=text.lastIndexOf('My Position');if(start<0)throw Error('Copy the opened My Position receipt, including the amounts and transaction history.');
  const body=text.slice(start+11),cost=body.match(/BOUGHT FOR\s*\$([\d,.]+)/i),paid=body.match(/(PAYS OUT|PAID OUT|SOLD FOR)\s*\$([\d,.]+)/i),qtyMatch=body.match(/(?:Bought|Settled|Sold)\s+(\d+)\s+shares for/i);
  if(!cost||!paid||!qtyMatch)throw Error('Receipt is incomplete: include Bought for, Pays/Paid/Sold out and share count.');
  const num=s=>Number(s.replace(/,/g,'')),risk=num(cost[1]),returned=num(paid[2]),qty=Number(qtyMatch[1]);if(!amount(risk)||!amount(returned)||qty<=0||risk<=0||risk>=qty)throw Error('Receipt amounts or contract count need review.');
  const open=paid[1].toUpperCase()==='PAYS OUT',sold=paid[1].toUpperCase()==='SOLD FOR',at=options.at||new Date().toISOString(),id=m[1];
  const title=body.split(/BOUGHT FOR/i)[0].split('\n').map(s=>s.trim()).filter(s=>s&&!/^(Close|PREDICTIONS|YOU WON|\d+(?:\.\d+)?%)$/i.test(s)).join(' · ').slice(0,2000);
  if(!title)throw Error('Receipt title is missing.');
  const c={id:'dkp-'+id,positionId:id,title,venue:'DraftKings Predictions',kind:/Pick Combo/i.test(title)?'combo':'other',qty,avg:risk/qty*100,cost:risk,status:open?'open':sold?'sold':returned>0?'won':'lost',verifiedAt:at,source:'Copied DraftKings venue receipt',receiptUrl:link,note:'Web receipts omit profit boosts; separate fees and boosted payouts are unverified.',...(open?{potentialReturn:returned}:{payout:returned,exit:returned/qty*100})};
  const b={verifiedAt:at,contracts:[c]};
  if(!open){const d=body.match(/(?:Settled|Sold)\s+\d+\s+shares for\s+\$[\d,.]+\s+([A-Za-z]+)\s+(\d+),\s+(\d{4})/i);if(!d)throw Error('Include the settlement transaction date.');const month=new Date(d[1]+' 1, 2026').getMonth()+1;if(!month)throw Error('Settlement date needs review.');b.history={entries:[{id:c.id,positionId:id,date:d[3]+'-'+String(month).padStart(2,'0')+'-'+d[2].padStart(2,'0'),book:c.venue,type:'prediction',title,stake:risk,payout:returned,result:c.status,note:c.note}]};}
  return b;
 }
 function identity(x,type){return String(type==='contracts'?(x.positionId||x.id):type==='pick6'?(x.venueId||x.lineupId||x.id):(x.positionId?'position:'+x.positionId:x.venueId||x.lineupId?'lineup:'+(x.venueId||x.lineupId):x.id)||'');}
 function merge(slate,history,bundle){
  safe(bundle);if(!bundle||typeof bundle!=='object'||!['pick6','contracts'].some(k=>Array.isArray(bundle[k])&&bundle[k].length))throw Error('Export contains no tickets or positions.');
  const s=clone(slate),h=clone(history||{entries:[]});s.players={...(s.players||{}),...clone(bundle.players||{})};const summary={};
  for(const type of ['pick6','contracts']){const prior=arr(s[type]),incoming=arr(bundle[type]),ids=new Set(),stats={added:0,updated:0,unchanged:0};
   for(const raw of incoming){const item=clone(raw),key=identity(item,type);if(!key||ids.has(key))throw Error('Missing or duplicate receipt identity in '+type);ids.add(key);
    if(type==='contracts'){if(!(item.qty>0)||!Number.isFinite(item.avg)||item.avg<=0||item.avg>=100||!['open','won','lost','sold','review'].includes(item.status||'open'))throw Error('Invalid trade amounts/status: '+key);if(item.payout!==undefined&&!amount(item.payout))throw Error('Invalid actual payout: '+key);}
    else {if(!amount(item.entry)||!Array.isArray(item.legs)||item.legs.length<2)throw Error('Invalid ticket: '+key);for(const l of item.legs)if(!s.players[l.player]||!l.market||l.line===null||!Number.isFinite(Number(l.line)))throw Error('Incomplete leg: '+key);if(item.settlement&&(!amount(item.settlement.payout)||!Array.isArray(item.settlement.legResults)||item.settlement.legResults.length!==item.legs.length||item.settlement.legResults.some(r=>!['hit','miss','void'].includes(r))))throw Error('Incomplete settlement: '+key);}
    const index=prior.findIndex(x=>identity(x,type)===key);if(index<0){prior.unshift(item);stats.added++;}else{const next={...prior[index],...item,id:prior[index].id};if(type==='contracts'&&item.status==='open'){delete next.payout;delete next.exit;delete next.closedAt;}if(JSON.stringify(next)===JSON.stringify(prior[index]))stats.unchanged++;else stats.updated++;prior[index]=next;}
   }s[type]=prior;summary[type]=stats;
  }
  h.entries=arr(h.entries);let historyChanged=0;
  for(const raw of arr(bundle.history&&bundle.history.entries)){const e=clone(raw);if(!e.id||!/^\d{4}-\d{2}-\d{2}$/.test(e.date)||!(e.stake===null||amount(e.stake))||!amount(e.payout))throw Error('History needs a verified identity, date, stake (or explicit unknown) and payout.');const t=s.pick6.find(t=>t.venueId&&(t.venueId===e.venueId||t.venueId===e.lineupId));if(t)e.slipId=t.id;const key=identity(e,'history'),index=h.entries.findIndex(x=>identity(x,'history')===key);if(index<0){h.entries.push(e);historyChanged++;}else if(JSON.stringify(h.entries[index])!==JSON.stringify(e)){h.entries[index]=e;historyChanged++;}}
  summary.history=historyChanged;h.sources={...(h.sources||{}),...clone(bundle.history&&bundle.history.sources||{})};h.updated=bundle.verifiedAt||new Date().toISOString();s.updated=h.updated;
  return {slate:s,history:h,summary};
 }
 function lockUpdates(slate,eventFor,locks,now=Date.now()){
  const out={};for(const t of arr(slate.pick6)){if(t.status==='unconfirmed'||t.settlement)continue;for(const l of t.legs||[]){const id=legId(l),cur=locks[id];if(typeof cur==='number'&&cur<=now)continue;const e=eventFor(l.player),explicit=Date.parse(l.startsAt||t.startsAt||''),ko=Number.isFinite(explicit)?explicit:!l.venueOnly&&e&&e.state==='pre'?Date.parse(e.date):NaN;if(Number.isFinite(ko)&&ko>now&&cur!==ko)out[id]=ko;}}return out;
 }
 return {parse,merge,legId,lockUpdates};
});

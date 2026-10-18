/* Consistent trade receipts; unknown amounts never become zero profit/loss. */
(function(root){
 'use strict';
 const amount=x=>x===null||x===undefined||x===''?null:Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
 function slip(t,state){
  const settled=t.status==='settled',risk=t.units?null:amount(t.entry),potential=t.units?null:amount(t.toWin);
  const explicit=t.units?null:amount(t.payout);const returned=!settled||t.result==='review'?null:explicit!==null?explicit:t.result==='lost'?0:t.result==='won'?potential:null;
  return {stage:settled?{won:'Settled · won',lost:'Settled · lost',review:'Settled · needs review'}[t.result]||'Settled · result unknown':state==='live'?'Live · tracking':'Tracked · awaiting settlement',risk,potential:settled?null:potential,returned,net:settled&&risk!==null&&returned!==null?returned-risk:null,netLabel:'Graded P/L',basis:settled?'Graded result · confirm your venue statement':'Tracked slip · no wager is placed here'};
 }
 function publicSlip(t,r){
  const settled=['won','lost','partial','review'].includes(r.state);
  const x=slip({...t,status:settled?'settled':'open',result:r.state,payout:r.payout,entry:r.entry,toWin:r.potential},r.state);
  if(r.state==='partial')x.stage='Settled · partial payout';
  if(r.state==='dead')x.stage='Busted · awaiting settlement';
  if(t.status==='unconfirmed'){x.stage='Planned · not placed';x.basis='Published plan · no wager confirmed';}
  return x;
 }
 function contract(c){
  const qty=amount(c.qty),entry=amount(c.avg),risk=qty!==null&&entry!==null?qty*entry/100:null;
  const sold=amount(c.exit);const returned=c.status==='won'?qty:c.status==='lost'?0:c.status==='sold'&&qty!==null&&sold!==null?qty*sold/100:null;
  const fees=amount(c.actualFees);return {stage:({open:'Placed · reported',sold:'Closed · sold',won:'Settled · won',lost:'Settled · lost',review:'Needs review'})[c.status||'open']||'Status unknown',risk,returned,potential:!c.status||c.status==='open'?qty:null,fees,net:risk!==null&&returned!==null?returned-risk-(fees??0):null,netLabel:fees===null?'Gross P/L · fees unknown':'Net P/L · recorded fees',basis:'Reported trade · confirm your venue statement'};
 }
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function html(x){const money=n=>n===null||n===undefined?'Not available':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(n);const cell=(label,value)=>`<div><span>${esc(label)}</span><b>${esc(money(value))}</b></div>`;return `<div class="trade-receipt"><p><b>${esc(x.stage)}</b></p><div class="trade-receipt-grid">${cell('Entry cost',x.risk)}${cell(x.returned===null?'Potential return':'Return',x.returned===null?x.potential:x.returned)}${cell(x.netLabel,x.net)}${x.fees!==undefined?cell('Total recorded fees',x.fees):''}</div><small>${esc(x.basis)}</small></div>`;}
 const api={slip,publicSlip,contract,html};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZTradeCards=api;
})(typeof window!=='undefined'?window:globalThis);

/* Auditable member-workspace calculations. Prices are dollars per contract. */
(function(root){
  'use strict';
  const paid=t=>t==='pro'||t==='elite';
  const canAddSlip=(tier,open)=>paid(tier)||open<1;
  const optional=x=>x===null||x===undefined||x==='';
  function number(x,label,min=0,max=Number.MAX_SAFE_INTEGER){const v=Number(x);if(optional(x)||!Number.isFinite(v)||v<min||v>max)throw Error(`Enter a valid ${label} (${min}–${max}).`);return v;}
  function price(x,required=true){return !required&&optional(x)?null:number(x,'price',0,1);}
  function qty(x,allowZero=false){const n=number(x,'quantity',allowZero?0:1,10000000);if(!Number.isInteger(n))throw Error('Quantity must be a whole number.');return n;}
  const text=(x,n=80)=>String(x??'').trim().slice(0,n);
  function effective(p){const x={...p};for(const c of p.corrections||[])x[c.field]=c.to;return x;}
  function makePosition(x,now=Date.now()){
    const market=text(x.market);if(!market)throw Error('Name the market or contract.');
    const entry=price(x.entry),size=qty(x.qty),target=price(x.target,false),stop=price(x.stop,false);
    if(target!==null&&stop!==null&&target<=stop)throw Error('Target must be above stop.');
    const expiresAt=optional(x.expiresAt)?null:number(x.expiresAt,'expiry',1);
    if(x.side!=='yes'&&x.side!=='no')throw Error('Choose Yes or No.');
    const ticker=text(x.ticker).toUpperCase();if(ticker&&!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(ticker))throw Error('Enter the exact Kalshi ticker.');
    return {market,ticker,venue:text(x.venue)||'Manual',side:x.side,qty:x.planned?0:size,entry,fee:x.planned?0:number(x.fee??0,'fee'),mark:price(x.mark,false),player:text(x.player,60),team:text(x.team,60),game:text(x.game,80),plan:{size,entry,target,stop,expiresAt,why:text(x.why,200)},at:now,exits:[],corrections:[]};
  }
  function positionState(p){
    const x=effective(p),q=Number(x.qty)||0,e=Number(x.entry)||0,exits=x.exits||[];
    const sold=exits.reduce((a,v)=>a+v.qty,0),remaining=Math.max(0,q-sold);
    const fees=(Number(x.fee)||0)+exits.reduce((a,v)=>a+(Number(v.fee)||0),0);
    const proceeds=exits.reduce((a,v)=>a+v.qty*v.price,0);
    const settled=x.settled&&(x.settled.result==='yes'||x.settled.result==='no');
    const settlement=settled?(x.settled.result===x.side?1:0):null;
    const mark=optional(x.mark)?null:price(x.mark);
    const realized=proceeds+(settled?remaining*settlement:0)-(settled?q:sold)*e-fees;
    const unrealized=q&&!settled&&remaining&&mark!==null?remaining*(mark-e):null;
    return {stage:!q?'planned':settled?'settled':!remaining?'closed':sold?'partial':'live',qty:q,sold,open:settled?0:remaining,entry:e,cost:q*e,fees,proceeds,realized,unrealized,net:realized+(unrealized??0),mark,settlement};
  }
  function recordFill(p,x,now=Date.now()){
    if(positionState(p).stage!=='planned')throw Error('This position is already filled.');
    return {...p,qty:qty(x.qty),entry:price(x.entry),fee:number(x.fee??0,'fee'),filledAt:now};
  }
  function recordExit(p,x,now=Date.now()){
    const s=positionState(p);if(['closed','settled','planned'].includes(s.stage))throw Error('Only an open position can record an exit; closed and settled entries stay read-only.');
    const q=qty(x.qty);if(q>s.open)throw Error(`Only ${s.open} contracts are open.`);
    return {...p,exits:[...(p.exits||[]),{qty:q,price:price(x.price),fee:number(x.fee??0,'fee'),source:'reported',at:now}]};
  }
  function recordSettlement(p,result,now=Date.now()){
    const s=positionState(p);if(['closed','settled','planned'].includes(s.stage))throw Error('Only an open position can settle.');
    if(result!=='yes'&&result!=='no')throw Error('Choose the market result: Yes or No.');
    return {...p,settled:{result,source:'reported',at:now}};
  }
  function correctPosition(p,x,now=Date.now()){
    if(!['entry','qty','fee'].includes(x.field))throw Error('Choose entry price, quantity or entry fee.');
    if(!text(x.note))throw Error('Explain the correction so the original remains auditable.');
    const from=effective(p)[x.field],to=x.field==='entry'?price(x.value):x.field==='qty'?qty(x.value,true):number(x.value,'fee');
    if(x.field==='qty'&&to<(p.exits||[]).reduce((a,v)=>a+v.qty,0))throw Error('Quantity cannot be below contracts already sold.');
    if(x.field==='qty'&&to===0&&positionState(p).stage!=='planned')throw Error('A filled position cannot be changed back to a plan.');
    return {...p,corrections:[...(p.corrections||[]),{field:x.field,from,to,note:text(x.note,200),at:now}]};
  }
  function updatePlan(p,x,now=Date.now()){
    if(!['live','partial','planned'].includes(positionState(p).stage))throw Error('Closed and settled plans stay in history.');
    if(!text(x.note))throw Error('Explain the plan change.');
    const target=price(x.target,false),stop=price(x.stop,false);
    if(target!==null&&stop!==null&&target<=stop)throw Error('Target must be above stop.');
    const ticker=text(x.ticker).toUpperCase();if(ticker&&!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(ticker))throw Error('Enter the exact Kalshi ticker.');
    const plan={...p.plan,target,stop,expiresAt:optional(x.expiresAt)?null:number(x.expiresAt,'expiry',1),why:text(x.why,200)};
    const after={plan,ticker,player:text(x.player??p.player,60),team:text(x.team??p.team,60),game:text(x.game??p.game,80)};
    const before={plan:p.plan,ticker:p.ticker||'',player:p.player,team:p.team,game:p.game};
    return {...p,...after,...(ticker!==(p.ticker||'')?{mark:null}:{}),planChanges:[...(p.planChanges||[]),{before,after,note:text(x.note,200),at:now}]};
  }
  function alerts(p,now=Date.now()){
    const s=positionState(p);if(!['live','partial'].includes(s.stage))return [];
    const out=[],plan=p.plan||{};
    if(s.mark!==null&&plan.target!==null&&plan.target!==undefined&&s.mark>=plan.target)out.push('Target reached');
    if(s.mark!==null&&plan.stop!==null&&plan.stop!==undefined&&s.mark<=plan.stop)out.push('Stop reached');
    if(plan.expiresAt&&now>=plan.expiresAt)out.push('Expiry reached');
    return out;
  }
  function exposure(positions,slips){
    const maps={players:new Map(),teams:new Map(),games:new Map()};let total=0,unknownSlips=0;
    function add(item,amount){for(const kind of Object.keys(maps))for(const name of new Set((item[kind]||[]).map(x=>text(x)).filter(Boolean))){const row=maps[kind].get(name)||{name,amount:0,count:0};row.amount+=amount;row.count++;maps[kind].set(name,row);}}
    for(const p of positions){const s=positionState(p);if(!['live','partial'].includes(s.stage))continue;const amount=s.open*s.entry;total+=amount;add({players:[p.player],teams:[p.team],games:[p.game]},amount);}
    for(const slip of slips){if(optional(slip.stake)){unknownSlips++;continue;}const amount=number(slip.stake,'stake');total+=amount;add(slip,amount);}
    const out={total,unknownSlips};for(const [kind,map]of Object.entries(maps))out[kind]=[...map.values()].sort((a,b)=>b.amount-a.amount).map(x=>({...x,share:total?x.amount/total:0}));return out;
  }
  function makeStrategy(x){
    const name=text(x.name,48);if(!name)throw Error('Name this strategy.');const factors={};
    for(const k of ['pass','rec','rush','td'])factors[k]=number(x[k]??1,`${k} factor`,.5,1.5);
    const maxLegs=number(x.maxLegs??4,'maximum legs',1,12);if(!Number.isInteger(maxLegs))throw Error('Maximum legs must be a whole number.');
    return {name,factors,maxLegs,minChance:number(x.minChance??.4,'minimum hit chance',0,1)};
  }
  const PRESETS=[
    makeStrategy({name:'Normal',maxLegs:4,minChance:.4}),
    makeStrategy({name:'Low scoring / bad weather',pass:.9,rec:.92,rush:1.03,td:.85}),
    makeStrategy({name:'Big lead / fewer throws',pass:.92,rec:.92,rush:1.08,td:1}),
    makeStrategy({name:'Limited snaps',pass:.85,rec:.85,rush:.85,td:.85}),
  ];
  const api={canAddSlip,makePosition,positionState,recordFill,recordExit,recordSettlement,correctPosition,updatePlan,alerts,exposure,makeStrategy,PRESETS};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZT=api;
})(typeof window!=='undefined'?window:globalThis);

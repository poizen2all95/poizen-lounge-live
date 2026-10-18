/* Private workspace serialization and conflict-safe Firebase transactions. */
(function(root){
 'use strict';
 const T=typeof module!=='undefined'&&module.exports?require('./tiers.js'):root.PZT;
 const empty=()=>({v:1,positions:[],strategies:[]});
 const fail=()=>{throw Error('Workspace format could not be read. Export the original before repairing it.');};
 const finite=(n,min=0,max=Number.MAX_SAFE_INTEGER)=>typeof n==='number'&&Number.isFinite(n)&&n>=min&&n<=max;
 const optionalPrice=n=>n===null||n===undefined||finite(n,0,1);
 const isId=x=>typeof x==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(x);
 function validate(doc){
  if(!doc||doc.v!==1||!Array.isArray(doc.positions)||!Array.isArray(doc.strategies)||doc.positions.length>1000||doc.strategies.length>100)fail();
  for(const records of [doc.positions,doc.strategies]){const ids=new Set();for(const record of records){if(!isId(record?.id))fail();if(ids.has(record.id))throw Error('Duplicate workspace record id.');ids.add(record.id);}}
  for(const p of doc.positions){
   if(typeof p.market!=='string'||!p.market.trim()||p.market.length>80||!['yes','no'].includes(p.side)||!finite(p.qty,0,1e7)||!Number.isInteger(p.qty)||!finite(p.entry,0,1)||!finite(p.fee)||!optionalPrice(p.mark)||!finite(p.at))fail();
   for(const [k,max]of [['venue',80],['player',60],['team',60],['game',80],['ticker',80]])if(p[k]!==undefined&&(typeof p[k]!=='string'||p[k].length>max))fail();
   if(p.ticker&&!/^[A-Z0-9][A-Z0-9._-]{2,79}$/.test(p.ticker))fail();
   if(!p.plan||!optionalPrice(p.plan.entry)||!optionalPrice(p.plan.target)||!optionalPrice(p.plan.stop)||!finite(p.plan.size,1,1e7)||!Number.isInteger(p.plan.size)||p.plan.expiresAt!==null&&p.plan.expiresAt!==undefined&&!finite(p.plan.expiresAt)||typeof p.plan.why!=='string'||p.plan.why.length>200)fail();
   if(p.plan.target!=null&&p.plan.stop!=null&&p.plan.target<=p.plan.stop)fail();
   if(!Array.isArray(p.exits)||!Array.isArray(p.corrections)||p.exits.length>2000||p.corrections.length>2000)fail();
   for(const e of p.exits)if(!finite(e.qty,1,1e7)||!Number.isInteger(e.qty)||!finite(e.price,0,1)||!finite(e.fee)||!finite(e.at)||!['reported','venue'].includes(e.source))fail();
   let quantity=p.qty;for(const c of p.corrections){if(!['qty','entry','fee'].includes(c.field)||!finite(c.to,0,c.field==='entry'?1:c.field==='qty'?1e7:Number.MAX_SAFE_INTEGER)||!finite(c.from)||typeof c.note!=='string'||!c.note.trim()||c.note.length>200||!finite(c.at))fail();if(c.field==='qty'){if(!Number.isInteger(c.to))fail();quantity=c.to;}}
   if(p.exits.reduce((a,x)=>a+x.qty,0)>quantity)fail();
   if(p.settled&&(!['yes','no'].includes(p.settled.result)||!finite(p.settled.at)||!['reported','venue'].includes(p.settled.source)||!quantity))fail();
   if(p.planChanges!==undefined&&(!Array.isArray(p.planChanges)||p.planChanges.length>2000||p.planChanges.some(c=>!c||typeof c.note!=='string'||c.note.length>200||!finite(c.at)||!c.before||!c.after)))fail();
   T.positionState(p);
  }
  for(const s of doc.strategies){const checked=T.makeStrategy({...s,...s.factors});if(!s.factors||JSON.stringify(checked.factors)!==JSON.stringify(s.factors))fail();}
  // Reject non-finite numbers and excessive backup size before JSON can coerce them.
  const json=JSON.stringify(doc,(_,v)=>{if(typeof v==='number'&&!Number.isFinite(v))fail();return v;});
  if(json.length>900000)throw Error('Workspace exceeds the storage limit. Export your records before archiving older entries.');
  return JSON.parse(json);
 }
 function decode(envelope){if(!envelope)return empty();if(!Number.isSafeInteger(envelope.revision)||envelope.revision<1||typeof envelope.payload!=='string')fail();let doc;try{doc=JSON.parse(envelope.payload);}catch{fail();}return validate(doc);}
 function encode(doc,revision,now=Date.now()){if(!Number.isSafeInteger(revision)||revision<1||!finite(now))fail();return {revision,payload:JSON.stringify(validate(doc)),updatedAt:now};}
 async function transact(ref,change,now=Date.now()){
  let lastError;
  const result=await ref.transaction(current=>{try{return encode(change(decode(current)),(current?.revision||0)+1,now);}catch(e){lastError=e;return;}},undefined,false);
  if(lastError)throw lastError;
  if(!result.committed)throw Error('Workspace was not saved. Reload and try again.');
  const value=result.snapshot.val();return {revision:value.revision,data:decode(value)};
 }
 function merge(current,incoming){const next=validate(incoming),base=validate(current);return validate({...base,positions:[...base.positions,...next.positions.filter(p=>!base.positions.some(x=>x.id===p.id))],strategies:[...base.strategies,...next.strategies.filter(p=>!base.strategies.some(x=>x.id===p.id))]});}
 const api={empty,validate,decode,encode,transact,merge};
 if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZWorkspace=api;
})(typeof window!=='undefined'?window:globalThis);

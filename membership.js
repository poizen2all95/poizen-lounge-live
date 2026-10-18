/* Manual membership operations. No payment processor is involved. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PZMembership=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function addMonth(time){const d=new Date(time);if(!Number.isFinite(d.getTime()))throw Error('Invalid expiry');const day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);const end=new Date(d.getTime());end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);d.setUTCDate(Math.min(day,end.getUTCDate()));return d.getTime();}
  function reduce(tiers,op,cap){
    tiers=tiers||{};const cur=tiers[op.uid]||{};
    if(!op.uid||!op.id||/[.#$\[\]/]/.test(op.id)||!Number.isFinite(op.now))throw Error('Invalid membership operation');
    if(cur.actions&&cur.actions[op.id])return tiers;
    if(op.kind==='approve'&&op.requestStatus==='approved')throw Error('This request was already approved. Use Renew for another paid month.');
    if(!['approve','grant','renew','remove'].includes(op.kind))throw Error('Invalid action');
    let grant;
    if(op.kind==='remove')grant={...cur,tier:null,active:false,source:'manual',since:cur.since||op.now,until:op.now};
    else {
      const tier=op.kind==='renew'?cur.tier:op.tier;
      const email=String(op.kind==='renew'?cur.email:op.email||cur.email||'').trim().toLowerCase();
      if(!['pro','elite'].includes(tier))throw Error('Choose a valid paid plan');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw Error('Member needs a valid Google email before access can be granted');
      if(cur.email&&String(cur.email).trim().toLowerCase()!==email)throw Error('Member email differs from existing grant; review the account before granting');
      const rate=cur.rate==='founding'&&cur.tier? 'founding':op.kind==='renew'?cur.rate:op.rate||'standard';
      if(!['founding','standard'].includes(rate))throw Error('Invalid rate');
      if(rate==='founding'&&!(cur.rate==='founding'&&cur.tier)){
        const taken=Object.values(tiers).filter(g=>g&&['pro','elite'].includes(g.tier)&&g.rate==='founding'&&Number(g.until)>op.now).length;
        if(taken>=cap)throw Error('Founding spots are full. Request still pending: agree the regular price explicitly with the member before changing their request.');
      }
      grant={...cur,tier,email,active:true,source:'manual',rate,price:rate===cur.rate&&cur.price?cur.price:op.price||'',since:cur.since||op.now,until:addMonth(Math.max(Number(cur.until)||0,op.now))};
    }
    grant.actions={...(cur.actions||{}),[op.id]:{kind:op.kind,at:op.now,actor:op.actor||'',previousTier:cur.tier||null,previousUntil:cur.until||0,tier:grant.tier,until:grant.until,email:grant.email||'',rate:grant.rate||'',price:grant.price||'',...(op.requestAt?{requestAt:op.requestAt}:{})}};
    return {...tiers,[op.uid]:grant};
  }
  async function execute(db,op,cap){
    // The common tiers ancestor makes founding capacity and each grant one atomic decision.
    const result=await db.ref('tiers').transaction(current=>reduce(current,op,cap),undefined,false);
    if(!result.committed)throw Error('Plan transaction was not committed');
    const tiers=result.snapshot.val()||{},grant=tiers[op.uid];let warning='';
    if(op.kind==='approve')try{
      const decision=await db.ref('requests/'+op.uid).transaction(r=>{
        if(!r||Number(r.at)!==Number(op.requestAt))return;
        return {...r,status:'approved',decidedAt:op.now,operationId:op.id};
      },undefined,false);
      if(!decision.committed)warning='Access saved, but request changed. Reload members and review the pending request.';
    }catch(e){warning='Access saved; request status is still pending. Retry approval safely to finish: '+e.message;}
    return {tiers,grant,warning};
  }
  return {addMonth,reduce,execute};
});

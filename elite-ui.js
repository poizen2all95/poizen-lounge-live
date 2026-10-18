/* Private synced Elite journal and scenarios; manual entry never sends broker orders. */
(function(){
  'use strict';
  const T=window.PZT,W=window.PZWorkspace;
  const sessions=new Map();
  const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=x=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(x);
  const pct=x=>Math.round(x*100)+'%';
  const cents=x=>x===null||x===undefined?'Not entered':Math.round(x*100)+'¢';
  const key=uid=>'pz_elite_'+uid;
  const drafts=new Map(),opened=new Map(),editing=new Map(),pending=new Set();
  function read(uid){
    const raw=localStorage.getItem(key(uid));if(!raw)return {v:1,positions:[],strategies:[]};
    const x=JSON.parse(raw);
    if(x.v!==1||!Array.isArray(x.positions)||!Array.isArray(x.strategies))throw Error('Workspace backup format could not be read. Existing data has not been overwritten.');
    return W.validate(x);
  }
  function write(uid,x){localStorage.setItem(key(uid),JSON.stringify(W.validate(x)));}
  function session(ctx){
    let current=sessions.get(ctx.uid);if(current){current.ctx=ctx;return current;}
    current={ctx,ready:false,data:W.empty(),settings:{},error:'',connected:false,refs:[]};sessions.set(ctx.uid,current);
    if(!ctx.db){current.error='Cloud connection is unavailable.';current.ready=true;return current;}
    const watch=(path,fn)=>{const ref=ctx.db.ref(path);const cb=snap=>{if(!sessions.has(ctx.uid))return;fn(snap.val());current.ctx.refresh?.();};ref.on('value',cb,e=>{current.error=e.message;current.ready=true;current.ctx.refresh?.();});current.refs.push([ref,cb]);};
    watch('workspaces/'+ctx.uid,value=>{try{current.data=W.decode(value);current.revision=value?.revision||0;current.ready=true;current.error='';}catch(e){current.error=e.message;current.ready=true;}});
    watch('workspaceNotifications/'+ctx.uid,value=>{current.notifications=value||{};});
    watch('workspaceSettings/'+ctx.uid,value=>{current.settings=value||{};});
    watch('.info/connected',value=>{current.connected=value===true;});
    return current;
  }
  function dispose(){window.PZAlerts?.dispose();for(const current of sessions.values())for(const [ref,cb]of current.refs)ref.off('value',cb);sessions.clear();}
  async function save(ctx,change){
    if(ctx.currentTier()!=='elite')throw Error('Elite access has expired. Your saved data is retained.');
    const current=session(ctx);
    if(!current.connected)throw Error('You are offline. Your form stays here; reconnect before saving.');
    if(current.settings.sync!==true)throw Error('Enable your private cloud workspace before saving.');
    const result=await W.transact(ctx.db.ref('workspaces/'+ctx.uid),change);
    current.data=result.data;current.revision=result.revision;return result.data;
  }
  const id=()=>window.crypto.randomUUID();
  const f=(n,l,type='number',attrs='')=>`<label class="ew-field"><span>${l}</span><input name="${n}" type="${type}" ${attrs}></label>`;
  const submit=label=>`<button class="mebtn" type="submit">${label}</button>`;
  const form=(action,pid,body)=>`<form data-elite-form="${action}" data-position="${esc(pid||'')}">${body}</form>`;
  const note='<p class="mefine">Manual journal only. Recording a fill, exit or settlement here never sends an order to a broker. Quotes and results are entered by you.</p>';
  function positionHTML(p,ctx){
    const s=T.positionState(p),open=['live','partial'].includes(s.stage),alerts=T.alerts(p);
    const audit=(p.exits||[]).map(x=>`<li>Reported exit · ${x.qty} at ${cents(x.price)} · ${money(x.fee)} fee</li>`).concat((p.corrections||[]).map(x=>`<li>Correction · ${esc(x.field)}: ${esc(x.from)} → ${esc(x.to)} · ${esc(x.note)}</li>`));
    for(const change of p.planChanges||[])audit.push(`<li>Plan change · ${esc(change.note)} · ${esc(new Date(change.at).toLocaleString())}</li>`);
    if(p.settled)audit.push(`<li>Reported settlement · market result ${esc(p.settled.result.toUpperCase())}</li>`);
    return `<details class="ew-position" data-elite-open="position-${esc(p.id)}"><summary><div><b>${esc(p.market)}</b><span>${esc(p.venue)} · ${esc(p.side.toUpperCase())} · ${({planned:'Planned',live:'Placed · reported',partial:'Partially exited',closed:'Closed · exited',settled:'Settled · reported'})[s.stage]} · ${s.open} open</span></div><strong class="${s.net<0?'loss':'win'}">${s.stage==='planned'?'Plan':money(s.net)}${s.unrealized===null&&open?'<small>realized only · no mark</small>':'<small>after recorded fees</small>'}</strong></summary><div class="ew-content">
      <div class="ew-metrics"><div><span>Original entry cost</span><b>${money(s.cost)}</b></div><div><span>Realized P/L</span><b>${money(s.realized)}</b></div><div><span>Unrealized P/L · entered quote</span><b>${s.unrealized===null?'Not available':money(s.unrealized)}</b></div><div><span>Total recorded fees</span><b>${money(s.fees)}</b></div></div>
      <p class="mefine">Recorded ${esc(new Date(p.at).toLocaleString())}${p.filledAt?' · filled '+esc(new Date(p.filledAt).toLocaleString()):''}${p.settled?' · settled '+esc(new Date(p.settled.at).toLocaleString()):''}<br>${esc(p.player||'No player tag')} · ${esc(p.team||'No team tag')} · ${esc(p.game||'No game tag')}<br>Target ${cents(p.plan.target)} · stop ${cents(p.plan.stop)}${p.plan.expiresAt?' · expires '+esc(new Date(p.plan.expiresAt).toLocaleString()):''}</p>
      ${alerts.length?`<p class="ew-alert" role="status">${alerts.map(esc).join(' · ')} — review at your venue. No automatic exit.</p>`:''}
      ${s.stage==='planned'?form('fill',p.id,`<b>Record a fill</b><div class="ew-fields">${f('qty','Filled contracts','number',`min="1" step="1" value="${p.plan.size}" required`)}${f('entry','Entry price (¢)','number',`min="0" max="100" step=".01" value="${p.plan.entry*100}" required`)}${f('fee','Entry fee ($)','number','min="0" step=".01" value="0" required')}</div>${submit('Record fill')}`):''}
      ${open?form('mark',p.id,`<b>Update your quote</b><div class="ew-fields">${f('mark','Latest price of your side (¢)','number',`min="0" max="100" step=".01" value="${s.mark===null?'':s.mark*100}" required`)}</div>${submit('Update quote')}`)+form('exit',p.id,`<b>Record a partial or full exit</b><div class="ew-fields">${f('qty','Contracts sold','number',`min="1" max="${s.open}" step="1" required`)}${f('price','Sale price (¢)','number','min="0" max="100" step=".01" required')}${f('fee','Exit fee ($)','number','min="0" step=".01" value="0" required')}</div>${submit('Record exit')}`)+form('settle',p.id,`<label class="ew-field"><span>Final underlying market result</span><select name="result"><option value="yes">Yes occurred</option><option value="no">No occurred</option></select></label>${submit('Record settlement')}`):''}
      ${open||s.stage==='planned'?form('plan',p.id,`<details data-elite-open="plan-${esc(p.id)}"><summary>Edit plan, tags and market mapping</summary><p class="mefine">Updates your plan and reference data, preserving fills and the prior plan in history.</p><div class="ew-fields">${f('target','Target price (¢)','number',`min="0" max="100" step=".01" value="${p.plan.target==null?'':p.plan.target*100}"`)}${f('stop','Stop price (¢)','number',`min="0" max="100" step=".01" value="${p.plan.stop==null?'':p.plan.stop*100}"`)}${f('expires','Expiry','datetime-local',p.plan.expiresAt?`value="${esc(new Date(p.plan.expiresAt-new Date(p.plan.expiresAt).getTimezoneOffset()*60000).toISOString().slice(0,16))}"`:'')}${f('ticker','Exact Kalshi ticker','text',`maxlength="80" value="${esc(p.ticker||'')}"`)}${f('player','Player tag','text',`maxlength="60" value="${esc(p.player)}"`)}${f('team','Team tag','text',`maxlength="60" value="${esc(p.team)}"`)}${f('game','Game tag','text',`maxlength="80" value="${esc(p.game)}"`)}${f('why','Plan reasoning','text',`maxlength="200" value="${esc(p.plan.why)}"`)}${f('note','Reason for this change','text','maxlength="200" required')}</div>${submit('Update plan')}</details>`):''}
      ${form('correct',p.id,`<details data-elite-open="correct-${esc(p.id)}"><summary>Correct an entry · keep the original</summary><div class="ew-fields"><label class="ew-field"><span>Field</span><select name="field"><option value="entry">Entry price (¢)</option><option value="qty">Filled quantity</option><option value="fee">Entry fee ($)</option></select></label>${f('value','Correct value','number','min="0" step=".01" required')}${f('note','Reason','text','maxlength="200" required')}</div>${submit('Keep correction')}</details>`)}
      ${ctx.bookHTML?ctx.bookHTML(p):''}
      ${audit.length?`<details data-elite-open="audit-${esc(p.id)}"><summary>Activity and corrections · ${audit.length}</summary><ul class="ew-audit">${audit.join('')}</ul></details>`:''}
    </div></details>`;
  }
  function newPosition(){return `<details class="ew-add" data-elite-open="new"><summary>＋ Add a position or plan</summary>${form('new','',`<div class="ew-fields">${f('market','Market / contract','text','maxlength="80" required')}${f('venue','Venue','text','maxlength="80" placeholder="Kalshi, Robinhood, DraftKings…"')}${f('ticker','Exact Kalshi ticker (optional)','text','maxlength="80" placeholder="KXNFLGAME-…"')}<label class="ew-field"><span>Your side</span><select name="side"><option value="yes">Yes</option><option value="no">No</option></select></label><label class="ew-field"><span>Status</span><select name="status"><option value="live">Already filled</option><option value="planned">Planning only</option></select></label>${f('qty','Contracts (or planned size)','number','min="1" max="10000000" step="1" required')}${f('entry','Entry price (¢)','number','min="0" max="100" step=".01" required')}${f('fee','Entry fee ($)','number','min="0" step=".01" value="0" required')}${f('mark','Current price of your side (¢)','number','min="0" max="100" step=".01"')}${f('target','Target price (¢)','number','min="0" max="100" step=".01"')}${f('stop','Stop price (¢)','number','min="0" max="100" step=".01"')}${f('expires','Plan expiry','datetime-local')}${f('player','Player tag','text','maxlength="60"')}${f('team','Team tag','text','maxlength="60"')}${f('game','Game tag','text','maxlength="80"')}${f('why','Why this position?','text','maxlength="200"')}</div>${submit('Save position')}`)}</details>`;}
  function exposureHTML(data){
    const rows=kind=>data[kind].length?data[kind].slice(0,10).map(x=>`<div class="ew-exposure"><span>${esc(x.name)}</span><b>${money(x.amount)} · ${pct(x.share)}</b><meter value="${x.share}" min="0" max="1" aria-label="${esc(x.name)} exposure">${pct(x.share)}</meter></div>`).join(''):'<p class="muted">No tagged exposure yet.</p>';
    return `<section class="card mecard ew-exposure-card"><h3>Exposure across your slate</h3><p class="muted">${money(data.total)} in open entry cost${data.unknownSlips?` · ${data.unknownSlips} slips without available amounts are excluded`:''}.</p><p class="mefine">A shared player counts once per slip. Player, team and game totals overlap; do not add the groups together. These are amounts committed, not probabilities of loss. Position fees and planned entries are excluded.</p><div class="ew-columns">${[['players','Players'],['teams','Teams'],['games','Games']].map(([k,l])=>`<div><h4>${l}</h4>${rows(k)}</div>`).join('')}</div></section>`;
  }
  function studioHTML(x,ctx){
    const all=[...T.PRESETS,...x.strategies];
    const comparisons=(ctx.scenarios||[]).map(slip=>`<details class="ew-scenario" data-elite-open="scenario-${esc(slip.id)}"><summary>${esc(slip.title)} · ${slip.legs.length} legs${slip.unit?' · payout units':' · '+money(slip.entry)}</summary><div class="tablewrap"><table class="ltable"><thead><tr><th>Scenario</th><th>All hit</th><th>Expected ${slip.unit?'units':'net'}</th><th>Your rules</th></tr></thead><tbody>${all.map(strategy=>{const r=ctx.compare(slip,strategy);return `<tr><td>${esc(strategy.name)}</td><td>${pct(r.pAll)}</td><td>${slip.unit?r.net.toFixed(2)+'u':money(r.net)}</td><td>${r.passes?'Within rules':'Outside rules'}</td></tr>`;}).join('')}</tbody></table></div></details>`).join('');
    return `<section class="card mecard ew-studio"><h3>Strategy Studio <span class="chip gold">Elite</span></h3><p class="muted">Stress-test your own open slips against different assumptions. Save rules and see which scenarios your slate depends on.</p><p class="mefine">Pregame model estimates, not live cash-out prices or guarantees. Factors scale projected stat averages; 0.85 means 15% lower. Rules flag scenarios for review; they do not place, block or exit trades.</p>${comparisons||'<div class="empty">Save a personal slip to compare scenarios here. Existing positions and strategy presets can be recorded below.</div>'}
      <details class="ew-add" data-elite-open="strategy"><summary>＋ Save your own scenario and rules</summary>${form('strategy','',`<div class="ew-fields">${f('name','Scenario name','text','maxlength="48" required')}${['pass','rec','rush','td'].map(k=>f(k,{pass:'Passing factor',rec:'Receiving factor',rush:'Rushing factor',td:'Touchdown factor'}[k],'number','min=".5" max="1.5" step=".01" value="1" required')).join('')}${f('maxLegs','Maximum legs','number','min="1" max="12" step="1" value="4" required')}${f('minChance','Minimum per-leg chance (%)','number','min="0" max="100" step="1" value="40" required')}</div>${submit('Save scenario')}`)}</details>${x.strategies.length?`<div class="facts">${x.strategies.map(s=>`<span class="chip">${esc(s.name)} · ≤${s.maxLegs} legs · ≥${pct(s.minChance)} each <button type="button" class="linkbtn" data-elite-edit-strategy="${esc(s.id)}">Edit</button> <button type="button" class="linkbtn" data-elite-remove-strategy="${esc(s.id)}">Delete scenario</button></span>`).join('')}</div>`:''}</section>`;
  }
  function mount(el,ctx){
    if(!ctx.uid)return;const active=document.activeElement;const focus=el.contains(active)&&active.id?{id:active.id,start:active.selectionStart,end:active.selectionEnd}:null;const current=session(ctx);const data=current.data;
    if(!current.ready){el.innerHTML='<div class="card mecard" role="status">Loading your private workspace…</div>';return;}
    if(ctx.tier!=='elite'){el.innerHTML=`<div class="card mecard melock"><h3>Elite workspace</h3><p>Position journal, combined exposure and Strategy Studio are part of Elite.</p>${data.positions.length||data.strategies.length?'<p>Your existing workspace is retained in your account. Export my data still includes it.</p>':''}<button class="linkbtn" type="button" data-me="plans">Compare plans</button></div>`;return;}
    const counts=data.positions.map(T.positionState);const open=counts.filter(s=>['live','partial'].includes(s.stage)).length;
    const real=counts.reduce((a,s)=>a+s.realized,0);const exposure=T.exposure(data.positions,ctx.slips||[]);
    const backup=(()=>{try{return read(ctx.uid);}catch{return null;}})();
    el.innerHTML=`<section class="card mecard ew-intro"><div class="ew-title"><h3>Your Elite workspace</h3><span class="chip gold">Private · ${current.connected?'connected':'offline'}</span></div><p class="muted">${open} open positions · ${money(real)} realized after recorded fees.</p>
      <p class="mefine">Cloud records are private to your Google account and available across your devices. Your position details and amounts are stored in Firebase when you enable this workspace. PoiZen's member viewer does not display this journal. Manual entries stay labelled as reported.</p>
      ${current.error?`<p class="meerr" role="alert">Cloud workspace unavailable: ${esc(current.error)}. Your existing data is retained; a failed save is never marked complete.</p>`:''}
      ${current.settings.sync!==true?'<button class="mebtn" type="button" data-elite-enable>Enable my private cloud workspace</button>':'<p class="mefine">Cloud sync enabled · revision '+(current.revision||0)+'.</p>'}
      <div class="row"><button class="fbtn" type="button" data-elite-export>Export workspace backup</button><label class="fbtn">Import backup<input type="file" data-elite-import accept="application/json,.json" hidden></label>${backup&&(backup.positions.length||backup.strategies.length)?'<button class="fbtn" type="button" data-elite-migrate>Import my earlier device journal</button>':''}</div>
      <div class="ew-message" role="status" aria-live="polite"></div></section>`+(window.PZAlerts?window.PZAlerts.html(current):'')+studioHTML(data,ctx)+exposureHTML(exposure)+`<section class="card mecard ew-journal"><h3>Position desk</h3>${note}${newPosition()}${data.positions.length?data.positions.slice().reverse().map(p=>positionHTML(p,ctx)).join(''):'<div class="empty">Add a planned or filled position. Tag its player, team and game to include it in exposure.</div>'}</section>`;
    ctx.loadBooks?.(data.positions);
    const editId=editing.get(ctx.uid);const editItem=data.strategies.find(x=>x.id===editId);
    if(editItem){const form=el.querySelector('[data-elite-form="strategy"]');form.dataset.position=editItem.id;for(const input of form.elements)if(input.name)input.value=input.name in editItem.factors?editItem.factors[input.name]:input.name==='minChance'?editItem.minChance*100:editItem[input.name]??'';}
    const getDraftKey=form=>ctx.uid+':'+form.dataset.eliteForm+':'+form.dataset.position;
    for(const fm of el.querySelectorAll('[data-elite-form]')){
      const saved=drafts.get(getDraftKey(fm))||{};const button=fm.querySelector('[type=submit]');if(button){button.disabled=pending.has(getDraftKey(fm));if(button.disabled)button.textContent='Saving…';}
      for(const input of fm.elements)if(input.name){input.id='elite-'+fm.dataset.eliteForm+'-'+fm.dataset.position+'-'+input.name;if(input.name in saved)input.value=saved[input.name];}
    }
    for(const d of el.querySelectorAll('[data-elite-open]'))d.open=!!opened.get(ctx.uid+':'+d.dataset.eliteOpen);
    if(focus){const input=document.getElementById(focus.id);if(input){input.focus({preventScroll:true});try{input.setSelectionRange(focus.start,focus.end);}catch{}}}
    el.addEventListener('toggle',e=>{if(e.target.dataset.eliteOpen)opened.set(ctx.uid+':'+e.target.dataset.eliteOpen,e.target.open);},true);
    el.oninput=e=>{const fm=e.target.closest('[data-elite-form]');if(fm)drafts.set(getDraftKey(fm),Object.fromEntries(new FormData(fm)));};
    el.onclick=async e=>{try{
      const alertMessage=await window.PZAlerts?.action(e.target,ctx,current);if(alertMessage){const status=el.querySelector('[data-alert-message]');if(status)status.textContent=alertMessage;}
      if(e.target.closest('[data-elite-export]'))download(ctx.uid);
      if(e.target.closest('[data-elite-enable]'))await ctx.db.ref('workspaceSettings/'+ctx.uid).update({sync:true,consentedAt:Date.now()});
      if(e.target.closest('[data-elite-migrate]')){await save(ctx,doc=>W.merge(doc,read(ctx.uid)));mount(el,ctx);}
      const remove=e.target.closest('[data-elite-remove-strategy]');if(remove){if(editing.get(ctx.uid)===remove.dataset.eliteRemoveStrategy)editing.delete(ctx.uid);await save(ctx,doc=>({...doc,strategies:doc.strategies.filter(x=>x.id!==remove.dataset.eliteRemoveStrategy)}));mount(el,ctx);}
      const edit=e.target.closest('[data-elite-edit-strategy]');if(edit){const item=data.strategies.find(x=>x.id===edit.dataset.eliteEditStrategy);if(item){const fm=el.querySelector('[data-elite-form="strategy"]');editing.set(ctx.uid,item.id);fm.dataset.position=item.id;for(const input of fm.elements)if(input.name)input.value=input.name in item.factors?item.factors[input.name]:input.name==='minChance'?item.minChance*100:item[input.name]??'';fm.closest('details').open=true;fm.scrollIntoView({block:'nearest'});}}
    }catch(error){ctx.onError(error.message);}};
    el.onchange=async e=>{if(!e.target.matches('[data-elite-import]'))return;try{const file=e.target.files[0];if(!file)return;if(file.size>1000000)throw Error('Choose a workspace backup smaller than 1 MB.');const imported=W.validate(JSON.parse(await file.text()));await save(ctx,doc=>W.merge(doc,imported));mount(el,ctx);}catch(error){ctx.onError(error.message);}};
    el.onsubmit=async e=>{
      const fm=e.target.closest('[data-elite-form]');if(!fm)return;e.preventDefault();
      const operationKey=getDraftKey(fm);if(pending.has(operationKey))return;
      if(ctx.currentTier()!=='elite'){ctx.onError('Elite access has expired. Your saved data is retained.');return;}
      try{
        const values=Object.fromEntries(new FormData(fm)),action=fm.dataset.eliteForm,now=Date.now();
        const operationId=id();pending.add(operationKey);
        fm.querySelector('[type=submit]').disabled=true;
        await save(ctx,next=>{const i=next.positions.findIndex(p=>p.id===fm.dataset.position);const p=next.positions[i];
        const c=n=>values[n]===''?null:Number(values[n])/100;
        if(action==='new'){
          if(next.positions.length>=1000)throw Error('Export a backup. This workspace supports 1,000 journal positions.');
          next.positions.push({...T.makePosition({...values,entry:c('entry'),mark:c('mark'),target:c('target'),stop:c('stop'),expiresAt:values.expires?new Date(values.expires).getTime():null,planned:values.status==='planned'},now),id:operationId});
        }else if(action==='strategy'){
          const strategy={...T.makeStrategy({...values,minChance:Number(values.minChance)/100}),id:fm.dataset.position||operationId};const existing=next.strategies.findIndex(x=>x.id===strategy.id);if(existing>=0)next.strategies[existing]=strategy;else{if(next.strategies.length>=100)throw Error('Export a backup before adding more than 100 saved scenarios.');next.strategies.push(strategy);}
        }else{
          if(!p)throw Error('Position not found. Reload the workspace.');
          if(action==='plan')next.positions[i]=T.updatePlan(p,{...values,target:c('target'),stop:c('stop'),expiresAt:values.expires?new Date(values.expires).getTime():null},now);
          else if(action==='fill')next.positions[i]=T.recordFill(p,{...values,entry:c('entry')},now);
          else if(action==='mark')next.positions[i]={...p,mark:c('mark'),quotedAt:now};
          else if(action==='exit')next.positions[i]=T.recordExit(p,{...values,price:c('price')},now);
          else if(action==='settle')next.positions[i]=T.recordSettlement(p,values.result,now);
          else if(action==='correct')next.positions[i]=T.correctPosition(p,{...values,value:values.field==='entry'?c('value'):values.value},now);
          else throw Error('Unknown action.');
        }
        return next;});pending.delete(operationKey);if(!sessions.has(ctx.uid))return;drafts.delete(getDraftKey(fm));if(action==='strategy')editing.delete(ctx.uid);mount(el,ctx);
        el.querySelector('.ew-message').textContent='Saved to your private cloud workspace.';
      }catch(error){pending.delete(operationKey);ctx.onError(error.message);const button=fm.querySelector('[type=submit]');if(button)button.disabled=false;if(sessions.has(ctx.uid))ctx.refresh?.();}
    };
  }
  function download(uid){const current=sessions.get(uid);if(current&&(!current.ready||current.error))throw Error('Cloud records could not be loaded. Try again before exporting a backup.');const blob=new Blob([JSON.stringify({...sessions.get(uid)?.data||read(uid),exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='poizen-elite-workspace.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
  window.PZElite={mount,dispose,data(uid){const current=sessions.get(uid);if(current?.error)throw Error('Cloud workspace could not be loaded. Export your earlier device backup separately.');return current?.data||read(uid);},async exportData(uid,db){const value=(await db.ref('workspaces/'+uid).get()).val();return {cloud:W.decode(value),earlierDeviceJournal:read(uid)};},clear(uid){localStorage.removeItem(key(uid));for(const k of drafts.keys())if(k.startsWith(uid+':'))drafts.delete(k);},download};
})();

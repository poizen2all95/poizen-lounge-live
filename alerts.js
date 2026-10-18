/* Private alert inbox and explicit browser notification enrollment. */
(function(){
 'use strict';
 let messageStop=null;
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const deviceId=()=>{let value=localStorage.getItem('pz_notification_device');if(!value){value=crypto.randomUUID();localStorage.setItem('pz_notification_device',value);}return value;};
 function html(current){const records=Object.entries(current.notifications||{}).sort((a,b)=>(b[1].at||0)-(a[1].at||0)).slice(0,30);return `<section class="card mecard"><h3>Your alert inbox</h3><p class="muted">Target and stop alerts use fresh bids for an exact Kalshi ticker. Expiry alerts use your plan deadline. They prompt a review; they never place an order.</p><div class="row"><button type="button" class="fbtn" data-alert-toggle>${current.settings.alerts?'Pause alerts':'Enable alerts'}</button><button type="button" class="fbtn" data-alert-push>Enable notifications on this device</button><button type="button" class="linkbtn" data-alert-device-off>Remove this device</button></div><p class="mefine">${current.settings.alerts?'Alerts enabled in your account. Delivery requires the connected alert service.':'Alerts are off.'} Device notifications are optional. Inbox alerts remain available here. Quotes typed into the journal never trigger background target or stop alerts.</p>${records.length?records.map(([id,n])=>`<article class="ew-notice"><b>${esc(n.title)}</b><p>${esc(n.body)}</p><small>${esc(new Date(n.at).toLocaleString())} · ${n.delivery?.status==='sent'?'Push accepted by provider':n.delivery?.status==='failed'?'Push could not be delivered':'Saved in inbox'}</small>${n.read?'':` <button type="button" class="linkbtn" data-alert-read="${esc(id)}">Mark read</button>`}</article>`).join(''):'<p class="muted">No alerts yet. Add a target, stop, or expiry to a position.</p>'}<p data-alert-message role="status" aria-live="polite"></p></section>`;}
 async function enablePush(ctx){
  if(!('Notification'in window)||!('serviceWorker'in navigator))throw Error('Device notifications are not supported in this browser. Your inbox still works.');
  if(!ctx.vapidKey)throw Error('Device notifications are waiting for the Lounge notification service configuration. Inbox alerts remain available.');
  if(Notification.permission==='denied')throw Error('Notifications are blocked in this browser. Change the site permission to enable them.');
  if(await Notification.requestPermission()!=='granted')throw Error('Notification permission was not granted. Your inbox remains available.');
  if(!firebase.messaging)await ctx.loadScripts(['https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js']);
  const messaging=firebase.messaging();
  if(!await firebase.messaging.isSupported())throw Error('Push is unavailable on this device. Use the alert inbox.');
  const swURL=new URL('firebase-messaging-sw.js',location.href);swURL.searchParams.set('config',JSON.stringify(ctx.firebaseConfig));
  const registration=await navigator.serviceWorker.register(swURL.href,{scope:new URL('./',location.href).pathname});
  const token=await messaging.getToken({vapidKey:ctx.vapidKey,serviceWorkerRegistration:registration});
  if(!token)throw Error('No notification token was returned. Please try again.');
  await ctx.db.ref('workspaceDevices/'+ctx.uid+'/'+deviceId()).set({token,at:Date.now()});
  messageStop?.();messageStop=messaging.onMessage(()=>ctx.onMessage?.());
  return 'This device is registered. Alerts must also be enabled in your account.';
 }
 async function action(target,ctx,current){
  if(target.closest('[data-alert-toggle]')){if(current.settings.sync!==true)throw Error('Enable the cloud workspace before enabling alerts.');await ctx.db.ref('workspaceSettings/'+ctx.uid+'/alerts').set(!current.settings.alerts);return 'Alert preference saved.';}
  if(target.closest('[data-alert-push]'))return enablePush(ctx);
  if(target.closest('[data-alert-device-off]')){await removeDevice(ctx.uid,ctx.db);return 'This device was removed from your account.';}
  const read=target.closest('[data-alert-read]');if(read){await ctx.db.ref('workspaceNotifications/'+ctx.uid+'/'+read.dataset.alertRead+'/read').set(true);return 'Marked read.';}
 }
 async function removeDevice(uid,db){messageStop?.();messageStop=null;const device=localStorage.getItem('pz_notification_device');if(device&&uid)await db.ref('workspaceDevices/'+uid+'/'+device).remove();}
 window.PZAlerts={html,action,removeDevice,dispose(){messageStop?.();messageStop=null;}};
})();

/* Keep an immutable request until an ambiguous network outcome is resolved. */
(function(root){
 'use strict';
 async function persist(state,{slips,create,send}){
  const retried=!!state.pendingSave;
  if(!state.pendingSave)state.pendingSave=JSON.parse(JSON.stringify(create()));
  const payload=state.pendingSave;
  if(slips[payload.id]){const slip=slips[payload.id];delete state.pendingSave;return{id:payload.id,slip,replayed:true};}
  try{const result=await send(payload);slips[payload.id]=result.slip;delete state.pendingSave;return{id:payload.id,slip:result.slip,replayed:retried||!!result.replayed};}
  catch(error){if(error.definitive)delete state.pendingSave;throw error;}
 }
 const api={persist};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZMemberSave=api;
})(typeof window!=='undefined'?window:globalThis);

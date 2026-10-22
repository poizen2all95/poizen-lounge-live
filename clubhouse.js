/* Shared editorial NFL identity. Data, access checks and outcomes remain owned by the Lounge. */
(function (root) {
  'use strict';
  const paper = '#f5f3ef';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const hex = value => /^#?[a-f0-9]{6}$/i.test(String(value)) ? '#'+String(value).replace('#','').toLowerCase() : '#171a1d';
  function channels(value) { const h=hex(value);return [1,3,5].map(i=>parseInt(h.slice(i,i+2),16)); }
  function luminance(value) { const c=channels(value).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2]; }
  function contrast(a,b) { const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05); }
  function mix(a,b,weight) { const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*weight).toString(16).padStart(2,'0')).join(''); }
  function readable(value) { let x=hex(value);for(let i=0;contrast(x,paper)<4.5&&i<24;i++)x=mix(x,'#111315',.12);return x; }
  function palette(primary,secondary) {
    const a=hex(primary),b=hex(secondary),range=channels(a),neutral=Math.max(...range)-Math.min(...range)<25;
    return {paper,ink:'#171a1d',primary:a,secondary:b,accent:readable(neutral?b:a),accentSoft:mix(a,paper,.93)};
  }
  function safeMedia(value) { const s=String(value||'');if(/[\s"'<>\\]/.test(s))return '';if(/^assets\/nfl-teams\/[a-z0-9._/-]+$/i.test(s)&&!s.split('/').includes('..'))return s;try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password?s:'';}catch{return '';} }
  function team(id,teams,assets={}) {
    if(!/^nfl:[A-Z]{2,3}$/.test(String(id||'')))return null;
    const abbr=id.slice(4),entry=(teams?.nfl||[]).find(t=>t[0]===abbr);if(!entry)return null;
    const asset=Object.prototype.hasOwnProperty.call(assets,abbr)?assets[abbr]:{};
    const name=entry[1],words=name.split(' '),nickname=asset.nickname||words.at(-1),city=asset.city||words.slice(0,-1).join(' ');
    return {id,abbr,name,city,nickname,logo:safeMedia(asset.logo)||'https://a.espncdn.com/i/teamlogos/nfl/500/'+abbr.toLowerCase()+'.png',stadium:asset.stadium?{...asset.stadium,photo:safeMedia(asset.stadium.photo)}:null,palette:palette(entry[2],entry[3])};
  }
  function render(t) {
    if(!t)return '';
    const logo=safeMedia(t.logo),photo=safeMedia(t.stadium?.photo);
    return `<section class="clubhouse-team${photo?' has-photo':''}" style="--club-name-scale:${Math.min(1,8/String(t.nickname||'').length)}" aria-label="${esc(t.name)} team theme"><div class="clubhouse-identity">${logo?`<img class="clubhouse-crest" src="${esc(logo)}" alt="${esc(t.name)} crest" width="160" height="160" decoding="async">`:''}<div class="clubhouse-wordmark"><p>${esc(t.city)}</p><h1>${esc(t.nickname)}</h1><span>Your team. Your lounge.</span><span class="clubhouse-sr">${esc(t.name)}</span></div></div>${photo?`<figure class="clubhouse-stadium"><img src="${esc(photo)}" alt="${esc(t.stadium.name)}" width="960" height="420" decoding="async"><figcaption><b>${esc(t.stadium.name)}</b>${t.stadium.city?`<span>${esc(t.stadium.city)}</span>`:''}</figcaption></figure>`:`<div class="clubhouse-home"><span>${esc(t.name)}</span><small>NFL Clubhouse</small></div>`}</section>`;
  }
  const api={palette,contrast,team,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PZClubhouse=api;
})(typeof window!=='undefined'?window:globalThis);

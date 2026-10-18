import {appearanceGroups,normalizeAppearance,randomAppearance} from './appearance.js';
import {avatar} from './avatar.js';

export function appearanceStudio(input){
  const a=normalizeAppearance(input);
  return `<aside class="avatar-studio appearance-studio"><div class="appearance-top"><div class="avatar-stage" id="avatar-preview">${avatar(a,128,true)}</div><div class="appearance-heading"><span class="eyebrow">PIXEL PORTRAIT</span><h3>捏一个小小的 TA</h3><button type="button" class="soft-btn random-appearance" data-action="random-avatar">✧ 随机一套外观</button><small>只换外观，保留人物设定</small></div></div><div class="appearance-tabs" role="tablist" aria-label="外观分类">${appearanceGroups.map((g,i)=>`<button type="button" role="tab" id="appearance-tab-${g.id}" aria-controls="appearance-panel-${g.id}" aria-selected="${i===0}" tabindex="${i===0?0:-1}" data-appearance-tab="${g.id}" class="${i===0?'active':''}">${g.label}</button>`).join('')}</div>${appearanceGroups.map((g,i)=>`<section class="appearance-panel" role="tabpanel" id="appearance-panel-${g.id}" aria-labelledby="appearance-tab-${g.id}" ${i===0?'':'hidden'}><div class="appearance-colors">${g.colors.map(([key,label])=>`<label for="avatar-${key}"><span>${label}</span><input type="color" id="avatar-${key}" data-avatar="${key}" value="${a[key]}"></label>`).join('')}</div><div class="appearance-options">${g.fields.map(([key,label,values])=>`<div><label for="avatar-${key}">${label}</label><select id="avatar-${key}" data-avatar="${key}">${values.map(([v,l])=>`<option value="${v}" ${a[key]===v?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')}</div></section>`).join('')}</aside>`;
}
export function switchAppearanceTab(root,id,{focus=false}={}){
  if(!appearanceGroups.some(g=>g.id===id))return;
  for(const tab of root.querySelectorAll('[data-appearance-tab]')){
    const active=tab.dataset.appearanceTab===id;tab.classList.toggle('active',active);tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;if(active&&focus)tab.focus();
  }
  for(const panel of root.querySelectorAll('.appearance-panel'))panel.hidden=panel.id!==`appearance-panel-${id}`;
}
export function refreshAppearance(root,input){
  const a=normalizeAppearance(input);
  root.querySelector('#avatar-preview').innerHTML=avatar(a,128,true);
  for(const control of root.querySelectorAll('[data-avatar]'))control.value=a[control.dataset.avatar];
  return a;
}
export function randomizeAppearance(root,character,random=Math.random){
  character.avatar=randomAppearance(random);
  refreshAppearance(root,character.avatar);
}

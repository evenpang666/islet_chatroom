import {t,h} from './i18n.js';
const uuid=/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
export function characterKey(role) {
  if(typeof role?.presetId==='string'&&/^(?:[a-z]+|generated-[a-f\d-]{36})$/.test(role.presetId))return 'preset:'+role.presetId;
  const id=role?.characterId||role?.id;
  return typeof id==='string'&&uuid.test(id)?'custom:'+id.toLowerCase():null;
}
export function characterId(role) {
  const id=role?.characterId||role?.id;
  return typeof id==='string'&&uuid.test(id)?id.toLowerCase():null;
}
export function newCharacterId() {
  return globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const n=Math.floor(Math.random()*16);return(c==='x'?n:(n&3)|8).toString(16);
  });
}
export function selectionConflict(role,{occupiedCharacters=[],drafts=[],slot=-1}={}) {
  const key=characterKey(role);if(!key)return '';
  const occupied=occupiedCharacters.find(a=>a.key===key);
  if(occupied)return h`已加入「${occupied.roomName}」，移出角色或解散该群后可再邀请`;
  const index=drafts.findIndex((a,i)=>i!==slot&&characterKey(a)===key);
  return index>=0?h`已在第 ${index+1} 位，不能重复邀请`:'';
}

export function unreadCount(room,markers={}) {
  const mark=markers[room.id];
  if(!mark||mark.createdAt!==(room.createdAt||0))return 0;
  return Math.max(0,(room.messageCount??room.messages?.length??0)-(Number(mark.count)||0));
}
export function seedReadMarkers(markers,rooms) {
  const next={};
  for(const room of rooms){const old=markers[room.id];next[room.id]=old?.createdAt===(room.createdAt||0)?old:{createdAt:room.createdAt||0,count:room.messageCount??room.messages?.length??0};}
  return next;
}
export function markRoomRead(markers,room) {
  const count=room.messageCount??room.messages?.length??0,old=markers[room.id],createdAt=room.createdAt||0;
  return {...markers,[room.id]:{createdAt,count:old?.createdAt===createdAt?Math.max(Number(old.count)||0,count):count}};
}
export function mergeReadMarkers(a,b) {
  const next={...a};
  for(const [id,mark]of Object.entries(b||{})){
    if(!mark||!Number.isFinite(mark.createdAt)||!Number.isFinite(mark.count))continue;
    const old=next[id];if(!old||old.createdAt<mark.createdAt)next[id]=mark;
    else if(old.createdAt===mark.createdAt)next[id]={createdAt:mark.createdAt,count:Math.max(Number(old.count)||0,mark.count)};
  }return next;
}
export function homeView(lobby,{header,footer,avatar,esc,icon,presetCount,readMarkers}) {
  return h`<div class="shell">${header()}<main class="page lobby-page"><section class="hero lobby-hero"><div><div class="eyebrow">A PLACE FOR EVERY CONVERSATION</div><h1>你的小世界，都在这里。</h1><p>走进一场对话，也可以暂时离开。<br>朋友们有自己的生活，故事不会因为你离开而停下。</p></div><button class="primary" data-action="new-room">＋ 创建群聊</button></section><div class="lobby-heading"><h2>所有群聊 <span class="counter">${lobby.rooms.length} 个小世界</span></h2><span class="lobby-note">${icon('clock')} 离开不散场，随时回来</span></div><div id="room-list" class="room-list">${roomCards(lobby.rooms,{avatar,esc,icon,presetCount,readMarkers})}</div></main>${footer()}</div>`;
}

export function roomCards(rooms,{avatar,esc,icon,presetCount=100,readMarkers={}}) {
  if(!rooms.length)return h`<section class="panel empty-world"><span class="empty-world-icon">◇</span><h2>第一场相遇，等你来安排。</h2><p>邀请几个有趣的灵魂，聊聊日常、书、宇宙，<br>或是今天刚冒出来的一个小想法。</p><button class="primary" data-action="new-room">创建第一个群聊 ${icon('arrow')}</button><small>最多 5 位 AI 朋友 · ${presetCount} 位人物灵感</small></section>`;
  return rooms.map(r=>{const unread=unreadCount(r,readMarkers);return h`<article class="panel room-tile" data-room-card="${r.id}"><div class="room-tile-top"><span class="room-kind">${icon('island')} ${r.paused?t('聚会已暂停'):t('对话在继续')}</span>${unread?h`<span class="unread-badge" aria-label="${unread} 条未读消息" title="${unread} 条未读消息">${unread>99?'99+':unread}</span>`:''}<button class="room-menu" data-dissolve="${r.id}" aria-label="解散群聊 ${esc(r.name)}">解散</button></div><div class="tile-avatars">${r.agents.map(a=>avatar(a.avatar,49)).join('')}</div><button class="tile-title" data-enter="${r.id}">${esc(r.name)}</button><p class="tile-members">${r.agents.map(a=>esc(a.name)).join('、')}</p><div class="tile-message">${r.lastMessage?`<b>${esc(r.lastMessage.name)}</b><span>${esc(r.lastMessage.text)}</span>`:t('<span>朋友们会按各自当地时间，慢慢开启话题。</span>')}</div><div class="tile-footer"><small>${r.agents.length} 位 AI 朋友 · ${r.messageCount} 条消息</small><button class="text-btn" data-enter="${r.id}">进入群聊 ${icon('arrow')}</button></div></article>`;}).join('');
}

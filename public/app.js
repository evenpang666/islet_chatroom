import { avatar } from './avatar.js';
import {normalizeAppearance} from './appearance.js';
import {appearanceStudio,switchAppearanceTab,randomizeAppearance,refreshAppearance} from './appearance-editor.js';
import { locations,defaultLocation } from './locations.js';
import { homeView,roomCards,characterId,newCharacterId,selectionConflict,seedReadMarkers,markRoomRead,mergeReadMarkers } from './lobby.js';
import { emojiGroups } from './emoji.js';
import { firstGrapheme,usageText,usageDetail } from './text.js';

const $=(s,root=document)=>root.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={island:'<path d="m3 10 9-6 9 6-9 6z"/><path d="m3 15 9 6 9-6"/>',settings:'<path d="m10 3-.7 2.1-2 .9-2.1-.5-2 3.5L4.7 11v2l-1.5 2 2 3.5 2.1-.5 2 .9L10 21h4l.7-2.1 2-.9 2.1.5 2-3.5-1.5-2v-2l1.5-2-2-3.5-2.1.5-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',spark:'<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',people:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m2 10v-3a6 6 0 0 0-3-5"/>',sound:'<path d="M11 4 5 9H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',mute:'<path d="M11 4 5 9H2v6h3l6 5zM16 9l6 6m0-6-6 6"/>',send:'<path d="m22 2-7 20-4-9-9-4zM22 2 11 13"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4"/>',pause:'<path d="M8 5v14M16 5v14"/>',play:'<path d="m7 4 14 8-14 8z"/>',edit:'<path d="m15 4 5 5-11 11H4v-5zM13 6l5 5"/>'};
const icon=(name)=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.spark}</svg>`;
const app=$('#app'),modal=$('#modal');
const storage={get(k,d=''){try{return localStorage.getItem('islet-'+k)??d;}catch{return d;}},set(k,v){try{localStorage.setItem('islet-'+k,v);}catch{}}};
let state,presets=[],drafts=[],count=3,roomName='一些有趣的灵魂',topic='今天，有什么值得聊聊的小事？',timezone='Asia/Shanghai',sound=storage.get('sound','on')==='on',clientId=storage.get('clientId'),userName=storage.get('name','我'),audio,connected=true,renderedMessageIds='',visibleLimit=200,toastTimer,pickerIndex=0,pickerCategory='全部',pickerSearch='',editingIndex=0,editing=null,submitting=false;
let lobby={rooms:[]},view='home',currentRoomId=null,roomEvents=null,routeVersion=0,dissolveId=null,removeTarget=null,detailId=null,inviteRoomId=null,inviting=false,readMarkers=loadReadMarkers();
if(!clientId){clientId=globalThis.crypto?.randomUUID?.()||`guest-${Date.now()}-${Math.random().toString(36).slice(2)}`;storage.set('clientId',clientId);}
async function api(path,data){
  const scoped=['messages','pause','remove-agent'].includes(path);
  if(scoped&&!currentRoomId)throw Error('请先进入一个群聊。');
  const target=scoped?`rooms/${currentRoomId}/${path}`:path;
  const r=await fetch(`./api/${target}`,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const value=await r.json();if(!r.ok)throw Error(value.error||'请求失败，请重试。');return value;
}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500);}
function saveDraft(){storage.set('draft',JSON.stringify({drafts,count,roomName,topic,timezone}));}
function clone(v){return JSON.parse(JSON.stringify(v));}
function beep(){if(!sound)return;try{audio??=new (window.AudioContext||window.webkitAudioContext)();audio.resume();const t=audio.currentTime;for(const [freq,delay]of [[660,0],[880,.08]]){const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='sine';oscillator.frequency.value=freq;gain.gain.setValueAtTime(0,t+delay);gain.gain.linearRampToValueAtTime(.045,t+delay+.015);gain.gain.exponentialRampToValueAtTime(.001,t+delay+.18);oscillator.connect(gain).connect(audio.destination);oscillator.start(t+delay);oscillator.stop(t+delay+.2);}}catch{}}
function header(){return `<header class="topbar"><button class="brand brand-home" data-action="home" aria-label="返回群聊主页"><span class="brand-icon">${icon('island')}</span><span class="brand-title">浮岛<em>ISLET</em></span></button><span class="top-center">让相遇发生，让对话慢慢生长</span><div class="top-actions">${view!=='home'?'<button class="text-btn home-link" data-action="home">← 所有群聊</button>':''}<span class="pill"><i class="dot ${state.connected&&connected?'':'off'}"></i><span class="connection-label">${!connected?'正在重连':state.connected?'本地小世界':'界面预览'}</span></span><button class="icon-btn" data-action="settings" aria-label="设置">${icon('settings')}</button></div></header>`;}
function footer(chat=false){return `<footer class="bottom-bar ${chat?'chat-footer':''}"><span><span class="tiny-island">◇</span> 一个小小的世界，装得下不同的想法。</span><span class="local-address">${state.network?.lanUrl?esc(state.network.lanUrl):'LOCAL FIRST · MADE FOR CONVERSATION'}</span>${chat?`<small class="room-usage" id="room-usage" title="${esc(usageDetail(state.usage))}">${esc(usageText(state.usage))}</small>`:''}</footer>`;}
function setup(){const ready=drafts.slice(0,count).filter((a,i)=>a?.ready&&!draftConflict(i)).length;return `<div class="shell">${header()}<main class="page"><section class="hero"><div><div class="eyebrow">A SMALL WORLD. REAL CONVERSATIONS.</div><h1>把有趣的灵魂，聚在一起。</h1><p>选几位朋友，赋予他们性格与生活。<br>然后，留一点空间，让故事自己发生。</p></div><div class="hero-art">${[presets[25],presets[35],presets[0]].filter(Boolean).map(a=>`<div class="portrait">${avatar(a.avatar,65)}</div>`).join('')}<span class="spark">✧</span><span class="whisper">每个人，都有自己的小宇宙</span></div></section><div class="setup-grid"><div class="setup-main"><section class="panel room-form"><div><div class="section-label"><b>01</b> 给聚会起个名字</div><label class="sr-only" for="room-name">聊天室名称</label><input id="room-name" maxlength="60" value="${esc(roomName)}" placeholder="一些有趣的灵魂"></div><div><div class="section-label"><b>02</b> 邀请几位 AI 朋友 <small>最多 5 位</small></div><div class="count-row">${[1,2,3,4,5].map(n=>`<button class="count-btn ${n===count?'selected':''}" data-count="${n}" aria-pressed="${n===count}">${n}</button>`).join('')}<small>位</small></div></div></section><div class="characters-head"><h2>认识你的新朋友 <span class="counter">${ready} / ${count} 已就绪</span></h2><button class="text-btn" data-action="picker">${icon('people')} ${presets.length} 位人物灵感</button></div><section class="slots">${Array.from({length:count},(_,i)=>card(drafts[i],i)).join('')}</section><p class="foot-hint">${icon('lock')} 所有角色定制完成后，才会一起进入聊天室。</p></div><aside class="panel invitation"><div class="eyebrow">YOUR LITTLE GATHERING</div><h2>不只是回复，<br>也是一场相遇。</h2><p class="description">他们会记住聊天里的小事，也有自己的日常。不用催促，总有人带来新的话题。</p><div class="preview-chat"><div class="preview-msg">${avatar(presets[25]?.avatar,28)}<div class="preview-bubble">如果时间也能慢下来，<br>你想用它做些什么？</div></div><div class="preview-msg">${avatar(presets[35]?.avatar,28)}<div class="preview-bubble">先泡一杯茶，再想。</div></div><div class="preview-caption">气氛预览 · 非真实聊天记录</div></div><div class="rule">${icon('heart')} 独立的性格与记忆</div><div class="rule">${icon('clock')} 自然的节奏与留白</div><div class="rule">${icon('people')} 你也在这场对话里</div><button class="primary" data-action="start" ${ready!==count||submitting?'disabled':''}>${submitting?'正在准备小世界…':'让聚会开始'} ${icon('arrow')}</button><div class="button-note">${ready!==count?'还有 '+(count-ready)+' 位朋友等待你完成定制':'朋友们准备好了，就差你了。'}</div></aside></div></main>${footer()}</div>`;}
function card(a,i){const conflict=draftConflict(i);return a?`<article class="character-card"><span class="card-number">0${i+1}</span>${a.ready&&!conflict?'<span class="ready-mark">✓ 已就绪</span>':''}${avatar(a.avatar,74)}<h3>${esc(a.name)}</h3><p title="${esc(conflict)}">${esc(conflict||a.source||'原创角色')}</p><button class="edit-btn" data-edit="${i}">${conflict?'更换已占用角色':a.ready?'再了解一点':'定制角色'} <span aria-hidden="true">↗</span></button></article>`:`<button class="character-card add-card" data-choose="${i}"><span>＋</span><b>第 ${i+1} 位新朋友</b><small>选择人物或创造角色</small></button>`;}
function chat(){return `<div class="shell">${header()}<main class="chat-layout page"><aside class="panel sidebar"><div class="section-label"><b>THE GATHERING</b></div><h1 class="room-title">${esc(state.name)}</h1><p class="room-sub">${state.agents.length} 位 AI 朋友，还有你。<br>随时说点什么，也可以安静地听。</p><div class="members">${state.agents.map((a,i)=>`<button class="member" data-detail="${i}">${avatar(a.avatar,40)}<span><b>${esc(a.name)}</b><small>${esc(a.source)}</small></span></button>`).join('')}<button class="member" data-action="identity"><span class="self-avatar">${esc(firstGrapheme(userName))}</span><span><b>${esc(userName)} <span class="badge">你</span></b><small>故事的一部分</small></span></button></div><div class="sidebar-bottom"><p class="sidebar-note">每一次有来有回，<br>都是这个小世界的新记忆。</p><button class="soft-btn" data-action="home">← 暂时退出，返回主页</button><button class="soft-btn" data-action="invite" ${state.agents.length>=5?'disabled':''}>＋ 邀请新朋友</button><button class="text-btn sidebar-settings" data-action="settings">聚会设置</button></div></aside><section class="panel chat-panel"><header class="chat-header"><div><h2>${esc(state.name)}</h2><p>${esc(state.topic)}</p></div><button class="avatars" data-action="members" aria-label="查看聚会成员">${state.agents.map(a=>avatar(a.avatar,34)).join('')}</button></header><div id="connection-warning"></div><div id="paused-strip"></div><div class="messages" id="messages" role="log" aria-label="聊天消息" aria-live="polite"></div><div class="typing-area" id="typing" aria-live="polite"></div><form class="composer" id="composer"><div class="emoji-panel" id="emoji-panel" hidden>${emojiPicker()}</div><div class="composer-box"><button class="emoji-toggle" type="button" data-action="emoji" aria-label="选择 emoji" aria-expanded="false">😊</button><textarea id="message-input" rows="1" maxlength="3000" placeholder="说点什么，让故事继续…" aria-label="聊天消息"></textarea><button class="send" type="submit" aria-label="发送消息">${icon('send')}</button></div><div class="composer-footer"><span>Enter 发送 · Shift + Enter 换行</span><span><button type="button" data-action="identity">${esc(userName)}</button> · <button type="button" data-action="sound">${sound?'声音已开':'声音已关'}</button></span></div></form></section></main>${footer(true)}</div>`;}
function render(){renderedMessageIds='';app.innerHTML=view==='chat'?chat():view==='setup'?setup():homeView(lobby,{header,footer,avatar,esc,icon,presetCount:presets.length,readMarkers});if(view==='chat'){updateChat(true);$('#message-input').value=storage.get('message-'+currentRoomId,'');}}
function updateChat(force=false){const usage=$('#room-usage');if(usage){usage.textContent=usageText(state.usage);usage.title=usageDetail(state.usage);}if(!state.started||!$('#messages'))return;const el=$('#messages');const key=state.messages.map(m=>m.id).join(',');if(force||key!==renderedMessageIds){const nearBottom=el.scrollHeight-el.scrollTop-el.clientHeight<100;const previous=new Set(renderedMessageIds.split(',')),shown=state.messages.slice(-visibleLimit);const first=shown[0];el.innerHTML=shown.length?`${state.messages.length>visibleLimit?'<div class="day-divider"><button class="text-btn" data-action="older">查看更早的消息 ↑</button></div>':''}<div class="day-divider">${date(first.at)} · 相遇的每一句，都留在这里</div>${shown.map(m=>message(m,!force&&!previous.has(m.id))).join('')}`:`<div class="empty-chat"><span class="island">◇</span><h3>故事，从一句话开始。</h3><p>朋友们都在这个小世界里了。<br>打个招呼，或者留一点时间，等一个话题慢慢冒出来。</p><button class="topic-chip" data-action="topic">${esc(state.topic)} ↗</button></div>`;renderedMessageIds=key;if(nearBottom||force)el.scrollTop=el.scrollHeight;}
  const typers=state.agents.filter(a=>state.typing.includes(a.id)).map(a=>a.name);$('#typing').innerHTML=typers.length?`<span class="dots"><i></i><i></i><i></i></span> ${esc(typers.join('、'))} 正在输入`:'';
  $('#paused-strip').innerHTML=state.paused?'<div class="paused-strip">聚会已暂停 · 你仍然可以留言 <button class="text-btn" data-action="pause">继续聚会 →</button></div>':'';
  $('#connection-warning').innerHTML=!state.connected?'<div class="connection-strip">当前为界面预览。运行 start.bat / start.sh 接入 DSH Web 后，角色才会回复。</div>':state.error?'<div class="connection-strip">角色暂时未能回复。<button class="text-btn" data-action="settings">查看连接设置 →</button></div>':'';
}
const time=at=>new Intl.DateTimeFormat('zh-CN',{timeZone:state.timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(at);
const date=at=>new Intl.DateTimeFormat('zh-CN',{timeZone:state.timezone,month:'long',day:'numeric'}).format(at);
function message(m,fresh=false){if(m.kind==='system')return `<article class="system-message" role="note">${esc(m.text)}</article>`;const own=m.kind==='user'&&m.clientId===clientId,a=state.agents.find(a=>a.id===m.agentId);return `<article class="message ${own?'self':''} ${fresh?'new-message':''}">${a?avatar(a.avatar,38):`<span class="self-avatar">${esc(firstGrapheme(m.name))}</span>`}<div class="message-content"><div class="message-meta"><span>${esc(own?'我':m.name)}</span><time datetime="${new Date(m.at).toISOString()}">${time(m.at)}</time></div><div class="bubble">${esc(m.text)}</div></div></article>`;}
function accept(next){
  if(next.id!==currentRoomId)return;
  const previous=state;const membersChanged=previous?.agents.map(a=>a.id).join()!==next.agents.map(a=>a.id).join();
  if(membersChanged)saveMessageDraft();state=next;readCurrentRoom();
  if(view==='chat'){if(membersChanged)render();else updateChat();}
  if(detailId&&!next.agents.some(a=>a.id===detailId)){detailId=null;closeModal();}
  const badge=$('.connection-label');if(badge)badge.textContent=!connected?'正在重连':state.connected?'本地小世界':'界面预览';
  if(previous?.id===next.id&&next.messages.length>(previous.messages?.length||0)&&next.messages.at(-1).clientId!==clientId)beep();
}
function showModal(title,subtitle,html,cls=''){detailId=null;modal.innerHTML=`<div class="modal-header"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="icon-btn" data-action="close" aria-label="关闭">${icon('close')}</button></div><div class="modal-body ${cls}">${html}</div>`;if(!modal.open)modal.showModal();$('.modal-body',modal).scrollTop=0;}
function closeModal(){detailId=null;inviteRoomId=null;modal.close();}
function openPicker(index=0){pickerIndex=index;pickerSearch='';pickerCategory='全部';showModal('邀请一位有趣的灵魂',`${presets.length} 位人物灵感，也可以从零创造，或从文字中认识一个人。`,`<div class="search-line"><input id="preset-search" placeholder="搜索人物、作品或背景…" aria-label="搜索人物">${inviteRoomId?'<small class="invite-slot">新增群成员</small>':`<select id="picker-slot" aria-label="选择角色位置" style="width:125px">${Array.from({length:count},(_,i)=>`<option value="${i}" ${i===pickerIndex?'selected':''}>第 ${i+1} 位</option>`).join('')}</select>`}</div><div class="tabs">${['全部',...new Set(presets.map(p=>p.category))].map((c,i)=>`<button class="tab ${i===0?'active':''}" data-category="${c}">${c}</button>`).join('')}</div><div class="preset-grid" id="preset-grid"></div><div class="editor-footer"><button class="soft-btn" data-action="new-character">＋ 创造原创角色</button><button class="text-btn" data-action="import">从聊天记录中提炼 ${icon('arrow')}</button></div>`);renderPresets();}
function renderPresets(){const list=presets.filter(p=>(pickerCategory==='全部'||p.category===pickerCategory)&&JSON.stringify(p).toLowerCase().includes(pickerSearch.toLowerCase()));$('#preset-grid').innerHTML=list.map(p=>{const conflict=selectionConflict({...p,presetId:p.id},selectionOptions(pickerIndex));return `<button class="preset" data-preset="${p.id}" ${conflict?'disabled':''} title="${esc(conflict||p.source)}">${avatar(p.avatar,52)}<b>${esc(p.name)}</b><small>${esc(p.category)}</small>${conflict?`<small class="availability-note">${esc(conflict)}</small>`:''}</button>`;}).join('')||'<div class="empty wide">暂时没有找到，试试另一个名字。</div>';}
function openEditor(index,override){editingIndex=index;editing=clone(override||drafts[index]||{name:'',source:'原创角色',background:'',personality:'温和、好奇，有自己的观点',style:'自然的短句，像朋友一样说话',habits:'读书、散步、做饭',sleepStart:23,sleepEnd:7,replySeconds:10,typingCps:4,busyProbability:.25,busyMinutes:60,initiative:.35,avatar:{skin:'#e7b99a',hair:'#554639',shirt:'#8b83b9',background:'#dcd9ec',hairStyle:1,accessory:'none'}});
  if(!editing.presetId)editing.characterId=characterId(editing)||newCharacterId();
  Object.assign(editing,{...defaultLocation(editing.presetId),...editing});
  editing.era??=presets.find(p=>p.id===editing.presetId)?.era||'当代生活，可填写自己的年份区间、知识与习惯边界。';
  editing.avatar=normalizeAppearance(editing.avatar);
  const a=editing;showModal(`第 ${index+1} 位朋友 · ${a.name||'等待一个名字'}`,'让一个名字，慢慢变成一个有性格、有习惯的人。',`<form id="character-form"><div class="editor-grid">${appearanceStudio(a.avatar)}<div class="fields"><div class="wide"><label for="char-name">怎么称呼 TA</label><input id="char-name" name="name" value="${esc(a.name)}" maxlength="40" required></div><div class="wide"><label for="background">人物背景与工作</label><textarea id="background" name="background" maxlength="3000" required>${esc(a.background)}</textarea></div><div><label for="personality">性格</label><textarea id="personality" name="personality" maxlength="2000">${esc(a.personality)}</textarea></div><div><label for="char-style">说话风格</label><textarea id="char-style" name="style" maxlength="2000">${esc(a.style)}</textarea></div><div class="wide"><label for="era">生活年份区间、知识与时代习惯</label><textarea id="era" name="era" maxlength="1800" required>${esc(a.era)}</textarea></div><div class="wide"><label for="habits">生活习惯、兴趣与日常</label><textarea id="habits" name="habits" maxlength="2000">${esc(a.habits)}</textarea></div><div class="wide subhead">TA 在世界的哪一处 <small>位置会影响当地时间与生活节律</small></div><div class="wide"><label for="location-city">快速选择城市</label><select id="location-city"><option value="">自定义所在地与时区</option>${locations.map(p=>`<option value="${p.id}" ${p.name===a.location&&p.timezone===a.timezone?'selected':''}>${esc(p.name)}</option>`).join('')}</select></div><div><label for="char-location">所在地</label><input id="char-location" name="location" maxlength="100" value="${esc(a.location)}" required></div><div><label for="char-timezone">当地时区</label><input id="char-timezone" name="timezone" value="${esc(a.timezone)}" list="role-timezones" maxlength="80" required><datalist id="role-timezones">${[...new Set(locations.map(p=>p.timezone))].map(z=>`<option value="${z}">`).join('')}</datalist></div><p class="wide local-time-preview" id="role-clock">${esc(roleClock(a.timezone))}</p><div class="wide subhead">生活的节奏 <small>只在后台生效，聊天室不显示状态</small></div><div><label for="sleepStart">入睡时间</label><select id="sleepStart" name="sleepStart">${hours(a.sleepStart)}</select></div><div><label for="sleepEnd">起床时间</label><select id="sleepEnd" name="sleepEnd">${hours(a.sleepEnd)}</select></div><div><label for="replySeconds">阅读与思考（秒）</label><input id="replySeconds" name="replySeconds" type="number" min="1" max="180" value="${a.replySeconds}"></div><div><label for="typingCps">打字速度（字 / 秒）</label><input id="typingCps" name="typingCps" type="number" min="1" max="12" step=".5" value="${a.typingCps}"></div><div><label for="busyProbability">去忙自己的事（概率 %）</label><input id="busyProbability" name="busyProbability" type="number" min="0" max="100" value="${Math.round(a.busyProbability*100)}"></div><div><label for="busyMinutes">忙碌时长（约 / 分钟）</label><input id="busyMinutes" name="busyMinutes" type="number" min="5" max="180" value="${a.busyMinutes}"></div><div class="wide"><label for="initiative">主动开启话题的意愿 <span id="initiative-value">${Math.round(a.initiative*100)}%</span></label><input id="initiative" name="initiative" type="range" min="0" max="1" step=".05" value="${a.initiative}"></div><small class="wide">每日作息按 TA 的当地时间运行，支持夏令时。每半小时有一次日常活动机会；暂时退出群聊不会停止角色。入睡与起床相同表示不设睡眠时段。</small></div></div><div class="editor-footer"><button type="button" class="soft-btn" data-action="replace">更换人物</button><small>确认后会生成专属角色 Skill</small><button class="primary" type="submit">完成角色 ${icon('arrow')}</button></div></form>`);}
function hours(selected){return Array.from({length:24},(_,i)=>`<option value="${i}" ${Number(selected)===i?'selected':''}>${String(i).padStart(2,'0')}:00</option>`).join('');}
function openImport(){showModal('从文字里，认识一个人','支持粘贴聊天记录或导入 UTF-8 TXT / JSON。只提炼可观察到的语言与行为特征。',`<label for="extract-name">目标人物的名字 / 在记录中的称呼</label><input id="extract-name" maxlength="40" placeholder="例如：小林"><div class="import-area"><label for="extract-text">文本记录</label><textarea id="extract-text" maxlength="60000" placeholder="粘贴至少 30 字的记录。建议包含人物称呼与多轮对话，先移除手机号、住址等隐私信息。"></textarea></div><div class="import-footer"><label class="file-label">导入文本文件<input id="import-file" type="file" accept=".txt,.json,.md,.csv"></label><small>原始记录不写入角色档案；提炼过程会发送给 DSH 模型并保留在 DSH 会话中。</small><button class="primary" data-action="extract">提炼角色 ${icon('spark')}</button></div><div id="extract-status" class="status-line" role="status"></div>`);}
function settings(){
  const inRoom=view==='chat';
  showModal(inRoom?'这场聚会的设置':'浮岛设置','离开可以随时回来，解散会让这场聚会停止。',`<p>${state.connected?'已接入 DSH Web，角色使用宿主的模型与凭据。':'当前是界面预览。运行 start.bat / start.sh 接入 DSH Web 后，角色才会回复。'}</p>${inRoom&&state.error?`<div class="error-note">${esc(state.error)}<br>后台稍后重试，也可以在 DSH Web 检查模型或权限。</div>`:''}<div class="fields"><div><label for="identity-name">你在聚会里的名字</label><input id="identity-name" maxlength="30" value="${esc(userName)}"></div><div><label for="timezone">消息显示时区</label><input id="timezone" value="${esc(inRoom?state.timezone:timezone)}" ${inRoom?'readonly':''}></div><div class="wide"><label for="topic">开场话题</label><input id="topic" maxlength="200" value="${esc(inRoom?state.topic:topic)}" ${inRoom?'readonly':''}></div></div><p class="status-line">每位角色使用自己的所在地与时区安排作息，消息显示时区仅影响聊天时间的展示。</p><div class="link-box"><small>局域网访问地址 · ${esc(state.network?.adapter||'未找到物理网卡')}</small><br>${state.network?.lanUrl?`<a href="${esc(state.network.lanUrl)}" target="_blank" rel="noopener">${esc(state.network.lanUrl)}</a> <button class="text-btn" data-action="copy-url">复制地址</button>`:'连接以太网或 Wi-Fi 后重启服务。'}</div><div class="settings-actions"><button class="soft-btn" data-action="sound">${sound?'关闭消息音效':'打开消息音效'}</button>${inRoom?`<button class="soft-btn" data-action="invite" ${state.agents.length>=5?'disabled':''}>＋ 邀请新朋友</button><button class="soft-btn" data-action="pause">${state.paused?'继续聚会':'暂停聚会'}</button><a class="soft-btn" href="./api/rooms/${currentRoomId}/export" download="islet-chat.json">导出聊天与记忆</a><button class="soft-btn" data-action="home">暂时退出群聊</button>`:''}</div>${inRoom?`<p>暂时退出后，群内角色照常交流。只有暂停或解散才会停止。</p><button class="text-btn danger-text" data-dissolve="${currentRoomId}">解散并注销这个群聊 →</button>`:''}<div class="editor-footer"><small>浮岛 ISLET · 每个角色都是 AI 创作演绎</small><button class="primary" data-action="save-settings">保存设置</button></div>`,'settings');
}
function detail(index){const a=state.agents[index];if(!a)return;showModal('关于这位朋友','AI 创作演绎 · 不是本人，也不是原作中的真实对话',`<div class="character-detail">${avatar(a.avatar,76)}<div><h3>${esc(a.name)}</h3><small>${esc(a.source)}</small></div></div>${[['人物背景',a.background],['生活年代与知识边界',a.era],['性格',a.personality],['说话风格',a.style],['生活里的小事',a.habits],['所在地与当地时间',`${a.location} · ${roleClock(a.timezone)}`]].map(([k,v])=>`<div class="detail-section"><h3>${k}</h3><p>${esc(v)}</p></div>`).join('')}<div class="detail-section"><h3>在这场聚会中记得的事</h3>${a.memory.length?`<ul class="memory-list">${a.memory.map(m=>`<li>${esc(m)}</li>`).join('')}</ul>`:'<p>一些故事，会在聊天中慢慢留下。</p>'}</div><div class="editor-footer"><small>移出后可在其他聊天室重新邀请，已有聊天保留。</small><button class="text-btn danger-text" data-remove-agent="${a.id}">移出这位朋友</button></div>`);detailId=a.id;}
async function start(){
  if(submitting)return;submitting=true;render();
  try{acceptLobby(await api('rooms'));const conflict=drafts.slice(0,count).map((a,i)=>draftConflict(i)).find(Boolean);if(conflict)throw Error(conflict);const next=await api('rooms',{name:roomName,topic,timezone,agents:drafts.slice(0,count)});await enterRoom(next.id,next);beep();}
  catch(e){try{acceptLobby(await api('rooms'));}catch{}toast(e.message);}finally{submitting=false;if(view==='setup')render();}
}
async function send(){
  const input=$('#message-input'),button=$('.send'),id=currentRoomId;
  if(!input?.value.trim()||input.disabled)return;
  const text=input.value;input.disabled=true;button.disabled=true;
  try{const next=await api('messages',{text,name:userName,clientId});storage.set('message-'+id,'');accept(next);if(currentRoomId===id&&input.isConnected){input.value='';input.style.height='auto';}}
  catch(e){toast(e.message);}finally{input.disabled=false;button.disabled=false;if(currentRoomId===id&&input.isConnected)input.focus();}
}

document.addEventListener('click',async event=>{
  const button=event.target.closest('button,[data-action]');if(!button||button.disabled)return;
  try{
    if(button.dataset.enter){await enterRoom(button.dataset.enter);return;}
    if(button.dataset.removeAgent){confirmRemoveAgent(button.dataset.removeAgent);return;}
    if(button.dataset.dissolve){confirmDissolve(button.dataset.dissolve);return;}
    if(button.dataset.emoji){insertEmoji(button.dataset.emoji);return;}
    if(button.dataset.appearanceTab){switchAppearanceTab(modal,button.dataset.appearanceTab);return;}
    if(button.dataset.count){count=Number(button.dataset.count);saveDraft();render();return;}
    if(button.dataset.edit!==undefined){const i=Number(button.dataset.edit);if(draftConflict(i))openPicker(i);else openEditor(i);return;}
    if(button.dataset.choose!==undefined){openPicker(Number(button.dataset.choose));return;}
    if(button.dataset.detail!==undefined){detail(Number(button.dataset.detail));return;}
    if(button.dataset.category){pickerCategory=button.dataset.category;for(const tab of modal.querySelectorAll('[data-category]'))tab.classList.toggle('active',tab===button);renderPresets();return;}
    if(button.dataset.preset){const p=clone(presets.find(p=>p.id===button.dataset.preset));p.presetId=p.id;const conflict=selectionConflict(p,selectionOptions(pickerIndex));if(conflict)throw Error(conflict);delete p.id;openEditor(pickerIndex,p);return;}
    switch(button.dataset.action){
      case 'close':closeModal();break;
      case 'random-avatar':if(editing)randomizeAppearance(modal,editing);break;
      case 'home':goHome();break;
      case 'new-room':newRoom();break;
      case 'emoji':{const panel=$('#emoji-panel');panel.hidden=!panel.hidden;button.setAttribute('aria-expanded',String(!panel.hidden));break;}
      case 'confirm-dissolve':{const id=dissolveId;button.disabled=true;try{const next=await api(`rooms/${id}/dissolve`,{});acceptLobby(next);if(currentRoomId===id)goHome();closeModal();toast('群聊已解散，记录保留在本机归档。');}catch(e){button.disabled=false;throw e;}break;}
      case 'confirm-remove-agent':{const target=removeTarget;if(!target)return;button.disabled=true;try{accept(await api(`rooms/${target.roomId}/remove-agent`,{agentId:target.agentId}));acceptLobby(await api('rooms'));closeModal();detailId=null;toast(`${target.name} 已移出，可以重新邀请。`);}catch(e){button.disabled=false;throw e;}break;}
      case 'invite':beginInvite();break;
      case 'picker':openPicker(Math.max(0,drafts.slice(0,count).findIndex(a=>!a)));break;
      case 'replace':openPicker(editingIndex);break;
      case 'new-character':openEditor(pickerIndex,{name:'新朋友',source:'原创角色',background:'',personality:'温和、好奇，有自己的观点',style:'自然的短句，像朋友一样说话',habits:'读书、散步、做饭',sleepStart:23,sleepEnd:7,replySeconds:10,typingCps:4,busyProbability:.25,busyMinutes:60,initiative:.35,avatar:clone(presets[0].avatar)});break;
      case 'import':openImport();break;
      case 'settings':settings();break;
      case 'members':showModal('这场聚会里的朋友',`${state.agents.length} 位 AI 朋友，还有你。`,`<div class="members">${state.agents.map((a,i)=>`<button class="member" data-detail="${i}">${avatar(a.avatar,44)}<span><b>${esc(a.name)}</b><small>${esc(a.source)}</small></span></button>`).join('')}<button class="soft-btn" data-action="identity">我的名字 · ${esc(userName)}</button><button class="soft-btn" data-action="invite" ${state.agents.length>=5?'disabled':''}>＋ 邀请新朋友</button></div>`);break;
      case 'identity':showModal('你也是故事的一部分','取一个朋友们会记住的名字。',`<label for="identity-name">你的名字</label><input id="identity-name" maxlength="30" value="${esc(userName)}"><div class="editor-footer"><small>仅更改本设备的称呼</small><button class="primary" data-action="save-settings">保存名字</button></div>`,'settings');break;
      case 'save-settings':{
        const nextZone=$('#timezone')?.value||timezone;try{new Intl.DateTimeFormat('en',{timeZone:nextZone}).format();}catch{throw Error('时区无效，例如 Asia/Shanghai。');}
        userName=$('#identity-name')?.value.trim()||'我';storage.set('name',userName);if(view!=='chat'){timezone=nextZone;topic=$('#topic')?.value||topic;saveDraft();}saveMessageDraft();closeModal();render();toast('已保存');break;
      }
      case 'start':await start();break;
      case 'sound':sound=!sound;storage.set('sound',sound?'on':'off');if(sound)beep();if(modal.open&&$('#timezone'))settings();else{const t=$('[data-action="sound"]',app);if(t)t.textContent=sound?'声音已开':'声音已关';}toast(sound?'消息音效已开启':'消息音效已关闭');break;
      case 'pause':accept(await api('pause',{paused:!state.paused}));if(modal.open)settings();break;
      case 'topic':$('#message-input').value=state.topic;$('#message-input').focus();break;
      case 'copy-url':try{await navigator.clipboard.writeText(state.network.lanUrl);toast('局域网地址已复制');}catch{toast('请长按或选中地址复制');}break;
      case 'older':{const el=$('#messages'),height=el.scrollHeight,scroll=el.scrollTop;visibleLimit+=200;updateChat(true);el.scrollTop=el.scrollHeight-height+scroll;break;}
      case 'extract':{
        const text=$('#extract-text').value,name=$('#extract-name').value;button.disabled=true;$('#extract-status').textContent='正在通过 DSH 读懂这个人… 请稍候。';
        try{const a=await api('extract',{text,name});a.avatar=clone(drafts[pickerIndex]?.avatar||presets[0].avatar);openEditor(pickerIndex,a);}catch(e){$('#extract-status').textContent=e.message;button.disabled=false;}break;
      }
    }
  }catch(e){toast(e.message);}
});
document.addEventListener('submit',event=>{if(event.target.id==='composer'){event.preventDefault();send();}if(event.target.id==='character-form'){event.preventDefault();const conflict=selectionConflict(editing,selectionOptions(editingIndex));if(conflict){toast(conflict);return;}const form=new FormData(event.target);try{new Intl.DateTimeFormat('en',{timeZone:String(form.get('timezone'))}).format();}catch{toast('请选择有效城市，或填写正确的 IANA 时区。');return;}for(const key of ['name','background','era','personality','style','habits','location','timezone'])editing[key]=String(form.get(key)||'').trim();for(const key of ['sleepStart','sleepEnd','replySeconds','typingCps','busyMinutes','initiative'])editing[key]=Number(form.get(key));editing.busyProbability=Number(form.get('busyProbability'))/100;if(inviteRoomId){joinInvitedCharacter(clone(editing),event.submitter);return;}editing.ready=true;drafts[editingIndex]=clone(editing);saveDraft();closeModal();render();toast(`${editing.name} 准备好了`);}});
document.addEventListener('input',event=>{const el=event.target;if(el.id==='room-name'){roomName=el.value;saveDraft();}if(el.id==='preset-search'){pickerSearch=el.value;renderPresets();}if(el.dataset.avatar){editing.avatar[el.dataset.avatar]=el.dataset.avatar==='hairStyle'?Number(el.value):el.value;refreshAppearance(modal,editing.avatar);}if(el.id==='char-timezone')$('#role-clock').textContent=roleClock(el.value);if(el.id==='initiative')$('#initiative-value').textContent=Math.round(Number(el.value)*100)+'%';if(el.id==='message-input'){el.style.height='auto';el.style.height=Math.min(130,el.scrollHeight)+'px';}});
document.addEventListener('change',async event=>{const el=event.target;if(el.id==='picker-slot')pickerIndex=Number(el.value);if(el.id==='location-city'){const p=locations.find(p=>p.id===el.value);if(p){$('#char-location').value=p.name;$('#char-timezone').value=p.timezone;$('#role-clock').textContent=roleClock(p.timezone);}}if(el.id==='import-file'){const file=el.files[0];if(!file)return;if(file.size>240000){toast('文件太大，请截取 60000 字以内的代表性记录。');return;}$('#extract-text').value=(await file.text()).slice(0,60000);}});
document.addEventListener('keydown',event=>{if(event.target.dataset.appearanceTab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const tabs=[...modal.querySelectorAll('[data-appearance-tab]')],i=tabs.indexOf(event.target),next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;switchAppearanceTab(modal,tabs[next].dataset.appearanceTab,{focus:true});}if(event.key==='Escape')hideEmoji();if(event.target.id==='message-input'&&event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();send();}});
modal.addEventListener('close',()=>{detailId=null;inviteRoomId=null;});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
async function init(){
  try{
    [lobby,presets]=await Promise.all([api('rooms'),api('presets')]);readMarkers=seedReadMarkers(readMarkers,lobby.rooms);storage.set('read-markers',JSON.stringify(readMarkers));state=blankState();
    drafts=defaultDrafts();
    try{const saved=JSON.parse(storage.get('draft','null'));if(saved&&Array.isArray(saved.drafts)&&saved.count>=1&&saved.count<=5){drafts=saved.drafts.map(a=>a?{...defaultLocation(a.presetId||a.id),...a}:a);count=saved.count;roomName=saved.roomName;topic=saved.topic;timezone=saved.timezone||timezone;}}catch{}
    await route();
    const events=new EventSource('./api/events');
    events.addEventListener('rooms',e=>{connected=true;acceptLobby(JSON.parse(e.data));});
    events.onopen=()=>{connected=true;connectionLabel();};events.onerror=()=>{connected=false;connectionLabel();};
  }catch(e){app.innerHTML=`<div class="loading">连接暂时没有准备好。请刷新重试。<br>${esc(e.message)}</div>`;}
}

function blankState(){return{started:false,connected:lobby.connected,network:lobby.network,messages:[],agents:[],typing:[],timezone};}
function defaultDrafts(){return [...new Set([presets[25],presets[35],presets[0],...presets])].filter(p=>p&&!selectionConflict({...p,presetId:p.id},{occupiedCharacters:lobby.occupiedCharacters||[]})).slice(0,3).map(p=>({...clone(p),presetId:p.id,ready:false}));}
function selectionOptions(slot){return{occupiedCharacters:lobby.occupiedCharacters||[],drafts:inviteRoomId?state.agents:drafts.slice(0,count),slot:inviteRoomId?-1:slot};}
function draftConflict(i){return selectionConflict(drafts[i],selectionOptions(i));}
function connectionLabel(){const el=$('.connection-label');if(el)el.textContent=!connected?'正在重连':state.connected?'本地小世界':'界面预览';const dot=$('.top-actions .dot');if(dot)dot.classList.toggle('off',!connected||!state.connected);}
function acceptLobby(next){
  const availabilityChanged=JSON.stringify(lobby.occupiedCharacters)!==JSON.stringify(next.occupiedCharacters);lobby=next;readMarkers=seedReadMarkers(mergeReadMarkers(readMarkers,loadReadMarkers()),lobby.rooms);storage.set('read-markers',JSON.stringify(readMarkers));
  if(view!=='chat'){state.connected=next.connected;state.network=next.network;}
  if(view==='home'&&$('#room-list')){
    $('#room-list').innerHTML=roomCards(lobby.rooms,{avatar,esc,icon,presetCount:presets.length,readMarkers});
    $('.lobby-heading .counter').textContent=lobby.rooms.length+' 个小世界';
  }
  if(availabilityChanged&&view==='setup')render();if(availabilityChanged&&modal.open&&$('#preset-grid'))renderPresets();
  connectionLabel();
}
function goHome(updateUrl=true){
  readCurrentRoom();saveMessageDraft();
  routeVersion++;roomEvents?.close();roomEvents=null;currentRoomId=null;view='home';state=blankState();
  closeModal();if(updateUrl&&location.hash)history.pushState(null,'',location.pathname+location.search);render();
}
function newRoom(updateUrl=true){
  saveMessageDraft();
  routeVersion++;roomEvents?.close();roomEvents=null;currentRoomId=null;view='setup';state=blankState();
  closeModal();if(updateUrl&&location.hash!=='#new')history.pushState(null,'','#new');render();
}
async function enterRoom(id,prepared){
  const request=++routeVersion;
  try{
    const next=prepared||await api(`rooms/${encodeURIComponent(id)}/state`);
    if(request!==routeVersion)return;
    saveMessageDraft();roomEvents?.close();currentRoomId=id;state=next;view='chat';readCurrentRoom();visibleLimit=200;
    closeModal();if(location.hash!==`#room=${id}`)history.pushState(null,'',`#room=${id}`);render();$('#message-input').value=storage.get('message-'+id,'');
    const stream=new EventSource(`./api/rooms/${id}/events`);roomEvents=stream;
    for(const type of ['state','typing'])stream.addEventListener(type,e=>{if(currentRoomId===id)accept(JSON.parse(e.data));});
    stream.addEventListener('dissolved',()=>{if(currentRoomId===id){goHome();toast('这个群聊已解散。');}});
    stream.onerror=()=>{if(currentRoomId===id){connected=false;connectionLabel();}};
    stream.onopen=()=>{if(currentRoomId===id){connected=true;connectionLabel();}};
  }catch(e){if(request===routeVersion){goHome();toast(e.message);}}
}
async function route(){const match=location.hash.match(/^#room=([a-f\d-]{36})$/i);if(match){if(match[1]!==currentRoomId||view!=='chat')await enterRoom(match[1]);}else if(location.hash==='#new')newRoom(false);else goHome(false);}
window.addEventListener('popstate',route);
window.addEventListener('hashchange',route);
function confirmDissolve(id){
  const room=lobby.rooms.find(r=>r.id===id)||(id===currentRoomId?state:null);if(!room)return;
  dissolveId=id;
  showModal('解散并注销群聊？',room.name,`<p class="status-line">解散后，所有角色停止活动，群聊从主页移除，其他设备也会退出这个群聊。聊天与记忆在本机保留归档。</p><p class="status-line">如果只是暂时离开，请返回主页，群内对话会继续。</p><div class="editor-footer"><button class="soft-btn" data-action="close">保留群聊</button><button class="primary danger-btn" data-action="confirm-dissolve">解散这个群聊</button></div>`,'settings');
}
function roleClock(zone){try{return'此刻当地时间 · '+new Intl.DateTimeFormat('zh-CN',{timeZone:zone,month:'long',day:'numeric',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format();}catch{return'请选择有效的当地时区';}}
function emojiPicker(){return emojiGroups.map(([name,list])=>`<section><h3>${name}</h3><div class="emoji-grid">${list.map(e=>`<button type="button" data-emoji="${e}" aria-label="插入 ${e}">${e}</button>`).join('')}</div></section>`).join('');}
function hideEmoji(){const panel=$('#emoji-panel');if(panel)panel.hidden=true;const button=$('[data-action="emoji"]');if(button)button.setAttribute('aria-expanded','false');}
function saveMessageDraft(){const input=$('#message-input');if(currentRoomId&&input)storage.set('message-'+currentRoomId,input.value);}
window.addEventListener('pagehide',saveMessageDraft);
function insertEmoji(emoji){const input=$('#message-input');if(!input||input.disabled)return;const start=input.selectionStart,end=input.selectionEnd;if(input.value.length-(end-start)+emoji.length>3000){toast('消息已达到长度上限。');return;}input.setRangeText(emoji,start,end,'end');input.dispatchEvent(new Event('input',{bubbles:true}));input.focus();}
document.addEventListener('click',event=>{if(!event.target.closest('.emoji-panel,[data-action="emoji"]'))hideEmoji();});

init();

function confirmRemoveAgent(id){
  const a=state.agents.find(a=>a.id===id);if(!a)return;
  removeTarget={roomId:currentRoomId,agentId:a.id,name:a.name};
  showModal('移出这位朋友？',a.name,`<p class="status-line">会取消 TA 尚未发送的回复。已有聊天保留，人物资料和记忆在本机归档，随后可在其他聊天室重新邀请。</p><div class="editor-footer"><button class="soft-btn" data-action="close">留在群聊</button><button class="primary danger-btn" data-action="confirm-remove-agent">确认移出</button></div>`,'settings');
}

function loadReadMarkers(){try{const value=JSON.parse(storage.get('read-markers','{}'));return value&&typeof value==='object'&&!Array.isArray(value)?mergeReadMarkers({},value):{};}catch{return{};}}
function readCurrentRoom(){if(view!=='chat'||!currentRoomId||document.visibilityState!=='visible'||state.id!==currentRoomId)return;readMarkers=markRoomRead(mergeReadMarkers(readMarkers,loadReadMarkers()),state);storage.set('read-markers',JSON.stringify(readMarkers));}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')readCurrentRoom();});
window.addEventListener('storage',event=>{if(event.key!=='islet-read-markers')return;readMarkers=mergeReadMarkers(readMarkers,loadReadMarkers());if(view==='home'&&$('#room-list'))$('#room-list').innerHTML=roomCards(lobby.rooms,{avatar,esc,icon,presetCount:presets.length,readMarkers});});

function beginInvite(){if(view!=='chat'||!currentRoomId)return;if(state.agents.length>=5){toast('每群最多 5 位角色，请先移出一位朋友。');return;}inviteRoomId=currentRoomId;openPicker(state.agents.length);}
async function joinInvitedCharacter(role,button){
  if(inviting)return;const id=inviteRoomId;if(!id)return;inviting=true;if(button)button.disabled=true;
  try{const next=await api(`rooms/${id}/add-agents`,{agents:[role]});accept(next);acceptLobby(await api('rooms'));closeModal();toast(`${role.name} 加入了聊天室。`);}
  catch(e){try{acceptLobby(await api('rooms'));}catch{}toast(e.message);}finally{inviting=false;if(button?.isConnected)button.disabled=false;}
}

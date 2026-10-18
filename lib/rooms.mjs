import { randomUUID } from 'node:crypto';
import { access,mkdir,readFile,writeFile,rename,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createStore } from './store.mjs';
import { createRoom,characterSkill } from './room.mjs';
import { defaultLocation } from '../public/locations.js';
import { clipText } from '../public/text.js';
import { normalizeAppearance } from '../public/appearance.js';
import {characterKey,characterId} from '../public/lobby.js';
import {presetEra} from './presets.mjs';

const validId=id=>typeof id==='string'&&/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
export async function createRoomManager({dataDir,backend,baseSkill,emit=()=>{},autoTick=true,roomOptions={}}) {
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const indexPath=join(dataDir,'rooms.json'),records=new Map();
  let index,closed=false,pending=Promise.resolve(),mutations=Promise.resolve();
  const mutate=action=>{
    const work=mutations.catch(()=>{}).then(()=>{if(closed)throw Error('聊天室服务正在关闭。');return action();});
    mutations=work;return work;
  };
  try {
    index=JSON.parse(await readFile(indexPath,'utf8'));
    if(index.version!==1||!Array.isArray(index.rooms)||index.rooms.some(r=>!validId(r.id))||new Set(index.rooms.map(r=>r.id)).size!==index.rooms.length)throw Error('不支持的群聊列表格式');
  }catch(e){if(e.code!=='ENOENT')throw Error(`无法读取群聊列表，原数据已保留：${e.message}`);index={version:1,migrated:false,rooms:[]};}
  async function saveIndex() {
    const snapshot=JSON.stringify(index,null,2);
    const work=pending.catch(()=>{}).then(async()=>{
      const temp=join(dataDir,`.rooms-${randomUUID()}.tmp`);
      try{await writeFile(temp,snapshot,{mode:0o600});await rename(temp,indexPath);}finally{await rm(temp,{force:true});}
    });pending=work;await work;
  }
  const notify=(type,id)=>{if(!closed)emit(type,id);};
  function mount(store) {
    const id=store.state.id;
    const room=createRoom({store,backend,baseSkill,...roomOptions,autoTick,emit:type=>notify(type,id)});
    const record={store,room};records.set(id,record);return record;
  }
  function fillLocations(state) {
    for(const a of state.agents){if(!validId(a.id))throw Error('角色 ID 无效，原文件已保留。');a.characterId=a.presetId?null:characterId(a)||a.id;a.era||=presetEra(a.presetId);const place=defaultLocation(a.presetId);a.location||=place.location;a.timezone||=place.timezone;new Intl.DateTimeFormat('en',{timeZone:a.timezone}).format();a.avatar=normalizeAppearance(a.avatar);a.skill=characterSkill(a);}
  }
  async function saveSkills(store){
    for(const a of store.state.agents){const dir=join(store.directory,'skills',a.id);await mkdir(dir,{recursive:true,mode:0o700});await writeFile(join(dir,'SKILL.md'),a.skill,{mode:0o600});}
  }
  // Preserve the original single-room file during the one-time migration.
  if(!index.migrated) {
    let legacy;
    try{legacy=JSON.parse(await readFile(join(dataDir,'room.json'),'utf8'));if(legacy.version!==1||!Array.isArray(legacy.agents)||!Array.isArray(legacy.messages))throw Error('旧版存档格式无效');}
    catch(e){if(e.code!=='ENOENT')throw Error(`无法迁移旧群聊，原文件已保留：${e.message}`);}
    if(legacy?.started||legacy?.agents.length||legacy?.messages.length) {
      const id=randomUUID(),store=await createStore(join(dataDir,'rooms',id));
      Object.assign(store.state,legacy,{id});fillLocations(store.state);await store.save();
      index.rooms.push({id,createdAt:legacy.createdAt||Date.now()});
    }
    index.migrated=true;await saveIndex();
  }
  try {
    for(const entry of index.rooms.filter(r=>!r.dissolvedAt)) {
      await access(join(dataDir,'rooms',entry.id,'room.json'));
      const store=await createStore(join(dataDir,'rooms',entry.id));
      if(store.state.dissolvedAt){entry.dissolvedAt=store.state.dissolvedAt;await saveIndex();continue;}
      store.state.id=entry.id;fillLocations(store.state);await saveSkills(store);await store.save();mount(store);
    }
  }catch(e){await Promise.all([...records.values()].map(r=>r.room.close()));throw e;}
  function get(id) {
    const record=validId(id)&&records.get(id);
    if(!record){const e=Error('这个群聊已解散或不存在。');e.status=404;throw e;}return record;
  }
  function occupiedCharacters() {
    return [...records.values()].flatMap(({store})=>store.state.agents.map(a=>({key:characterKey(a),roomId:store.state.id,roomName:store.state.name,agentId:a.id,name:a.name}))).filter(a=>a.key);
  }
  function assertAvailable(agents) {
    const occupied=occupiedCharacters(),selected=new Set();
    for(const a of agents){
      const key=characterKey(a),existing=occupied.find(p=>p.key===key);
      if(selected.has(key)||existing){const error=Error(existing?`${a.name} 已加入「${existing.roomName}」，请先移出角色或解散该群聊。`:`${a.name} 不能在同一群聊中重复加入。`);error.status=409;throw error;}
      selected.add(key);
    }
  }
  return {
    get,occupiedCharacters,
    list(){return [...records.values()].map(({room})=>{
      const s=room.snapshot(),last=s.messages.at(-1);
      return {id:s.id,name:s.name,topic:s.topic,createdAt:s.createdAt,paused:s.paused,started:s.started,
        messageCount:s.messages.length,updatedAt:last?.at||s.createdAt,
        lastMessage:last?{name:last.name,text:clipText(last.text,160),at:last.at}:null,
        agents:s.agents.map(({id,characterId,presetId,name,avatar,location,timezone})=>({id,characterId,presetId,name,avatar,location,timezone}))};
    }).sort((a,b)=>b.updatedAt-a.updatedAt);},
    create(input) {return mutate(async()=>{
      const id=randomUUID(),store=await createStore(join(dataDir,'rooms',id));store.state.id=id;
      const room=createRoom({store,backend,baseSkill,...roomOptions,autoTick:false});
      try{await room.configure(input);assertAvailable(store.state.agents);await room.start();}
      catch(e){await room.close();throw e;}
      await room.close();
      index.rooms.push({id,createdAt:store.state.createdAt});
      try{await saveIndex();}catch(e){index.rooms.pop();throw e;}
      const record=mount(store);notify('rooms',id);return record;
    });},
    removeAgent(id,agentId) {return mutate(async()=>{
      await get(id).room.removeAgent(agentId);notify('rooms',id);
    });},
    addAgents(id,input) {return mutate(async()=>{
      await get(id).room.addAgents(input.agents,assertAvailable);notify('rooms',id);
    });},
    dissolve(id) {return mutate(async()=>{
      const record=get(id),entry=index.rooms.find(r=>r.id===id);
      // Retain the full directory as a local archive, but never schedule it again.
      await record.room.close();
      record.store.state.dissolvedAt=Date.now();await record.store.save();
      entry.dissolvedAt=record.store.state.dissolvedAt;
      await saveIndex();records.delete(id);notify('dissolved',id);
    });},
    async extract(input) {
      const temp=createRoom({store:{state:{},directory:dataDir,flush:async()=>{}},backend,baseSkill,autoTick:false});
      return temp.extract(input);
    },
    async close(){closed=true;await mutations.catch(()=>{});await Promise.all([...records.values()].map(r=>r.room.close()));await pending;}
  };
}

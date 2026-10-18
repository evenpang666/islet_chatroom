import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRoomManager } from '../lib/rooms.mjs';
import { createStore } from '../lib/store.mjs';
import { normalizeAgent,isSleeping,characterSkill } from '../lib/room.mjs';
import { presets } from '../lib/presets.mjs';
import { clipText,firstGrapheme,textLength } from '../public/text.js';

const timestamp=Date.parse('2026-10-18T04:00:00Z');
const agent=(index=0)=>({...presets[index],presetId:presets[index].id,sleepStart:0,sleepEnd:0,replySeconds:1,typingCps:12,busyProbability:0});
async function fixture(t,options={}) {
  const dataDir=await mkdtemp(join(tmpdir(),'islet-rooms-'));let clock=timestamp;
  const config={dataDir,baseSkill:'Common skill',autoTick:false,backend:{connected:true,run:async({title})=>({reply:true,text:title.includes('甲')?'甲的消息 👋':'乙的消息 ☕',memory:[title]})},roomOptions:{now:()=>clock,random:()=>.5},...options};
  const manager=await createRoomManager(config);t.after(()=>manager.close());return{manager,dataDir,config,time:v=>clock=v};
}
test('each preset has an editable location and valid IANA timezone',()=>{
  for(const p of presets){assert.ok(p.location);assert.doesNotThrow(()=>new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format());}
  const einstein=normalizeAgent({...presets[25],presetId:'einstein'});assert.equal(einstein.location,'美国 · 普林斯顿');assert.equal(einstein.timezone,'America/New_York');assert.match(characterSkill(einstein),/当地时区/);
  assert.throws(()=>normalizeAgent({...agent(),timezone:'Moon/Invalid'}),/时区无效/);
});
test('same UTC moment produces different role activities, including DST transitions',()=>{
  assert.ok(isSleeping({sleepStart:23,sleepEnd:7,timezone:'America/New_York'},timestamp,'Asia/Shanghai'));
  assert.equal(isSleeping({sleepStart:23,sleepEnd:7,timezone:'Asia/Shanghai'},timestamp,'America/New_York'),false);
  const us={sleepStart:1,sleepEnd:3,timezone:'America/New_York'};
  assert.ok(isSleeping(us,Date.parse('2026-11-01T05:30:00Z'),'UTC'));
  assert.ok(isSleeping(us,Date.parse('2026-11-01T06:30:00Z'),'UTC'));
  assert.equal(isSleeping(us,Date.parse('2026-11-01T08:30:00Z'),'UTC'),false);
});
test('two rooms converse autonomously without any users or SSE clients and keep memories isolated',async t=>{
  const f=await fixture(t);const a=await f.manager.create({name:'甲的小世界',agents:[agent()]});const b=await f.manager.create({name:'乙的小世界',agents:[agent(1)]});
  f.time(timestamp+60000);await Promise.all([a.room.tick(),b.room.tick()]);
  assert.equal(a.room.snapshot().messages.length,1);assert.equal(b.room.snapshot().messages.length,1);
  assert.match(a.room.snapshot().messages[0].text,/甲/);assert.match(b.room.snapshot().messages[0].text,/乙/);
  assert.ok(!a.room.snapshot().agents[0].memory.join().includes('乙'));assert.ok(!b.room.snapshot().agents[0].memory.join().includes('甲'));
  assert.equal(f.manager.list().length,2);
});
test('autonomous conversation resumes after an agent-only burst, without a user restart',async t=>{
  let calls=0;const f=await fixture(t,{backend:{connected:true,run:async()=>{calls++;return{reply:false};}}});
  const {room,store}=await f.manager.create({agents:[agent()]});
  store.state.messages=Array.from({length:6},(_,i)=>({id:'old-'+i,kind:'agent',agentId:store.state.agents[0].id,name:'角色',text:'自主聊天',at:timestamp}));
  f.time(timestamp+61000);await room.tick();assert.equal(calls,1);
  f.time(timestamp+20*60000);await room.tick();assert.equal(calls,2);
});
test('room messages, local zones and paused state survive service restart',async t=>{
  const f=await fixture(t);const {room}=await f.manager.create({name:'保留的聚会',agents:[agent(25)]});const id=room.snapshot().id;
  await room.message({text:'你好 👨‍👩‍👧‍👦 🇨🇳',name:'小林'});await room.pause(true);await f.manager.close();
  const reopened=await createRoomManager(f.config);t.after(()=>reopened.close());const restored=reopened.get(id).room.snapshot();
  assert.equal(restored.messages[0].text,'你好 👨‍👩‍👧‍👦 🇨🇳');assert.equal(restored.agents[0].timezone,'America/New_York');assert.ok(restored.paused);
});
test('dissolution cancels in-flight work and removes the room permanently from scheduling',async t=>{
  let aborted=false;const f=await fixture(t,{backend:{connected:true,run:({signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));},{once:true}))}});
  const {room}=await f.manager.create({agents:[agent()]});const id=room.snapshot().id;f.time(timestamp+60000);
  const work=room.tick();await new Promise(r=>setTimeout(r,20));await f.manager.dissolve(id);await work;
  assert.ok(aborted);assert.equal(f.manager.list().length,0);assert.throws(()=>f.manager.get(id),/已解散/);
  const saved=JSON.parse(await readFile(join(f.dataDir,'rooms',id,'room.json'),'utf8'));assert.ok(saved.dissolvedAt);assert.equal(saved.messages.length,0);
  const restarted=await createRoomManager(f.config);t.after(()=>restarted.close());assert.equal(restarted.list().length,0);
});
test('single-room data migrates exactly once, preserving original data and role memories',async t=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-migrate-')),legacy=await createStore(dataDir);
  legacy.state.started=true;legacy.state.paused=true;legacy.state.agents=[normalizeAgent(agent(25))];legacy.state.agents[0].memory=['旧约定'];legacy.state.messages=[{id:'legacy',kind:'user',name:'我',text:'旧聊天 🙂',at:timestamp}];await legacy.save();
  const original=await readFile(join(dataDir,'room.json'),'utf8');const config={dataDir,baseSkill:'skill',autoTick:false};
  const migrated=await createRoomManager(config);const id=migrated.list()[0].id;assert.deepEqual(migrated.get(id).room.snapshot().agents[0].memory,['旧约定']);await migrated.close();
  const again=await createRoomManager(config);t.after(()=>again.close());assert.equal(again.list().length,1);assert.equal(again.list()[0].id,id);assert.equal(await readFile(join(dataDir,'room.json'),'utf8'),original);
});
test('invalid room creation never appears in list, and IDs cannot escape the data directory',async t=>{
  const f=await fixture(t);await assert.rejects(f.manager.create({agents:[{name:'未完成'}]}),/背景/);assert.equal(f.manager.list().length,0);assert.throws(()=>f.manager.get('../../room'),/不存在/);
});
test('corrupt room registry is preserved and never silently replaced',async()=>{
  const dataDir=await mkdtemp(join(tmpdir(),'islet-registry-'));await writeFile(join(dataDir,'rooms.json'),'broken');await assert.rejects(createRoomManager({dataDir}),/原数据已保留/);assert.equal(await readFile(join(dataDir,'rooms.json'),'utf8'),'broken');
});
test('emoji truncation preserves entire flags, skin tones and ZWJ families',()=>{
  assert.equal(firstGrapheme('👨‍👩‍👧‍👦 hello'),'👨‍👩‍👧‍👦');assert.equal(textLength('👩🏽‍💻🇨🇳❤️'),3);assert.equal(clipText('abc👨‍👩‍👧‍👦xyz',10),'abc');assert.equal(clipText('😊😊',3),'😊');
});

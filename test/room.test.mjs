import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,readdir,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../lib/store.mjs';
import { createRoom,isSleeping,normalizeAgent } from '../lib/room.mjs';
import { presets } from '../lib/presets.mjs';

const daytime=Date.parse('2026-10-18T04:00:00Z');
async function fixture(options={}) {
  const dir=await mkdtemp(join(tmpdir(),'islet-test-')),store=await createStore(dir);
  let clock=daytime,calls=[];
  const backend={connected:true,run:async req=>{calls.push(req);return {reply:false,memory:['大家喜欢喝茶。']};},...options.backend};
  const {backend:backendOptions,...roomOptions}=options;
  const room=createRoom({store,backend,baseSkill:'Shared skill',now:()=>clock,random:()=>.9,autoTick:false,...roomOptions});
  await room.configure({agents:[{...presets[25],presetId:'einstein',sleepStart:23,sleepEnd:7,timezone:'Asia/Shanghai'}],timezone:'Asia/Shanghai'});
  return {dir,store,room,calls,backend,time:v=>clock=v};
}
test('100 unique preset characters have complete individual contracts',()=>{
  assert.equal(presets.length,100);assert.equal(new Set(presets.map(a=>a.id)).size,100);
  for(const a of presets)for(const key of ['background','style','personality','habits','source'])assert.ok(a[key]);
});
test('sleep crosses midnight, honors room timezone and can be disabled',()=>{
  const a={sleepStart:23,sleepEnd:7};assert.equal(isSleeping(a,daytime,'Asia/Shanghai'),false);
  assert.equal(isSleeping(a,Date.parse('2026-10-18T16:00:00Z'),'Asia/Shanghai'),true);
  assert.equal(isSleeping({...a,sleepStart:7},daytime,'Asia/Shanghai'),false);
  assert.equal(isSleeping(a,daytime,'America/New_York'),true);
});
test('rejects incomplete rooms and agent counts above five',async()=>{
  const {room}=await fixture();await assert.rejects(room.configure({agents:[]}),/1–5/);
  await assert.rejects(room.configure({agents:Array(6).fill(presets[0])}),/1–5/);
  await assert.rejects(room.configure({agents:[{name:'a'}]}),/背景/);await room.close();
});
test('all role skills exist before starting; private runtime is never public',async()=>{
  const {room,store,dir}=await fixture();await assert.rejects(room.message({text:'hi'}),/准备好/);
  await room.start();const a=store.state.agents[0];const skill=await readFile(join(dir,'skills',a.id,'SKILL.md'),'utf8');
  assert.match(skill,/爱因斯坦/);assert.equal(room.snapshot().agents[0].runtime,undefined);assert.equal(room.snapshot().agents[0].sessionId,undefined);await room.close();
});
test('read delay, silent decision, memory persistence and reload',async()=>{
  const f=await fixture();await f.room.start();await f.room.message({text:'喝茶吗？',name:'小林',clientId:'one'});
  await f.room.tick();assert.equal(f.calls.length,0);f.time(daytime+60000);await f.room.tick();
  assert.equal(f.calls.length,1);assert.equal(f.store.state.messages.length,1);assert.deepEqual(f.store.state.agents[0].memory,['大家喜欢喝茶。']);
  const reloaded=await createStore(f.dir);assert.deepEqual(reloaded.state.agents[0].memory,['大家喜欢喝茶。']);await f.room.close();
});
test('sleeping or busy characters do not call DSH',async()=>{
  const f=await fixture();await f.room.start();await f.room.message({text:'你好'});
  f.time(Date.parse('2026-10-18T16:00:00Z'));await f.room.tick();assert.equal(f.calls.length,0);
  f.time(daytime+60000);f.store.state.agents[0].runtime.awayUntil=daytime+120000;await f.room.tick();assert.equal(f.calls.length,0);await f.room.close();
});
test('busy probability creates a persisted absence; return reads current conversation',async()=>{
  const f=await fixture({random:()=>.5});f.store.state.agents[0].busyProbability=.6;await f.room.start();await f.room.message({text:'最早的消息'});
  f.time(daytime+31*60000);await f.room.tick();const a=f.store.state.agents[0];assert.ok(a.runtime.awayUntil>daytime+31*60000);assert.equal(f.calls.length,0);
  const wake=a.runtime.awayUntil+1;await f.room.message({text:'你回来时记得这条最新消息'});a.busyProbability=0;f.time(wake);await f.room.tick();assert.match(f.calls[0].prompt,/最新消息/);await f.room.close();
});
test('typing animation precedes real message and per-role memory stays isolated',async()=>{
  const events=[];const f=await fixture({emit:e=>events.push(e),backend:{run:async()=>({reply:true,text:'嗯',memory:['明天见']})}});
  await f.room.start();f.time(daytime+60000);const work=f.room.tick();await new Promise(r=>setTimeout(r,50));
  assert.equal(f.room.snapshot().typing.length,1);assert.equal(f.store.state.messages.length,0);await work;
  assert.equal(f.room.snapshot().typing.length,0);assert.equal(f.store.state.messages[0].text,'嗯');assert.ok(events.includes('typing'));await f.room.close();
});
test('pause aborts typing; reset archives, and future ticks cannot send old messages',async()=>{
  const f=await fixture({backend:{run:async()=>({reply:true,text:'这条消息应该被取消'})}});await f.room.start();f.time(daytime+60000);
  const work=f.room.tick();await new Promise(r=>setTimeout(r,50));await f.room.pause(true);await work;assert.equal(f.store.state.messages.length,0);
  await f.room.reset();assert.equal((await readdir(join(f.dir,'archives'))).length,1);assert.equal(f.room.snapshot().started,false);await f.room.tick();assert.equal(f.store.state.messages.length,0);await f.room.close();
});
test('role failures back off and do not fabricate replies',async()=>{
  const f=await fixture({backend:{run:async()=>{throw Error('模型未配置');}}});await f.room.start();f.time(daytime+60000);await f.room.tick();
  assert.match(f.room.snapshot().error,/模型未配置/);assert.equal(f.store.state.messages.length,0);assert.equal(f.store.state.agents[0].runtime.nextAt,daytime+180000);await f.room.close();
});
test('extraction treats source as data and does not save raw transcripts',async()=>{
  const f=await fixture({backend:{run:async({prompt})=>{assert.match(prompt,/不可信文本/);return {name:'小林',background:'学生',style:'短句',personality:'温和',habits:'读书'};}}});
  const role=await f.room.extract({text:'小林：今天读了一本新书，我很喜欢里面描写雨天的细节。你最近读了什么？',name:'小林'});
  assert.equal(role.name,'小林');assert.ok(!(await readFile(join(f.dir,'room.json'),'utf8')).includes('雨天'));await f.room.close();
});
test('corrupt storage is preserved and cannot silently reset the room',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'islet-broken-'));await writeFile(join(dir,'room.json'),'{broken');await assert.rejects(createStore(dir),/原文件已保留/);
  assert.equal(await readFile(join(dir,'room.json'),'utf8'),'{broken');
});
test('invalid numeric values and malicious avatar colors are normalized',()=>{
  const a=normalizeAgent({name:'A',replySeconds:-10,typingCps:999,busyProbability:4,avatar:{skin:'<script>'}});assert.equal(a.replySeconds,1);assert.equal(a.typingCps,12);assert.equal(a.busyProbability,1);assert.equal(a.avatar.skin,'#e7b99a');
});
test('a user message arriving during typing remains unread for the next turn',async()=>{
  let calls=0;const f=await fixture({backend:{run:async()=>++calls===1?{reply:true,text:'嗯'}:{reply:false}}});await f.room.start();f.time(daytime+60000);
  const work=f.room.tick();await new Promise(r=>setTimeout(r,50));await f.room.message({text:'打字期间到达的新问题'});await work;
  f.time(daytime+120000);await f.room.tick();assert.equal(calls,2);await f.room.close();
});
test('private memories of one role are not given to another role',async()=>{
  const f=await fixture({backend:{run:async({prompt,title})=>{if(title.includes('鲁迅')){assert.ok(!prompt.includes('只有物理学家知道的约定'));return{reply:false,memory:['作家的独立记忆']};}return{reply:false,memory:['只有物理学家知道的约定']};}}});
  await f.room.configure({agents:[presets[25],presets[35]].map(a=>({...a,timezone:'Asia/Shanghai'}))});await f.room.start();f.time(daytime+60000);await f.room.tick();await f.room.tick();
  assert.deepEqual(f.store.state.agents[0].memory,['只有物理学家知道的约定']);assert.deepEqual(f.store.state.agents[1].memory,['作家的独立记忆']);await f.room.close();
});
test('long-running sessions rotate while explicit memory is retained',async()=>{
  let created=0;const f=await fixture({backend:{run:async({sessionId,onSession,prompt})=>{if(!sessionId)await onSession(`role-session-${++created}`);if(created===2)assert.match(prompt,/一直保留的约定/);return{reply:false,memory:['一直保留的约定']};}}});await f.room.start();
  for(let i=0;i<25;i++){await f.room.message({text:`第 ${i} 条消息`});f.time(daytime+(i+1)*60000);await f.room.tick();}
  assert.equal(created,2);assert.deepEqual(f.store.state.agents[0].memory,['一直保留的约定']);await f.room.close();
});
test('malformed role JSON is reported instead of silently treated as intentional silence',async()=>{
  const f=await fixture({backend:{run:async()=>({text:'missing reply field'})}});await f.room.start();f.time(daytime+60000);await f.room.tick();assert.match(f.room.snapshot().error,/格式不完整/);assert.equal(f.room.snapshot().messages.length,0);await f.room.close();
});

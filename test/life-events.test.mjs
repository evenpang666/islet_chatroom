import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sampleLifeEvent,lifeContext,eventInterval,eventCooldown,eventProbability} from '../lib/life-events.mjs';
import {createStore} from '../lib/store.mjs';
import {createRoom} from '../lib/room.mjs';
import {presets} from '../lib/presets.mjs';

test('life events roll only once per half hour, with a strict low probability and two hour cooldown',()=>{
  const r={eventCheckAt:0};let draws=0;const hit=()=>{draws++;return 0;};
  assert.equal(sampleLifeEvent(r,eventInterval-1,hit),false);assert.equal(draws,0);
  sampleLifeEvent(r,eventInterval,()=>eventProbability);assert.equal(r.lifeEvent,undefined);
  sampleLifeEvent(r,eventInterval*2,hit);assert.ok(r.lifeEvent);assert.equal(draws,2);
  const first=r.lifeEvent;assert.equal(r.eventCooldownUntil,eventInterval*2+eventCooldown);
  sampleLifeEvent(r,eventInterval*3,hit);assert.equal(draws,2);assert.equal(r.lifeEvent,first);
  sampleLifeEvent(r,eventInterval*2+eventCooldown,hit);assert.equal(draws,4);assert.notEqual(r.lifeEvent,first);
});
test('restored or overdue schedules never replay missed lottery windows; old events expire',()=>{
  const r={};let draws=0;const random=()=>{draws++;return 0;};
  sampleLifeEvent(r,eventInterval*100,random);assert.equal(draws,0);
  sampleLifeEvent(r,eventInterval*200,random);assert.equal(draws,2);
  assert.ok(lifeContext(r,eventInterval*200));assert.equal(lifeContext(r,eventInterval*204),'');
  for(let i=0;i<50;i++)sampleLifeEvent(r,eventInterval*200+1,random);
  assert.equal(draws,2);
});
async function fixture(t,{initiative=.35,run}={}){
  const dir=await mkdtemp(join(tmpdir(),'islet-events-')),store=await createStore(dir);
  const start=Date.parse('2026-10-18T02:00:00Z');let timestamp=start;const calls=[];
  const baseSkill=await readFile(new URL('../skills/SKILL.md',import.meta.url),'utf8');
  const room=createRoom({store,baseSkill,autoTick:false,now:()=>timestamp,random:()=>0,backend:{connected:true,run:async req=>{calls.push(req);return run?run(req):{reply:false,memory:['今天整理了手边的小物'],busyMinutes:10};}}});
  t.after(()=>room.close());
  await room.configure({agents:[{...presets.find(p=>p.id==='tony'),presetId:'tony',timezone:'Asia/Shanghai',busyProbability:0,initiative}]});
  await room.start();return {room,store,calls,dir,start,time:v=>timestamp=v};
}
test('a spontaneous event reaches only that character and can cause silent absence, then reads new messages on return',async t=>{
  const f=await fixture(t),a=f.store.state.agents[0];a.runtime.nextInitiativeAt=f.start+10*eventInterval;
  f.time(f.start+eventInterval);await f.room.tick();assert.equal(f.calls.length,1);
  assert.match(f.calls[0].prompt,/本轮有一次低概率突发事件机会/);assert.match(f.calls[0].prompt,/螺丝赢了/);
  assert.equal(a.runtime.lifeEvent,undefined);assert.ok(a.runtime.awayUntil>f.start+eventInterval);
  const snapshot=f.room.snapshot();assert.equal(snapshot.messages.length,0);assert.equal(snapshot.agents[0].runtime,undefined);assert.deepEqual(snapshot.agents[0].memory,['今天整理了手边的小物']);
  const saved=await createStore(f.dir);assert.equal(saved.state.agents[0].runtime.eventCooldownUntil,a.runtime.eventCooldownUntil);
  await f.room.message({text:'回来时请看这条新消息'});f.time(a.runtime.awayUntil-1);await f.room.tick();assert.equal(f.calls.length,1);
  f.time(a.runtime.awayUntil+1);await f.room.tick();assert.equal(f.calls.length,2);assert.match(f.calls[1].prompt,/回来时请看这条新消息/);
  assert.ok(!f.calls[1].prompt.includes('本轮有一次低概率突发事件机会'));
});
test('sleep, pause and ordinary absence prevent event draws; no unsolicited turn when initiative is zero',async t=>{
  const f=await fixture(t,{initiative:0}),a=f.store.state.agents[0],initial=a.runtime.eventCheckAt;
  f.time(f.start+eventInterval);await f.room.pause(true);await f.room.tick();assert.equal(a.runtime.eventCheckAt,initial);
  await f.room.pause(false);a.runtime.awayUntil=f.start+eventInterval*2;await f.room.tick();assert.equal(a.runtime.eventCheckAt,initial);
  a.runtime.awayUntil=0;a.sleepStart=0;a.sleepEnd=23;await f.room.tick();assert.equal(a.runtime.eventCheckAt,initial);
  a.sleepStart=23;a.sleepEnd=7;await f.room.tick();assert.ok(a.runtime.lifeEvent);assert.equal(f.calls.length,0);
  await f.room.message({text:'现在方便吗？'});f.time(f.start+eventInterval+10000);await f.room.tick();assert.equal(f.calls.length,1);
});
test('failed event attempts are consumed and persisted, so backoff and restart cannot repeat the prompt',async t=>{
  const f=await fixture(t,{run:()=>{throw Error('test model unavailable');}}),a=f.store.state.agents[0];
  f.time(f.start+eventInterval);await f.room.tick();assert.equal(f.calls.length,1);assert.equal(a.runtime.lifeEvent,undefined);
  const saved=await createStore(f.dir);assert.equal(saved.state.agents[0].runtime.lifeEvent,undefined);assert.ok(saved.state.agents[0].runtime.eventCooldownUntil>f.start+eventInterval);
  f.time(f.start+eventInterval+120001);await f.room.tick();assert.equal(f.calls.length,2);assert.ok(!f.calls[1].prompt.includes('本轮有一次低概率突发事件机会'));
});
